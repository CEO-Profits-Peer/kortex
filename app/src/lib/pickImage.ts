import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Ein Bild aussuchen und fertig verkleinert zurueckgeben.
 *
 * Diese Datei ist der Weg auf dem Handy. Der Browser hat einen eigenen
 * (pickImage.web.ts) - Metro sucht sich die passende selbst aus.
 *
 * Warum getrennt: im Browser braucht es weder expo-image-picker noch
 * expo-image-manipulator. Beide bauen dort ohnehin nur nach, was der
 * Browser von Haus aus kann - ein <input type="file"> und ein Canvas -,
 * und genau in dieser Nachbildung steckte der Fehler, wegen dem das
 * Hochladen im Web nie ankam.
 */

export const AVATAR_SIZE = 512;

export type PickedImage = { bytes: ArrayBuffer; ext: 'jpg' };

export async function pickAvatarImage(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Ohne Zugriff auf die Fotos geht es leider nicht.');

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (res.canceled || !res.assets[0]) return null;

  // Vor dem Hochladen verkleinern. Ein Handyfoto hat 4 MB und wird nie
  // groesser als 72 px angezeigt - ungefragt Freikontingent zu verbrennen
  // waere schlicht schlampig.
  const shrunk = await ImageManipulator.manipulateAsync(
    res.assets[0].uri,
    [{ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );

  const bytes = await (await fetch(shrunk.uri)).arrayBuffer();
  return { bytes, ext: 'jpg' };
}
