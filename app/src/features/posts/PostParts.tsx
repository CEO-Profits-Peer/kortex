import { router } from 'expo-router';
import { ProAbzeichen } from '@/components/ProSperre';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { namensfarbe } from '@/lib/meisterwege';
import { ErwaehnungsText } from '@/components/Erwaehnungen';
import { PostInhalt, VERB } from '@/features/posts/PostArten';
import { Icon, type IconName } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { sharePost } from '@/lib/share';
import { api } from '@/lib/supabase';
import type { HomePerson, Post, PostCard } from '@/lib/types.db';
import { T } from '@/lib/sprache';
import { color, radius, space, type } from '@/theme/tokens';
import { flaeche } from '@/theme/design';

/**
 * Bausteine fuer Beitraege - im Home und auf der Beitragsseite dieselben.
 *
 * Zwei Orte, ein Aussehen: wer einen Beitrag im Home liked und dann antippt,
 * soll auf der Detailseite dasselbe Herz an derselben Stelle finden.
 */

export function wann(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'gerade';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `${d} T`;
}

/**
 * Aufs Profil. Mit `postId`, wenn der Weg ueber einen Beitrag DIESER Person
 * fuehrt: folgt man dort, zaehlt der Follow fuer den Beitrag (0080).
 */
export function zuProfil(handle: string, postId?: string) {
  haptics.light();
  router.push(
    `/u/${encodeURIComponent(handle)}${postId ? `?von=beitrag&post=${encodeURIComponent(postId)}` : ''}`,
  );
}

export function name(p: HomePerson): string {
  return p.ich ? 'Du' : p.name;
}

/** Wer, was, wann. */
export function Kopf({
  wer,
  verb,
  at,
  klein,
  postId,
}: {
  wer: HomePerson;
  verb?: string | null;
  at: string;
  klein?: boolean;
  /** Der Beitrag von `wer`, ueber den man aufs Profil geht. */
  postId?: string;
}) {
  return (
    <Pressable onPress={() => zuProfil(wer.handle, wer.ich ? undefined : postId)} style={styles.kopf}>
      <Avatar seed={wer.avatar_seed} path={wer.avatar_path} size={klein ? 24 : 34} rahmen={wer.rahmen} />
      <Text style={[styles.kopfText, klein && { fontSize: 13 }]} numberOfLines={2}>
        <Text style={[styles.kopfName, namensfarbe(wer.namensfarbe) ? { color: namensfarbe(wer.namensfarbe) } : null]}>{name(wer)}</Text>
        {verb ? ` ${verb}` : ''}
      </Text>
      {wer.pro ? <ProAbzeichen /> : null}
      <Text style={styles.kopfWann}>{wann(at)}</Text>
    </Pressable>
  );
}

/** Eine Karte als Verweis. Ein Tipp oeffnet sie. */
export function KartenVerweis({ karte, von }: { karte: PostCard; von?: string }) {
  const tag = karte.category ? `#${karte.category.split('.').pop()}` : null;
  return (
    <Pressable
      onPress={() =>
        router.push(
          `/reel/${encodeURIComponent(karte.content_id)}${von ? `?from=${encodeURIComponent(von)}` : ''}`,
        )
      }
      style={({ pressed }) => [styles.verweis, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.verweisTitel} numberOfLines={2}>
          {karte.title}
        </Text>
        {karte.deck ? (
          <Text style={styles.verweisUnter} numberOfLines={1}>
            {karte.deck}
          </Text>
        ) : null}
        {tag ? <Text style={styles.verweisMeta}>{tag}</Text> : null}
      </View>
      <Icon name="chevron" size={14} color={color.ink.low} />
    </Pressable>
  );
}

function Knopf({
  icon,
  text,
  an,
  onPress,
  label,
}: {
  icon: IconName;
  text?: string;
  an?: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.knopf, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={18} color={an ? color.signal.primary : color.ink.mid} />
      {text ? <Text style={[styles.knopfText, an && { color: color.signal.primary }]}>{text}</Text> : null}
    </Pressable>
  );
}

/** Like · Kommentar · Repost ... Teilen - in dieser Reihenfolge, wie ueberall. */
export function Aktionen({
  likes,
  ichLike,
  kommentare,
  repostAn,
  onLike,
  onKommentar,
  onRepost,
  onTeilen,
}: {
  likes: number;
  ichLike: boolean;
  kommentare: number;
  repostAn?: boolean;
  onLike: () => void;
  onKommentar: () => void;
  onRepost: () => void;
  onTeilen: () => void;
}) {
  return (
    <View style={styles.aktionen}>
      <Knopf icon={ichLike ? 'like-filled' : 'like'} text={likes > 0 ? String(likes) : ''} an={ichLike} onPress={onLike} label={T('Gefällt mir')} />
      <Knopf icon="comment" text={kommentare > 0 ? String(kommentare) : ''} onPress={onKommentar} label={T('Kommentieren')} />
      <Knopf icon="refresh" text={repostAn ? 'geteilt' : ''} an={repostAn} onPress={onRepost} label={T('Reposten')} />
      <View style={{ flex: 1 }} />
      <Knopf icon="share" onPress={onTeilen} label={T('Teilen')} />
    </View>
  );
}

/** Ein Beitrag samt Knoepfen. */
export function PostKarte({
  post,
  onNotiz,
  imDetail,
}: {
  post: Post;
  onNotiz?: (text: string) => void;
  /** Auf der Beitragsseite selbst fuehrt ein Tipp nirgendwohin. */
  imDetail?: boolean;
}) {
  const [likes, setLikes] = useState(post.likes);
  const [ichLike, setIchLike] = useState(post.ich_like);

  useEffect(() => {
    setLikes(post.likes);
    setIchLike(post.ich_like);
  }, [post.id, post.likes, post.ich_like]);

  const oeffnen = () => {
    if (imDetail) return;
    router.push(`/post/${encodeURIComponent(post.id)}`);
  };

  const like = async () => {
    const next = !ichLike;
    setIchLike(next);
    setLikes((l) => Math.max(0, l + (next ? 1 : -1)));
    if (next) haptics.medium();
    else haptics.light();
    try {
      await api.setPostLike(post.id, next);
    } catch {
      setIchLike(!next);
      setLikes((l) => Math.max(0, l + (next ? -1 : 1)));
    }
  };

  const teilen = async () => {
    const r = await sharePost({ postId: post.id, text: post.body || post.original?.body || 'Ein Beitrag' });
    if (r === 'copied') onNotiz?.('Link kopiert.');
    if (r === 'failed') onNotiz?.('Teilen ging nicht.');
  };

  const verb = post.original
    ? 'teilt einen Beitrag'
    : post.karte
      ? 'empfiehlt eine Karte'
      : (VERB[post.art] ?? null);
  const frageStil = post.art === 'frage' || post.art === 'umfrage' || post.art === 'quiz';

  return (
    <View style={styles.karte}>
      {post.angepinnt ? <Text style={styles.angepinnt}>Angepinnt</Text> : null}
      <Kopf wer={post.wer} verb={verb} at={post.at} postId={post.id} />

      {post.body ? (
        <Pressable onPress={oeffnen} disabled={imDetail}>
          <ErwaehnungsText text={post.body} style={[styles.text, frageStil && styles.frage]} />
        </Pressable>
      ) : null}

      <PostInhalt postId={post.id} art={post.art} daten={post.daten} istMeins={post.ist_meins} onNotiz={onNotiz} />

      {post.karte ? <KartenVerweis karte={post.karte} von={post.wer.handle} /> : null}

      {post.original ? (
        <Pressable
          onPress={() => router.push(`/post/${encodeURIComponent(post.original!.id)}`)}
          style={({ pressed }) => [styles.original, pressed && { opacity: 0.85 }]}
        >
          <Kopf wer={post.original.wer} at={post.original.at} klein postId={post.original.id} />
          {post.original.body ? (
            <ErwaehnungsText text={post.original.body} style={styles.originalText} numberOfLines={6} />
          ) : null}
          <PostInhalt
            postId={post.original.id}
            art={post.original.art}
            daten={post.original.daten}
            istMeins={post.original.wer.ich === true}
            onNotiz={onNotiz}
          />
          {post.original.karte ? <KartenVerweis karte={post.original.karte} /> : null}
        </Pressable>
      ) : null}

      <Aktionen
        likes={likes}
        ichLike={ichLike}
        kommentare={post.kommentare}
        onLike={() => void like()}
        onKommentar={() => (imDetail ? onNotiz?.('') : oeffnen())}
        onRepost={() => {
          haptics.light();
          router.push(`/compose?repost=${encodeURIComponent(post.id)}`);
        }}
        onTeilen={() => void teilen()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  karte: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(12),
  },

  kopf: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  angepinnt: { ...type.meta, color: color.akzent, textTransform: 'uppercase', letterSpacing: 1 },
  kopfText: { ...type.body, fontSize: 14, color: color.ink.mid, flex: 1 },
  kopfName: { color: color.ink.max, fontWeight: '600' },
  kopfWann: { ...type.meta, color: color.ink.low },

  text: { ...type.body, fontSize: 16, lineHeight: 23, color: color.ink.high },
  frage: { color: color.ink.max, fontWeight: '600' },

  verweis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    ...flaeche(8),
  },
  verweisTitel: { ...type.body, fontSize: 15, color: color.ink.high },
  verweisUnter: { ...type.meta, color: color.ink.mid },
  verweisMeta: { ...type.meta, color: color.ink.low },

  original: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    ...flaeche(8),
  },
  originalText: { ...type.body, fontSize: 15, lineHeight: 21, color: color.ink.high },

  aktionen: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingTop: space.xs },
  knopf: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 28 },
  knopfText: { ...type.meta, fontSize: 12, color: color.ink.mid },
});
