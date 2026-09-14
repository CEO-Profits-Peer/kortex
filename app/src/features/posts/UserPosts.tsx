import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PostKarte } from '@/features/posts/PostParts';
import { fehlerText } from '@/lib/fehler';
import { api } from '@/lib/supabase';
import type { Post } from '@/lib/types.db';
import { color, space, type } from '@/theme/tokens';

/**
 * Die Beitraege einer Person - im eigenen Profil und auf fremden.
 *
 * Wer nicht folgt, sieht die Anzahl, aber nicht den Inhalt (get_user_posts,
 * 0078). Das steht dann auch so da, statt einer leeren Liste, die aussieht,
 * als haette die Person nie etwas geschrieben.
 */

const SEITE = 10;

export function UserPosts({
  handle,
  eigene,
  onAnzahl,
  neuladen = 0,
}: {
  handle: string;
  /** Eigenes Profil: leerer Zustand mit Knopf zum Schreiben. */
  eigene?: boolean;
  onAnzahl?: (n: number) => void;
  /**
   * Zaehlt der Aufrufer hoch, wird still neu geladen.
   *
   * Vorher hing hier ein `key={neu}` im Profil: jedes Neuladen baute die
   * Liste neu auf, zeigte kurz den Kreisel und warf alles Nachgeladene weg.
   * Beim Herunterziehen merkt man das kaum - beim stillen Neuladen nach
   * einem Tabwechsel waere es ein Sprung mitten im Lesen.
   */
  neuladen?: number;
}) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [gesperrt, setGesperrt] = useState(false);
  const [mehr, setMehr] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [notiz, setNotiz] = useState<string | null>(null);

  // In einer Ref, damit ein neuer Rueckruf des Aufrufers nicht jedes Mal
  // neu laedt - der Elternbildschirm gibt oft einfach setState herein.
  const melden = useRef(onAnzahl);
  melden.current = onAnzahl;

  const laden = useCallback(async () => {
    try {
      const s = await api.userPosts(handle, SEITE);
      setPosts(s.posts);
      setGesperrt(s.gesperrt);
      setMehr(s.posts.length >= SEITE);
      setFehler(null);
      melden.current?.(s.anzahl);
    } catch (e) {
      setPosts([]);
      setFehler(fehlerText(e, 'Beiträge nicht ladbar'));
    }
  }, [handle]);

  useEffect(() => {
    void laden();
  }, [laden, neuladen]);

  const weiter = async () => {
    if (!posts?.length || laedt) return;
    setLaedt(true);
    try {
      const s = await api.userPosts(handle, SEITE, posts[posts.length - 1].at);
      setPosts((alt) => [...(alt ?? []), ...s.posts.filter((p) => !(alt ?? []).some((a) => a.id === p.id))]);
      setMehr(s.posts.length >= SEITE);
    } catch {
      setMehr(false);
    } finally {
      setLaedt(false);
    }
  };

  if (posts === null) {
    return <ActivityIndicator color={color.ink.low} style={{ marginVertical: space.lg }} />;
  }

  if (gesperrt) {
    return (
      <View style={styles.gesperrt}>
        <Icon name="lock" size={18} color={color.ink.low} />
        <Text style={styles.gesperrtText}>
          Beiträge von @{handle} sehen nur Leute, die folgen.
        </Text>
      </View>
    );
  }

  if (fehler) return <Text style={styles.leer}>{fehler}</Text>;

  if (posts.length === 0) {
    return eigene ? (
      <View style={styles.leerEigen}>
        <Text style={styles.leer}>
          Noch keine Beiträge. Was du schreibst, sehen deine Follower in ihrem Home.
        </Text>
        <Button label="Ersten Beitrag schreiben" onPress={() => router.push('/compose')} />
      </View>
    ) : (
      <Text style={styles.leer}>Noch keine Beiträge.</Text>
    );
  }

  return (
    <View style={styles.liste}>
      {posts.map((p) => (
        <PostKarte key={p.id} post={p} onNotiz={(t) => setNotiz(t || null)} />
      ))}
      {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}
      {mehr ? (
        <Pressable onPress={() => void weiter()} style={styles.mehr} disabled={laedt}>
          {laedt ? (
            <ActivityIndicator size="small" color={color.ink.low} />
          ) : (
            <Text style={styles.mehrText}>Ältere laden</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  liste: { gap: space.md },
  leer: { ...type.body, fontSize: 15, color: color.ink.mid, paddingVertical: space.md },
  leerEigen: { gap: space.md },
  gesperrt: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  gesperrtText: { ...type.body, fontSize: 14, color: color.ink.mid, flex: 1 },
  notiz: { ...type.meta, color: color.signal.primary },
  mehr: { alignItems: 'center', paddingVertical: space.md },
  mehrText: { ...type.meta, color: color.signal.primary },
});
