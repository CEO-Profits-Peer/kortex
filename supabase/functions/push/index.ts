/**
 * Zustellung von Benachrichtigungen, in Sekunden statt Stunden.
 *
 * Vorher hing der Versand am GitHub-Workflow, also am Drei-Stunden-Takt:
 * "X folgt dir jetzt" kam im Schnitt anderthalb Stunden zu spaet. Diese
 * Funktion haengt stattdessen am Trigger auf `notifications` (Migration
 * 0053) und laeuft, sobald eine Zeile entsteht.
 *
 * pipeline/push.py bleibt trotzdem. Es ist jetzt das Auffangnetz: was
 * hier durchfaellt - Funktion gerade nicht erreichbar, Push-Dienst kurz
 * weg -, holt der naechste Workflow-Lauf nach. Zwei Wege auf dieselbe
 * Tabelle sind kein Widerspruch, solange beide `sent_at` respektieren,
 * und genau das tun sie.
 *
 * Warum ohne Anmeldepruefung (--no-verify-jwt)
 * -------------------------------------------
 * Der uebliche Weg waere, den Service-Key im Trigger mitzugeben. Der
 * stuende dann im Klartext in einer Migration und damit in Git - das
 * kommt nicht in Frage.
 *
 * Die Alternative kostet nichts, weil diese Funktion KEINE Eingaben
 * verarbeitet. Sie liest nicht, was im Aufruf steht; sie schaut in die
 * Tabelle und verschickt, was dort offen ist. Wer die Adresse kennt und
 * sie aufruft, loest genau das aus, was ohnehin gleich passiert waere -
 * einmal mehr abarbeiten ist kein Schaden. Es gibt keinen Parameter, mit
 * dem man ihr etwas unterschieben koennte.
 */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Wie viele pro Aufruf. Der Trigger feuert oft, also darf es wenig sein. */
const BATCH = 100;

/** Nach so vielen Fehlschlaegen fliegt ein Geraet raus - wie in push.py. */
const MAX_FAILS = 5;

type Notification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
};

type Sub = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  fail_count: number;
};

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');

  if (!url || !key || !vapidPublic || !vapidPrivate || !subject) {
    // Ausdruecklich KEIN Fehlerstatus: der Trigger soll nicht scheitern,
    // nur weil die Schluessel noch fehlen. Die Nachrichten bleiben liegen
    // und der Workflow holt sie nach.
    return json({ ok: false, reason: 'VAPID- oder Supabase-Werte fehlen' });
  }

  webpush.setVapidDetails(subject, vapidPublic, vapidPrivate);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: pending, error } = await db
    .from('notifications')
    .select('id,user_id,kind,title,body,url')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH);

  if (error) return json({ ok: false, reason: error.message }, 500);
  if (!pending?.length) return json({ ok: true, sent: 0 });

  const userIds = [...new Set(pending.map((n: Notification) => n.user_id))];
  const { data: subRows } = await db
    .from('push_subscriptions')
    .select('id,user_id,endpoint,p256dh,auth,fail_count')
    .in('user_id', userIds);

  const byUser = new Map<string, Sub[]>();
  for (const s of (subRows ?? []) as Sub[]) {
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }

  const sent: string[] = [];
  const drop: string[] = [];
  const bump = new Map<string, number>();
  let delivered = 0;

  for (const note of pending as Notification[]) {
    const targets = byUser.get(note.user_id) ?? [];
    if (!targets.length) {
      // Kein Geraet angemeldet. Trotzdem abhaken - die Meldung ist in der
      // App unter der Glocke sichtbar, und ein Stapel, der nie kleiner
      // wird, waechst bei jedem Aufruf weiter.
      sent.push(note.id);
      continue;
    }

    const payload = JSON.stringify({
      title: note.title,
      body: note.body,
      url: note.url ?? '/',
      kind: note.kind,
    });

    let ok = false;
    for (const sub of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        ok = true;
        delivered++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Endgueltig: die Anmeldung gibt es nicht mehr.
          drop.push(sub.id);
        } else {
          const next = sub.fail_count + 1;
          if (next >= MAX_FAILS) drop.push(sub.id);
          else bump.set(sub.id, next);
        }
      }
    }
    if (ok) sent.push(note.id);
  }

  if (sent.length) {
    await db.from('notifications').update({ sent_at: new Date().toISOString() }).in('id', sent);
  }
  for (const [id, fail_count] of bump) {
    await db.from('push_subscriptions').update({ fail_count }).eq('id', id);
  }
  if (drop.length) {
    await db.from('push_subscriptions').delete().in('id', drop);
  }

  return json({ ok: true, pending: pending.length, delivered, dropped: drop.length });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
