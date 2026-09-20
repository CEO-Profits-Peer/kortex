/**
 * Update-Historie fuer /updates - aus der echten Git-Geschichte verdichtet.
 *
 * Neueste zuerst. Ein neuer Eintrag kommt OBEN dazu; `VERSION` folgt dann
 * von selbst (Fusszeile der Einstellungen). `gross` markiert die grossen
 * Schritte, die eine eigene Titelkarte bekommen - sparsam einsetzen, sonst
 * ist nichts mehr gross. LAB 3.0 kommt hier hinein, wenn es fertig ist.
 */
export type Gross = 'design' | 'lab' | 'pro' | 'start';

export type Update = {
  version: string;
  datum: string; // YYYY-MM-DD
  titel: string;
  kurz: string;
  punkte: string[];
  gross?: Gross;
};

export const UPDATES: Update[] = [
  {
    version: '2.6',
    datum: '2026-09-20',
    titel: 'Die Karte in deiner Hand',
    kurz: 'Weniger Knöpfe, mehr Gesten – und die Oberfläche spricht Englisch.',
    punkte: [
      'Aufgeräumte Karte: Vorlesen, Like, Kommentar, Teilen – der Rest im Menü',
      'Tippen hält an, langer Druck legt die Symbole um den Finger',
      'Nach links wischen: dieselbe Karte in der anderen Sprache',
      'Kartenrückseite als Alternative zum Menü, Karte als Bild zum Teilen',
      'Rahmen mit Ornamenten, freie Farbwahl und drei PRO-Rahmen',
      'Eigene Lernpfade und der Jahresrückblick als Bild (PRO)',
      'Englische Oberfläche',
    ],
  },
  {
    version: '2.5',
    datum: '2026-09-19',
    titel: 'Zuhören, fragen, dranbleiben',
    kurz: 'Lernen im Ohr, Fragen an alle – und ein Jahr, das man zurückblicken kann.',
    punkte: [
      'Anhören: Karten und Kurse wie einen Podcast, für Bus und Laufen',
      'Frage an die Community: unter Karten fragen, die beste Antwort wird markiert',
      'Monats-Abzeichen: Bronze, Silber, Gold für Lerntage im Monat',
      'Jahresrückblick: dein Jahr auf Folien, zum Teilen',
      'Lokale Karten: Themen aus deinem Bundesland, Kanton oder deiner Provinz',
      'Updates-Seite, Duelle im Profil, Wiederholen im Studio',
    ],
  },
  {
    version: '2.4',
    datum: '2026-09-19',
    titel: 'Lernen mit Plan',
    kurz: 'Von der Prüfung bis zum Lernpartner: Lernen bekommt Richtung.',
    punkte: [
      'Prüfungsmodus: Datum und Themen eintragen, die App plant bis zum Tag X',
      'Lernpfade: mehrere Kurse in einer Reihenfolge, die aufeinander aufbaut',
      'Lernpartner: zu zweit ein Wochenziel, mit Anstupsen',
      'Themenwünsche: Was oft gewünscht wird, wird zur Kartenserie',
      'Klassen-Überblick im Gruppen-Stapel – anonym',
      '„Nochmal“ bei falscher Antwort und „Dazu passt“ nach dem Quiz',
    ],
  },
  {
    version: '2.3',
    datum: '2026-09-19',
    titel: 'Gemeinsam & unterwegs',
    kurz: 'Mehr zusammen lernen – und auch ohne Netz.',
    punkte: [
      'Gruppen-Stapel: mit der Klasse Karten für eine Schularbeit sammeln',
      'Wochenrückblick jeden Sonntag, zum Teilen',
      'Offline-Vorrat: 20 Karten für U-Bahn und Tunnel',
      'Eigene Notizen an Karten, beim Wiederholen wieder da',
      'Erinnerung, bevor der Streak reißt',
      'Profil mit Waben und ein Willkommen beim ersten Start',
    ],
  },
  {
    version: 'LAB 2.0',
    datum: '2026-09-18',
    gross: 'lab',
    titel: 'Das LAB wird erwachsen',
    kurz: 'Rechnen mit echten Zahlen – für das, was im Leben wirklich zählt.',
    punkte: [
      'Neue Werkzeuge: Inflation, Brutto → Netto, Wege & CO₂, Ratenkauf, Miete, Energie',
      'Mit amtlichen Tabellen – auch für Kanada',
      'Jedes Ergebnis mit Einordnung, neuen Modi und „Schätzen“',
      'Schätz-Duell unter geteilten Ergebnissen, die sich abspielen wie ein Special',
      '„Rechnen“ direkt unter passenden Karten',
    ],
  },
  {
    version: '2.2',
    datum: '2026-09-18',
    titel: 'Meisterwege',
    kurz: 'Fortschritt, den man nicht kaufen kann.',
    punkte: [
      'Fünf Stufen je Hauptthema – nur durch Lernen',
      'Rahmen, Namensfarbe und besondere Profilbild-Farben als Belohnung',
      'Quiz mit bis zu fünf Antworten',
      'Neue Lade-Animation im Stil des Logos',
    ],
  },
  {
    version: '2.1',
    datum: '2026-09-17',
    gross: 'pro',
    titel: 'PRO',
    kurz: 'Für alle, die mehr wollen – Lernen bleibt immer kostenlos. Seit dem Start laufend ausgebaut.',
    punkte: [
      'Profilbild-Stile Metall und Glas, Profil-Themes, Saison-Rahmen',
      'Streak-Schutz, private Ligen, Beiträge planen',
      'Stapel als Anki-Datei oder PDF',
      'Vorlesen mit eigenem Tempo und eigener Stimme',
      'Reichweite je Beitrag und Lern-Heatmap',
    ],
  },
  {
    version: '2.0',
    datum: '2026-09-16',
    gross: 'design',
    titel: 'Design 2.0',
    kurz: 'Bordeaux, Gold und das Sechseck – ElyCic bekommt ein Gesicht.',
    punkte: [
      'Neue Farbwelt: Bordeaux mit Gold, sparsam gesetzt',
      'Eckige Leiste mit dem Sechseck auf dem aktiven Tab',
      'Profilbilder als Sechsecke, mit eigenem Waben-Editor',
      'Neues App-Icon',
    ],
  },
  {
    version: '1.2',
    datum: '2026-09-13',
    titel: 'Studio & Beiträge',
    kurz: 'Aus einem Feed wird eine Community.',
    punkte: [
      'Fünf Tabs: Home für Freunde, Studio zum Lernen und Erstellen',
      'Beiträge, Umfragen, Quiz und Stapel posten',
      '@Erwähnungen, Glocke und Benachrichtigungen',
      'Duelle gegen Freunde',
      'Kurse aus Wikipedia, jede Lektion geprüft',
      'Das erste LAB',
    ],
  },
  {
    version: '1.1',
    datum: '2026-09-12',
    titel: 'Karten mit Charakter',
    kurz: 'Jede Karte sieht so aus, wie ihr Inhalt ist.',
    punkte: [
      'Blaupausen-Look und Karten, die anders aussehen, weil sie anders sind',
      'Erklärkarten mit Vergleichen, Maßstäben und Schätzfragen',
      'Ein Feed, der lernt, was dich interessiert – mit Platz für Neues',
      'Ein Tutorial, das man macht statt liest',
    ],
  },
  {
    version: '1.0',
    datum: '2026-09-10',
    gross: 'start',
    titel: 'Der Anfang',
    kurz: 'Wissen in Karten, zum Wischen.',
    punkte: [
      'Der Feed: Nachrichten und Wissen, geprüft gegen die Quelle',
      'Wissenskarten aus Wikipedia',
      'Quiz, XP, Streak und Wiederholen',
      'Profilbild selbst gestalten, Kommentare, Likes',
      'Push-Benachrichtigungen',
    ],
  },
];

/** Die aktuelle App-Version: der neueste Eintrag mit reiner Versionsnummer. */
export const VERSION = UPDATES.find((u) => /^\d/.test(u.version))?.version ?? '1.0';
