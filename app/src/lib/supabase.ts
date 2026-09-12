import 'react-native-url-polyfill/auto';
/**
 * Muss VOR createClient stehen: das Modul liest die Fehlerwerte, die
 * Google in die Adresse schreibt, und supabase-js raeumt die Adresse auf,
 * sobald der Client existiert. Wer danach nachsieht, findet nichts mehr.
 */
import './oauthReturn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { AdminData } from '@/features/admin/AdminOverview';
import type {
  Category,
  CategoryDetail,
  CommentQuestion,
  DailyChallenge,
  DailyLeaderboard,
  DailySubmission,
  FollowingItem,
  MySocial,
  PersonHit,
  PostCommentResult,
  PublicProfile,
  CourseDetail,
  CourseSummary,
  ContentEvent,
  ContentItem,
  DueReview,
  FlushEventsResult,
  LeaderboardRow,
  Profile,
  ReviewSummary,
  SearchHit,
  Stats,
  SubmitQuizResult,
} from './types.db';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Fehlende Config ist ein haeufiger Zustand am Anfang (der anon key wird von
 * Hand eingetragen). Deshalb KEIN throw beim Import: das wuerde einen weissen
 * Bildschirm ohne Erklaerung erzeugen. Stattdessen ein Flag, das die UI
 * auswerten und dem Nutzer anzeigen kann.
 */
export const configError: string | null =
  !url || !anonKey
    ? 'app/.env unvollstaendig: EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_ANON_KEY setzen.'
    : null;

if (configError) console.warn('[config]', configError);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Auf Web uebernimmt der Browser das Session-Handling aus der URL,
    // auf nativen Plattformen gibt es keine Redirect-URL zum Parsen.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/**
 * Alle Schreibvorgaenge laufen ueber RPCs. Der Client schreibt keine
 * Zustaende — XP, Mastery, Level und Streak entstehen ausschliesslich
 * serverseitig (supabase/migrations/0003_functions.sql).
 */
export const api = {
  /**
   * Der Feed.
   *
   * `exclude` sind die Karten, die schon in der Liste stehen. Ohne diese
   * Angabe liefert der Server irgendwann genau die zurueck, die die App
   * als Dubletten wegwirft - die Liste waechst dann nicht mehr, und man
   * kommt beim Scrollen nicht weiter, bis man neu laedt.
   */
  async getFeed(batchSize = 10, exclude: string[] = []): Promise<ContentItem[]> {
    const { data, error } = await supabase.rpc('get_feed', {
      p_batch_size: batchSize,
      // Nur die letzten 60: mehr braucht der Ausschluss nicht, und eine
      // Liste, die mit jeder Sitzung waechst, wuerde die Anfrage aufblaehen.
      p_exclude: exclude.slice(-60),
    });
    if (error) throw error;
    return (data ?? []) as ContentItem[];
  },

  async flushEvents(events: ContentEvent[]): Promise<FlushEventsResult> {
    const { data, error } = await supabase.rpc('flush_events', { p_events: events });
    if (error) throw error;
    return data as FlushEventsResult;
  },

  /**
   * Die richtige Antwort kennt der Client vorher NICHT — sie kommt erst
   * mit dem Ergebnis zurueck. Sonst laesst sie sich aus dem Netzwerk-
   * Payload ablesen.
   */
  async submitQuiz(
    contentId: string,
    quizIndex: number,
    answerIndex: number,
  ): Promise<SubmitQuizResult> {
    const { data, error } = await supabase.rpc('submit_quiz', {
      p_content_id: contentId,
      p_quiz_index: quizIndex,
      p_answer: answerIndex,
    });
    if (error) throw error;
    return data as SubmitQuizResult;
  },

  async submitReview(reviewId: string, answerIndex: number) {
    const { data, error } = await supabase.rpc('submit_review', {
      p_review_id: reviewId,
      p_answer: answerIndex,
    });
    if (error) throw error;
    return data as { correct: boolean; correct_index: number; xp: number };
  },

  async search(query: string, limit = 20): Promise<SearchHit[]> {
    const { data, error } = await supabase.rpc('search_all', {
      p_query: query,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as SearchHit[];
  },

  async leaderboard(
    scope: 'region' | 'friends' | 'global' = 'region',
    limit = 50,
  ): Promise<LeaderboardRow[]> {
    const { data, error } = await supabase.rpc('get_leaderboard', {
      p_scope: scope,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as LeaderboardRow[];
  },

  /** Bonus fuer einen komplett richtig geloesten Batch. Server prueft mit. */
  async claimBatchBonus(contentIds: string[], allCorrect: boolean) {
    const { data, error } = await supabase.rpc('claim_batch_bonus', {
      p_content_ids: contentIds,
      p_all_correct: allCorrect,
    });
    if (error) throw error;
    return data as { granted: boolean; xp?: number; reason?: string };
  },

  async getMyProfile(): Promise<Profile | null> {
    const { data, error } = await supabase.rpc('get_my_profile');
    if (error) throw error;
    return (data ?? null) as Profile | null;
  },

  async getMyStats(): Promise<Stats> {
    const { data, error } = await supabase.rpc('get_my_stats');
    if (error) throw error;
    return data as Stats;
  },

  async completeOnboarding(input: {
    country: string;
    region: string | null;
    birthYear: number;
    language: string;
    timezone: string;
    categories: string[];
  }): Promise<Profile> {
    const { data, error } = await supabase.rpc('complete_onboarding', {
      p_country: input.country,
      p_region: input.region ?? '',
      p_birth_year: input.birthYear,
      p_language: input.language,
      p_timezone: input.timezone,
      p_categories: input.categories,
    });
    if (error) throw error;
    return data as Profile;
  },

  async categoryDetail(categoryId: string): Promise<CategoryDetail> {
    const { data, error } = await supabase.rpc('get_category_detail', {
      p_category_id: categoryId,
    });
    if (error) throw error;
    return data as CategoryDetail;
  },

  async categoryFeed(categoryId: string, batchSize = 10, includeRead = false) {
    const { data, error } = await supabase.rpc('get_category_feed', {
      p_category_id: categoryId,
      p_batch_size: batchSize,
      p_include_read: includeRead,
    });
    if (error) throw error;
    return (data ?? []) as ContentItem[];
  },

  async setCategoryFollowing(categoryId: string, following: boolean) {
    const { error } = await supabase.rpc('set_category_following', {
      p_category_id: categoryId,
      p_following: following,
    });
    if (error) throw error;
  },

  async dueReviews(limit = 10): Promise<DueReview[]> {
    const { data, error } = await supabase.rpc('get_due_reviews', { p_limit: limit });
    if (error) throw error;
    return (data ?? []) as DueReview[];
  },

  async reviewSummary(): Promise<ReviewSummary> {
    const { data, error } = await supabase.rpc('get_review_summary');
    if (error) throw error;
    return data as ReviewSummary;
  },

  async updateSettings(patch: Record<string, unknown>): Promise<Profile> {
    const { data, error } = await supabase.rpc('update_my_settings', { p_patch: patch });
    if (error) throw error;
    return data as Profile;
  },

  /** DSGVO Art. 15 - alles, was ueber den Nutzer gespeichert ist. */
  async exportMyData(): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  /** DSGVO Art. 17 - loescht auth.users, alles andere haengt per Cascade dran. */
  async deleteMyAccount(): Promise<void> {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
  },

  async listCourses(): Promise<CourseSummary[]> {
    const { data, error } = await supabase.rpc('list_courses');
    if (error) throw error;
    return (data ?? []) as CourseSummary[];
  },

  async courseDetail(slug: string): Promise<CourseDetail> {
    const { data, error } = await supabase.rpc('get_course_detail', { p_slug: slug });
    if (error) throw error;
    return data as CourseDetail;
  },

  async courseFeed(courseId: string): Promise<ContentItem[]> {
    const { data, error } = await supabase.rpc('get_course_feed', { p_course_id: courseId });
    if (error) throw error;
    return (data ?? []) as ContentItem[];
  },

  async startCourse(courseId: string): Promise<void> {
    const { error } = await supabase.rpc('start_course', { p_course_id: courseId });
    if (error) throw error;
  },

  // --- Social ---------------------------------------------------------

  async getMySocial(): Promise<MySocial> {
    const { data, error } = await supabase.rpc('get_my_social');
    if (error) throw error;
    return data as MySocial;
  },

  async publicProfile(handle: string): Promise<PublicProfile> {
    const { data, error } = await supabase.rpc('get_public_profile', { p_handle: handle });
    if (error) throw error;
    return data as PublicProfile;
  },

  async setFollowing(userId: string, follow: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_following', { p_user: userId, p_follow: follow });
    if (error) throw error;
  },

  async setRepost(contentId: string, on: boolean, comment?: string): Promise<void> {
    const { error } = await supabase.rpc('set_repost', {
      p_content_id: contentId,
      p_on: on,
      p_comment: comment ?? null,
    });
    if (error) throw error;
  },

  async followingFeed(limit = 30): Promise<FollowingItem[]> {
    const { data, error } = await supabase.rpc('get_following_feed', { p_limit: limit });
    if (error) throw error;
    return (data ?? []) as FollowingItem[];
  },

  /**
   * Die meistgefolgten Personen - fuer die Leiste oben in der Suche.
   * Kann leer sein: in einer jungen App hat noch niemand Follower.
   */
  async topPeople(limit = 15): Promise<PersonHit[]> {
    const { data, error } = await supabase.rpc('get_top_people', { p_limit: limit });
    if (error) throw error;
    return (data ?? []) as PersonHit[];
  },

  /** Wer dieser Person folgt. */
  async followers(handle: string, limit = 50): Promise<PersonHit[]> {
    const { data, error } = await supabase.rpc('get_followers', {
      p_handle: handle,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PersonHit[];
  },

  /** Wem diese Person folgt. */
  async following(handle: string, limit = 50): Promise<PersonHit[]> {
    const { data, error } = await supabase.rpc('get_following', {
      p_handle: handle,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PersonHit[];
  },

  async searchPeople(query: string, limit = 20): Promise<PersonHit[]> {
    const { data, error } = await supabase.rpc('search_people', {
      p_query: query,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PersonHit[];
  },

  /**
   * Eine einzelne Karte, per Kennung.
   *
   * Fuer den direkten Weg auf ein Reel - aus dem Profil, aus einem
   * geteilten Link. RLS laesst freigegebene Karten lesen, deshalb braucht
   * es dafuer keine eigene Funktion.
   */
  async contentById(id: string): Promise<ContentItem | null> {
    const { data, error } = await supabase
      .from('content_items')
      .select('*')
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle();
    if (error) throw error;
    return (data as ContentItem) ?? null;
  },

  /**
   * Der Feed einer Person: erst die angetippte Karte, dann ihre Reposts,
   * dann ihre oeffentlichen Likes. Laeuft das aus, uebernimmt der normale
   * Feed - das entscheidet der Aufrufer, nicht der Server.
   */
  async personFeed(handle: string, startId?: string, limit = 30): Promise<ContentItem[]> {
    const { data, error } = await supabase.rpc('get_person_feed', {
      p_handle: handle,
      p_start: startId ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as ContentItem[];
  },

  /**
   * Was ich mit diesen Karten gemacht habe - geliked, repostet.
   *
   * Kommt nicht mit dem Feed mit: der gibt Tabellenzeilen zurueck, in die
   * nichts Nutzerbezogenes hineinpasst. Eine Anfrage pro Stapel.
   */
  async myContentState(
    ids: string[],
  ): Promise<Record<string, { liked: boolean; reposted: boolean }>> {
    if (ids.length === 0) return {};
    const { data, error } = await supabase.rpc('get_my_content_state', { p_ids: ids });
    if (error) throw error;
    return (data ?? {}) as Record<string, { liked: boolean; reposted: boolean }>;
  },

  // --- Kontrollzentrum --------------------------------------------------

  /**
   * Die Uebersicht fuer das Kontrollzentrum.
   *
   * Die PIN geht mit, wird aber nirgends gespeichert. Die Absicherung
   * steckt vollstaendig in der Funktion (Migration 0064): sie prueft Konto
   * UND PIN und meldet fuer jeden Fehlschlag dasselbe. Hier gibt es nichts
   * zu pruefen, was sich nicht umgehen liesse - dieser Code laeuft auf
   * einem fremden Geraet.
   */
  async adminOverview(pin: string): Promise<AdminData> {
    const { data, error } = await supabase.rpc('admin_overview', { p_pin: pin });
    if (error) throw error;
    return data as AdminData;
  },

  // --- Kommentare ------------------------------------------------------

  async comments(contentId: string, limit = 30): Promise<CommentQuestion[]> {
    const { data, error } = await supabase.rpc('get_comments', {
      p_content_id: contentId,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as CommentQuestion[];
  },

  /**
   * Frage stellen oder antworten.
   *
   * Die Vorpruefung laeuft in der Datenbank und entscheidet sofort - der
   * Rueckgabewert sagt, ob der Beitrag sichtbar ist oder warum nicht.
   */
  async postComment(
    contentId: string,
    body: string,
    parentId?: string,
  ): Promise<PostCommentResult> {
    const { data, error } = await supabase.rpc('post_comment', {
      p_content_id: contentId,
      p_body: body,
      p_parent_id: parentId ?? null,
    });
    if (error) throw error;
    return data as PostCommentResult;
  },

  async reportComment(id: string): Promise<void> {
    const { error } = await supabase.rpc('report_comment', { p_id: id });
    if (error) throw error;
  },

  async deleteComment(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_comment', { p_id: id });
    if (error) throw error;
  },

  // --- Tagesaufgabe ----------------------------------------------------

  async dailyChallenge(): Promise<DailyChallenge> {
    const { data, error } = await supabase.rpc('get_daily_challenge');
    if (error) throw error;
    return data as DailyChallenge;
  },

  /**
   * Antworten abgeben.
   *
   * Die Dauer wird mitgeschickt, weil sie bei Gleichstand entscheidet. Der
   * Server deckelt sie - eine manipulierte Zahl bringt deshalb nichts.
   */
  async submitDaily(answers: number[], durationMs: number): Promise<DailySubmission> {
    const { data, error } = await supabase.rpc('submit_daily', {
      p_answers: answers,
      p_duration_ms: Math.round(durationMs),
    });
    if (error) throw error;
    return data as DailySubmission;
  },

  async dailyLeaderboard(limit = 20): Promise<DailyLeaderboard> {
    const { data, error } = await supabase.rpc('get_daily_leaderboard', { p_limit: limit });
    if (error) throw error;
    return data as DailyLeaderboard;
  },

  /** Öffentliche URL eines Profilbilds. null, wenn keins gesetzt ist. */
  avatarUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  },

  /**
   * Profilbild hochladen.
   *
   * Jeder Upload bekommt einen EIGENEN Dateinamen, und der alte wird danach
   * geloescht. Frueher war es ein fester Name mit `upsert` - sparsam, aber
   * falsch: die Adresse blieb dieselbe, also zeigten Browser-Cache, CDN und
   * die App weiter das alte Bild. Wer ein neues hochlud, sah sein altes und
   * hielt das Hochladen fuer kaputt.
   *
   * Ein Name, der sich aendert, macht jede Zwischenspeicherung von selbst
   * richtig - ueberall, auch auf den Geraeten anderer Leute.
   */
  async uploadAvatar(
    userId: string,
    blob: ArrayBuffer,
    ext: 'jpg' | 'png',
    previousPath?: string | null,
  ): Promise<string> {
    const path = `${userId}/${Date.now().toString(36)}.${ext}`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : 'png'}` });
    if (error) throw error;

    // Aufraeumen erst NACH dem Erfolg, und ein Fehlschlag hier darf den
    // Upload nicht zurueckmelden: eine verwaiste Datei ist ein Schoenheits-
    // fehler, ein verlorenes Profilbild nicht.
    if (previousPath && previousPath !== path) {
      await supabase.storage.from('avatars').remove([previousPath]).catch(() => {});
    }
    return path;
  },

  /**
   * Ein Profilbild wegwerfen.
   *
   * Gehoert zu jedem Loeschen des Verweises dazu: ein Bild, das niemand
   * mehr anzeigt, aber jeder abrufen kann, ist genau die Art Datenrest, die
   * man spaeter nicht mehr findet.
   */
  async deleteAvatar(path: string | null | undefined): Promise<void> {
    if (!path) return;
    await supabase.storage.from('avatars').remove([path]);
  },

  async listCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order');
    if (error) throw error;
    return (data ?? []) as Category[];
  },
};
