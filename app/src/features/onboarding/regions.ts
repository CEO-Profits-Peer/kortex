/**
 * Regionen nach ISO 3166-2.
 *
 * Der Code wandert nach profiles.region_code und steuert zwei Dinge:
 * welche lokalen Karten im Feed auftauchen (get_feed) und gegen wen man
 * auf der Rangliste antritt (get_leaderboard, scope 'region').
 */

export type Country = {
  code: string;
  label: string;
  flag: string;
  language: 'de' | 'en';
  timezone: string;
  regions: { code: string; label: string }[];
};

export const COUNTRIES: Country[] = [
  {
    code: 'AT',
    label: 'Österreich',
    flag: '🇦🇹',
    language: 'de',
    timezone: 'Europe/Vienna',
    regions: [
      { code: 'AT-1', label: 'Burgenland' },
      { code: 'AT-2', label: 'Kärnten' },
      { code: 'AT-3', label: 'Niederösterreich' },
      { code: 'AT-4', label: 'Oberösterreich' },
      { code: 'AT-5', label: 'Salzburg' },
      { code: 'AT-6', label: 'Steiermark' },
      { code: 'AT-7', label: 'Tirol' },
      { code: 'AT-8', label: 'Vorarlberg' },
      { code: 'AT-9', label: 'Wien' },
    ],
  },
  {
    code: 'DE',
    label: 'Deutschland',
    flag: '🇩🇪',
    language: 'de',
    timezone: 'Europe/Berlin',
    regions: [
      { code: 'DE-BW', label: 'Baden-Württemberg' },
      { code: 'DE-BY', label: 'Bayern' },
      { code: 'DE-BE', label: 'Berlin' },
      { code: 'DE-BB', label: 'Brandenburg' },
      { code: 'DE-HB', label: 'Bremen' },
      { code: 'DE-HH', label: 'Hamburg' },
      { code: 'DE-HE', label: 'Hessen' },
      { code: 'DE-MV', label: 'Mecklenburg-Vorpommern' },
      { code: 'DE-NI', label: 'Niedersachsen' },
      { code: 'DE-NW', label: 'Nordrhein-Westfalen' },
      { code: 'DE-RP', label: 'Rheinland-Pfalz' },
      { code: 'DE-SL', label: 'Saarland' },
      { code: 'DE-SN', label: 'Sachsen' },
      { code: 'DE-ST', label: 'Sachsen-Anhalt' },
      { code: 'DE-SH', label: 'Schleswig-Holstein' },
      { code: 'DE-TH', label: 'Thüringen' },
    ],
  },
  {
    code: 'CH',
    label: 'Schweiz',
    flag: '🇨🇭',
    language: 'de',
    timezone: 'Europe/Zurich',
    regions: [
      { code: 'CH-ZH', label: 'Zürich' },
      { code: 'CH-BE', label: 'Bern' },
      { code: 'CH-LU', label: 'Luzern' },
      { code: 'CH-BS', label: 'Basel-Stadt' },
      { code: 'CH-SG', label: 'St. Gallen' },
      { code: 'CH-GR', label: 'Graubünden' },
      { code: 'CH-TI', label: 'Tessin' },
      { code: 'CH-VD', label: 'Waadt' },
      { code: 'CH-GE', label: 'Genf' },
    ],
  },
  {
    code: 'CA',
    label: 'Canada',
    flag: '🇨🇦',
    language: 'en',
    timezone: 'America/Toronto',
    regions: [
      { code: 'CA-AB', label: 'Alberta' },
      { code: 'CA-BC', label: 'British Columbia' },
      { code: 'CA-MB', label: 'Manitoba' },
      { code: 'CA-NB', label: 'New Brunswick' },
      { code: 'CA-NL', label: 'Newfoundland and Labrador' },
      { code: 'CA-NS', label: 'Nova Scotia' },
      { code: 'CA-ON', label: 'Ontario' },
      { code: 'CA-PE', label: 'Prince Edward Island' },
      { code: 'CA-QC', label: 'Québec' },
      { code: 'CA-SK', label: 'Saskatchewan' },
    ],
  },
];
