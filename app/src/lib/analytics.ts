import PostHog from 'posthog-react-native';

/**
 * Analytics.
 *
 * Zweck: sehen, wo Leute abspringen. Ohne diese Daten lässt sich der Feed
 * nicht abstimmen - man würde raten.
 *
 * Drei Regeln, die hier im Code stehen und nicht in einer Richtlinie:
 *
 * 1. KEINE personenbezogenen Daten. Kein Handle, keine E-Mail, kein
 *    Geburtsjahr, kein Kartentitel. Nur IDs, Kategorien und Zahlen. Die
 *    Zielgruppe ist teils minderjährig; was nicht rausgeht, kann nicht
 *    verloren gehen.
 * 2. Kein Session Replay. Bildschirmaufnahmen von Minderjährigen sind eine
 *    andere Kategorie als Ereigniszählung.
 * 3. Ohne Schlüssel passiert gar nichts. Die App muss ohne Analytics
 *    vollständig funktionieren - sonst ist sie von einem Dienstleister
 *    abhängig, den sie nicht braucht.
 */

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

let client: PostHog | null = null;

export function initAnalytics(): void {
  if (client || !KEY) return;
  client = new PostHog(KEY, {
    host: HOST,
    // Gebündelt senden, nicht pro Ereignis - dieselbe Logik wie beim
    // Event-Puffer: Akku und Netz schonen.
    flushAt: 20,
    flushInterval: 30_000,
    disabled: process.env.EXPO_PUBLIC_ENV === 'test',
  });
}

/**
 * Verknüpft die Ereignisse mit dem Supabase-Konto - aber nur über die UUID.
 * Keine weiteren Eigenschaften: Region und Sprache reichen zur Auswertung,
 * alles darüber hinaus wäre Sammeln auf Vorrat.
 */
export function identify(userId: string, traits?: { region?: string | null; language?: string }) {
  // PostHog akzeptiert kein undefined - leere Felder bleiben ganz weg.
  const props: Record<string, string> = {};
  if (traits?.region) props.region = traits.region;
  if (traits?.language) props.language = traits.language;
  client?.identify(userId, props);
}

export function resetIdentity() {
  client?.reset();
}

type Props = Record<string, string | number | boolean>;

function capture(event: string, props?: Props) {
  client?.capture(event, props);
}

/**
 * Die Ereignisse, die tatsächlich eine Frage beantworten. Bewusst wenige:
 * ein Ereignis, das keiner Frage zugeordnet ist, wird nie ausgewertet und
 * kostet trotzdem Kontingent.
 */
export const analytics = {
  init: initAnalytics,
  identify,
  reset: resetIdentity,

  // --- Trichter: kommt jemand überhaupt bis zum Feed? ----------------------
  appOpened: () => capture('app_opened'),
  signedIn: (method: 'anonymous' | 'email' | 'google') => capture('signed_in', { method }),
  onboardingStep: (step: number) => capture('onboarding_step', { step }),
  onboardingDone: (categories: number) => capture('onboarding_done', { categories }),

  // --- Der Kern-Loop --------------------------------------------------------
  feedLoaded: (count: number, ms: number) => capture('feed_loaded', { count, ms }),
  cardRead: (categoryId: string, dwellMs: number, difficulty: number) =>
    capture('card_read', { category: categoryId, dwell_ms: dwellMs, difficulty }),
  cardSkipped: (categoryId: string, dwellMs: number) =>
    capture('card_skipped', { category: categoryId, dwell_ms: dwellMs }),

  // --- Die entscheidende Frage: nehmen Leute das Quiz an? ------------------
  checkpointShown: (batchSize: number) => capture('checkpoint_shown', { batch: batchSize }),
  checkpointQuiz: () => capture('checkpoint_quiz_started'),
  checkpointSkipped: () => capture('checkpoint_skipped'),
  /** Tagesaufgabe beendet. Die wichtigste Zahl fuer die Bindung. */
  dailyFinished: (correct: number, total: number) =>
    capture('daily_finished', { correct, total, perfect: correct === total }),

  quizAnswered: (correct: boolean, first: boolean) =>
    capture('quiz_answered', { correct, first_try: first }),

  // --- Wiederholung: kommt jemand zurück? ----------------------------------
  reviewOpened: (due: number) => capture('review_opened', { due }),
  reviewAnswered: (correct: boolean, repetitions: number) =>
    capture('review_answered', { correct, repetitions }),

  // --- Interaktionen: welches Template funktioniert? -----------------------
  interactionSolved: (template: string, correct: boolean) =>
    capture('interaction_solved', { template, correct }),

  // --- Navigation -----------------------------------------------------------
  categoryOpened: (categoryId: string, level: number) =>
    capture('category_opened', { category: categoryId, level }),
  searched: (length: number, hits: number) => capture('searched', { length, hits }),
  sourceOpened: (sourceId: string) => capture('source_opened', { source: sourceId }),

  // --- PRO: interessiert das ueberhaupt jemanden? ---------------------------
  // Zwei Zahlen, bevor Wochen in ein Abo fliessen: wie viele sehen sich die
  // Vorschau an, und wie viele merken sich vor.
  proGeoeffnet: () => capture('pro_opened'),
  proVorgemerkt: () => capture('pro_interest'),

  // --- Das Signal, das mir am wichtigsten ist ------------------------------
  /** Hört jemand freiwillig auf, wenn die App es anbietet? */
  enoughForToday: (cardsRead: number, accepted: boolean) =>
    capture('enough_for_today', { cards_read: cardsRead, accepted }),
};
