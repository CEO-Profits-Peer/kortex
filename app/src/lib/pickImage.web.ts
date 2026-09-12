/**
 * Ein Bild aussuchen - im Browser.
 *
 * Warum das nicht ueber expo-image-picker laeuft, obwohl es das dort
 * nominell gibt: dessen Web-Fassung oeffnet den Dateidialog mit einem
 * selbst gebauten MouseEvent, und davor liegt in der gemeinsamen API noch
 * eine Berechtigungsabfrage, die im Browser ohnehin immer "ja" sagt. Jedes
 * `await` davor kostet die Nutzergeste, an die der Browser das Oeffnen des
 * Dialogs knuepft - und ohne Geste passiert schlicht nichts. Kein Fehler,
 * keine Meldung, kein Dialog.
 *
 * Deshalb hier der direkte Weg: das Eingabefeld wird SYNCHRON im Klick
 * erzeugt und angeklickt, bevor irgendetwas awaitet wird. Verkleinert wird
 * mit einem Canvas, was der Browser sowieso kann.
 */

export const AVATAR_SIZE = 512;

export type PickedImage = { bytes: ArrayBuffer; ext: 'jpg' };

export function pickAvatarImage(): Promise<PickedImage | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/*';
  // Muss im Dokument haengen: manche Browser oeffnen den Dialog sonst nicht.
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);

  const file = new Promise<File | null>((resolve) => {
    let settled = false;
    const finish = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    // Abbruch im Dateidialog. Nicht jeder Browser meldet ihn.
    input.addEventListener('cancel', () => finish(null));

    /**
     * Der Rueckfall fuer die Browser, die `cancel` NICHT schicken - Safari
     * zum Beispiel.
     *
     * Hier stand vorher nur "was nie kommt, schadet auch nicht". Das war
     * falsch, und der Schaden war sichtbar: der Aufrufer setzt beim Oeffnen
     * `busy`, und `busy` wird im `finally` zurueckgenommen. Loest das
     * Versprechen nie auf, laeuft das `finally` nie - der Knopf bleibt fuer
     * den Rest der Sitzung deaktiviert, und "Profilbild aendern" tut
     * ueberhaupt nichts mehr. Ein Versprechen, das niemals antwortet, ist
     * schlimmer als eines, das Nein sagt.
     *
     * Wenn der Dialog zugeht, bekommt das Fenster den Fokus zurueck. Die
     * kurze Wartezeit danach ist noetig, weil `change` bei einer Auswahl
     * teils ERST nach dem Fokuswechsel eintrifft - ohne sie meldet dieser
     * Zweig einen Abbruch, obwohl gerade eine Datei gewaehlt wurde.
     */
    const beiFokus = () => {
      window.removeEventListener('focus', beiFokus);
      setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 600);
    };
    window.addEventListener('focus', beiFokus);
  });

  // Die echte Methode, kein nachgebautes Ereignis.
  input.click();

  return file.then((f) => (f ? toSquareJpeg(f) : null));
}

/**
 * Auf ein Quadrat bringen, verkleinern, als JPEG ausgeben.
 *
 * Zugeschnitten wird mittig - wer ein Hochformat hochlaedt, erwartet sein
 * Gesicht und nicht die obere linke Ecke.
 */
async function toSquareJpeg(file: File): Promise<PickedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    const side = Math.min(img.width, img.height);
    if (!side) throw new Error('Diese Datei ist kein Bild.');

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Der Browser kann das Bild nicht verarbeiten.');
    ctx.drawImage(
      img,
      (img.width - side) / 2,
      (img.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob) throw new Error('Das Bild liess sich nicht umwandeln.');
    return { bytes: await blob.arrayBuffer(), ext: 'jpg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Diese Datei liess sich nicht oeffnen.'));
    img.src = src;
  });
}
