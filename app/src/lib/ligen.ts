/** Private Ligen (0100): eine Wochentabelle unter Freunden. */
export type LigaZeile = {
  handle: string;
  name: string;
  avatar_seed: string;
  avatar_path: string | null;
  rahmen: string | null;
  ich: boolean;
  /** XP seit Montag 00:00 (Wien). */
  xp: number;
};

export type Liga = {
  id: string;
  name: string;
  code: string;
  /** Selbst angelegt - dann ist "Verlassen" ein Aufloesen fuer alle. */
  meine: boolean;
  wochenstart: string;
  tabelle: LigaZeile[];
};
