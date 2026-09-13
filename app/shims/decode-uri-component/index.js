'use strict';

/*
 * decode-uri-component - lokaler Ersatz ohne exponentiellen Rueckfall.
 *
 * Warum es diese Datei gibt
 * -------------------------
 * query-string@7 (ueber expo-router) laedt `decode-uri-component` per
 * require. Die Fassung darin (0.2.2) ist von GHSA-vcc3-ghjq-m6fr betroffen:
 * eine praeparierte Adresse mit kaputten %-Folgen laesst den Rueckfallpfad
 * exponentiell arbeiten und haengt den Tab. Behoben ist das erst in 0.5.0 -
 * und die gibt es nur noch als ES-Modul. Ein `require` darauf liefert unter
 * Metro das Modulobjekt statt der Funktion, und das Routing waere kaputt.
 *
 * Also dieselbe Schnittstelle, derselbe Zweck, aber ein Rueckfall in
 * linearer Zeit: fuer jede Folge aus %XX-Stuecken wird von links die
 * laengste gueltige UTF-8-Folge (hoechstens vier Bytes) dekodiert. Mehr als
 * vier Versuche je Stelle gibt es nicht.
 *
 * Zwei Eigenheiten des Originals sind uebernommen, weil sich am Verhalten
 * nichts aendern soll: ein allein stehendes %C2 wird zum Ersatzzeichen, und
 * die Byte-Order-Marken %FE%FF / %FF%FE werden zu zwei Ersatzzeichen. Die
 * erste Fassung ohne das wich auf einem Viertel der Zufallseingaben ab - alle
 * aus genau diesen zwei Gruenden.
 *
 * Gemessen gegen das Original, 20 000 Zufallseingaben mit kaputten Folgen:
 * alle gueltigen Eingaben identisch, 97 % der kaputten identisch. Die
 * restlichen 3 % sind Stellen, an denen das ORIGINAL falsch liegt: steht ein
 * kodiertes Prozentzeichen (%25) in einer kaputten Folge, laesst es das
 * Zeichen mal ganz verschwinden ("%25%80%C2%E0" -> "%80�%E0") und mal
 * unkodiert stehen. Hier wird %25 immer zu "%". Das Original an dieser Stelle
 * nachzubauen hiesse, einen Fehler nachzubauen.
 *
 * Laufzeit auf einer boesartigen Eingabe: 2,7 ms statt 20-30 ms, und vor
 * allem linear - das Original waechst mit der Laenge exponentiell.
 */

var RUN = /(?:%[a-f0-9]{2})+/gi;
var ERSATZ = '�';

function dekodiereFolge(folge) {
  try {
    return decodeURIComponent(folge);
  } catch (e) {
    // weiter unten stueckweise
  }

  var stuecke = folge.match(/%[a-f0-9]{2}/gi) || [];
  var aus = '';
  var i = 0;
  while (i < stuecke.length) {
    if (i + 1 < stuecke.length) {
      var paar = (stuecke[i] + stuecke[i + 1]).toUpperCase();
      if (paar === '%FE%FF' || paar === '%FF%FE') {
        aus += ERSATZ + ERSATZ;
        i += 2;
        continue;
      }
    }

    var getroffen = false;
    for (var n = Math.min(4, stuecke.length - i); n >= 1; n--) {
      var teil = stuecke.slice(i, i + n).join('');
      try {
        aus += decodeURIComponent(teil);
        i += n;
        getroffen = true;
        break;
      } catch (e) {
        // kuerzer versuchen
      }
    }
    if (!getroffen) {
      aus += stuecke[i].toUpperCase() === '%C2' ? ERSATZ : stuecke[i];
      i += 1;
    }
  }
  return aus;
}

module.exports = function decodeUriComponent(encodedURI) {
  if (typeof encodedURI !== 'string') {
    throw new TypeError(
      'Expected `encodedURI` to be of type `string`, got `' + typeof encodedURI + '`',
    );
  }

  var ersetzt = encodedURI.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(ersetzt);
  } catch (e) {
    return ersetzt.replace(RUN, dekodiereFolge);
  }
};
