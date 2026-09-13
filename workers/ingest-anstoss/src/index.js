/**
 * Der Anstoss fuer die Pipeline.
 *
 * Tut genau eine Sache: zum Zeitplan (wrangler.toml) den Workflow ingest.yml
 * auf GitHub starten - mit `zeitplan: true`, damit der Lauf sich wie ein
 * geplanter verhaelt (Kurse nur zu ihren Uhrzeiten) und im Kontrollzentrum
 * als geplant zaehlt.
 *
 * Der Token braucht nur "Actions: Read and write" fuer dieses eine Repo.
 * Mehr kann er nicht - selbst wenn er in falsche Haende geriete, liesse sich
 * damit nur ein Lauf starten, der ohnehin alle drei Stunden laeuft.
 *
 * Ein Aufruf der Worker-Adresse STARTET NICHTS. Er prueft nur, ob der Token
 * gilt, und sagt "gilt", "fehlt" oder "abgelehnt". Ohne diese Probe merkt man
 * einen abgelaufenen oder falsch kopierten Token erst daran, dass Stunden
 * lang keine Karten kommen.
 */

const REPO = 'CEO-Profits-Peer/kortex';
const WORKFLOW = 'ingest.yml';

function kopfzeilen(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub lehnt Anfragen ohne User-Agent ab.
    'User-Agent': 'elycic-ingest-anstoss',
  };
}

export default {
  async scheduled(_ereignis, env) {
    if (!env.GITHUB_TOKEN) {
      console.error('GITHUB_TOKEN fehlt - kein Anstoss. wrangler secret put GITHUB_TOKEN');
      return;
    }
    const antwort = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: { ...kopfzeilen(env.GITHUB_TOKEN), 'Content-Type': 'application/json' },
        // Eingaben gehen als Text, auch bei type: boolean.
        body: JSON.stringify({ ref: 'main', inputs: { zeitplan: 'true' } }),
      },
    );
    // 204 heisst angenommen. Alles andere steht im Worker-Log.
    if (antwort.status !== 204) {
      const text = await antwort.text().catch(() => '');
      console.error(`Anstoss abgelehnt: HTTP ${antwort.status} ${text.slice(0, 200)}`);
    }
  },

  async fetch(_anfrage, env) {
    if (!env.GITHUB_TOKEN) return Response.json({ token: 'fehlt' });
    const antwort = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`,
      { headers: kopfzeilen(env.GITHUB_TOKEN) },
    );
    return Response.json({
      token: antwort.ok ? 'gilt' : `abgelehnt (HTTP ${antwort.status})`,
    });
  },
};
