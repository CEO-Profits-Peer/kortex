/**
 * Der Name lebt AUSSCHLIESSLICH hier.
 *
 * Wenn der finale Name feststeht, aendern sich genau drei Dinge:
 *   1. diese Datei
 *   2. name / slug / scheme / bundleIdentifier / package in app.json
 *   3. die Handles '@ely-de' / '@ely-en' im Seed (supabase/seed/0002)
 *
 * Nirgendwo sonst im Code steht der Name als String. Kein Refactoring,
 * kein Suchen-und-Ersetzen quer durch die Codebasis.
 */
export const BRAND = {
  /** Anzeigename in UI, Splash, Store */
  name: 'ElyCic',
  /** Kleingeschrieben fuer URLs, Handles, Dateinamen */
  slug: 'elycic',
  /** Die Inhaltseinheit. "Ich hab heute 40 Grids gemacht." */
  unit: { one: 'Grid', many: 'Grids' },
  /** Ein Batch = 10 Grids, danach kommt der Checkpoint */
  batchLabel: 'Batch',
  domain: 'elycic.app',
  supportEmail: 'hi@elycic.app',
} as const;
