/**
 * Handgeschriebene Typen fuer die Tabellen und RPCs aus supabase/migrations.
 *
 * Sobald die Migrationen auf dem Server sind, werden diese durch generierte
 * ersetzt:
 *   npx supabase@latest gen types typescript --linked > src/lib/types.gen.ts
 * Bis dahin sind das hier die verbindlichen Formen — sie muessen exakt zum
 * Schema passen, sonst faellt es erst zur Laufzeit auf.
 */

export type ContentType = 'news' | 'knowledge' | 'interactive' | 'course_lesson' | 'sponsor';
export type PresentationMode = 'text' | 'voice' | 'interactive' | 'kinetic';
export type LicenseClass = 'owned' | 'cc' | 'press_free' | 'link_only';

export type BodyBlock =
  | { type: 'para'; text: string }
  | { type: 'bullet'; items: string[] }
  | { type: 'stat'; value: string; label: string }
  | { type: 'quote'; text: string; attribution?: string };

export type QuizItem = {
  question: string;
  options: string[];
  /** Kommt vom Server NUR als Antwort auf submit_quiz — nie im Feed. */
  correct_index?: number;
  explanation?: string;
};

/**
 * Inhalt des media-Feldes. Vertrag zwischen Pipeline und App.
 *
 * visual: fehlt fast immer - dann erzeugt BlueprintVisual eine Grafik aus der
 *         Karten-ID. Kein Speicher, keine Bandbreite, keine Bildrechte.
 * audio:  ab v0.5, wenn Google Cloud TTS angebunden ist. marks liefert die
 *         Wortzeitpunkte fuer die Untertitel-Synchronisation - die kommen aus
 *         SSML <mark> im selben TTS-Aufruf, kein Forced Alignment noetig.
 * video:  bewusst noch nicht. Siehe docs/MEDIA.md.
 */
export type Media = {
  visual?: { kind: 'generative' | 'image'; url?: string; alt?: string };
  audio?: {
    url: string;
    duration_ms: number;
    voice?: string;
    marks?: { t: number; word: string }[];
  };
  video?: { url: string; poster?: string; duration_ms: number };
  tags?: string[];
  demo?: boolean;
};

export type ContentItem = {
  id: string;
  content_type: ContentType;
  presentation_mode: PresentationMode;
  status: 'pending' | 'approved' | 'rejected' | 'archived';
  title: string;
  deck: string | null;
  body_blocks: BodyBlock[];
  source_ids: string[];
  source_urls: string[];
  primary_source_id: string | null;
  published_at: string | null;
  language: string;
  region_code: string | null;
  primary_category_id: string;
  category_ids: string[];
  difficulty: number;
  word_count: number;
  /** Vom Server berechnet: ab wann die Card als gelesen zaehlt */
  dwell_target_ms: number;
  /**
   * Wie oft die Karte insgesamt geliked wurde. Ein Trigger haelt das
   * aktuell (0018); die Zahl enthaelt den eigenen Like bereits, wenn man
   * ihn in einer frueheren Sitzung gesetzt hat.
   */
  like_count: number;
  /** Sichtbare Fragen zu dieser Karte. Ein Trigger haelt das aktuell (0036). */
  comment_count: number;
  interaction_template: string | null;
  interaction_data: Record<string, unknown> | null;
  /**
   * Drehbuch der Erklaerkarte. Nur bei presentation_mode 'kinetic' gesetzt -
   * die Datenbank erzwingt das (0027).
   */
  kinetic_script: unknown | null;
  quiz_items: QuizItem[];
  media: Media;
  expires_at: string | null;
  created_at: string;
};

export type Category = {
  id: string;
  slug: string;
  parent_id: string | null;
  display_name: string;
  name_i18n: Record<string, string>;
  emoji: string | null;
  accent_hex: string | null;
  kind: 'knowledge' | 'news' | 'meta';
  is_levelable: boolean;
  max_level: number;
};

export type Source = {
  id: string;
  handle: string;
  display_name: string;
  license_class: LicenseClass;
  license_name: string | null;
  logo_url: string | null;
  trust_score: number;
};

export type Profile = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_seed: string;
  birth_year: number;
  country_code: string;
  region_code: string | null;
  timezone: string;
  language: string;
  xp_total: number;
  mastery_total: number;
  streak_current: number;
  streak_best: number;
  cards_read_total: number;
  focus_seconds_total: number;
  referral_code: string;
  plan: 'free' | 'pro' | 'gifted';
  leaderboard_opt_in: boolean;
  likes_public: boolean;
  bio: string | null;
  avatar_path: string | null;
  follower_count: number;
  following_count: number;
  daily_goal_cards: number;
  /** Anteil englischer Inhalte im Feed. 0 = nur Deutsch, 100 = nur Englisch. */
  feed_english_pct: number;
  notify_reviews: boolean;
  notify_streak: boolean;
  notify_social: boolean;
  onboarding_completed_at: string | null;
  /** 0084: Beitraege in Explore und fuer Nicht-Follower sichtbar. */
  beitraege_oeffentlich?: boolean;
  /** 0084: eigene Reposts nur im Profil, nicht im Home anderer. */
  reposts_nur_profil?: boolean;
  /** 0084: im eigenen Home keine Reposts. */
  home_ohne_reposts?: boolean;
};

// --- Events, die der Client sendet ------------------------------------------

export type EventType =
  | 'impression'
  | 'dwell'
  | 'like'
  | 'unlike'
  | 'skip'
  | 'source_open'
  | 'share'
  | 'too_easy'
  | 'too_hard'
  | 'report';

export type ContentEvent = {
  content_id: string;
  event_type: EventType;
  dwell_ms?: number;
  visible_pct?: number;
  payload?: Record<string, unknown>;
  client_ts: string;
};

// --- RPC-Signaturen ---------------------------------------------------------

export type FlushEventsResult = { xp_awarded: number; cards_validated: number };

export type SubmitQuizResult = {
  correct: boolean;
  correct_index: number;
  explanation: string | null;
  xp: number;
  mastery: number;
};

export type SearchHit = {
  kind: 'category' | 'source' | 'profile' | 'course' | 'content';
  id: string;
  title: string;
  subtitle: string;
  meta: Record<string, unknown>;
  score: number;
};

// --- Einladungen ------------------------------------------------------------

/** Wer hat eingeladen? Nur, was ohnehin oeffentlich ist. */
export type InvitePreview = {
  handle: string;
  name: string | null;
  avatar_seed: string;
  avatar_path: string | null;
};

export type MyInvite = {
  code: string;
  /** Wie viele ueber diesen Code ein Konto angelegt haben. */
  eingeladen: number;
};

export type RedeemResult = {
  status: 'ok' | 'ungueltig' | 'selbst' | 'schon_eingeladen' | 'zu_alt' | 'kein_profil';
};

// --- Duelle ------------------------------------------------------------------

export type DuelCard = {
  id: string;
  title: string;
  deck: string | null;
  body_blocks: BodyBlock[];
  category: string;
};

/** Die Lernphase. `phase` wechselt auf 'quiz', sobald die Minute um ist. */
export type DuelStudy = {
  phase: 'study' | 'quiz';
  seconds_left: number;
  cards: DuelCard[];
};

/** Fragen OHNE correct_index - der Server behaelt die Loesung. */
export type DuelQuestion = {
  content_id: string;
  title: string;
  question: string;
  options: string[];
};

export type DuelQuiz = {
  seconds_left: number;
  questions: DuelQuestion[];
};

export type DuelResult = {
  correct: number;
  total: number;
  /** Abgegeben, nachdem die Zeit abgelaufen war - zaehlt null. */
  late: boolean;
  elapsed_ms: number;
  /** Der andere hat noch nicht gespielt. */
  waiting: boolean;
};

export type DuelListEntry = {
  id: string;
  gegner: {
    handle: string;
    name: string | null;
    avatar_seed: string;
    avatar_path: string | null;
  };
  ich_habe_gestartet: boolean;
  laeuft: boolean;
  endet: string;
  mein_stand: 'offen' | 'laeuft' | 'fertig';
  meine_punkte: number | null;
  gegner_punkte: number | null;
  gegner_fertig: boolean;
};

export type LeaderboardRow = {
  rank_pos: number;
  handle: string;
  display_name: string | null;
  avatar_seed: string;
  avatar_path: string | null;
  mastery_total: number;
  streak_current: number;
  is_me: boolean;
};

export type RadarSlice = {
  id: string;
  label: string;
  emoji: string | null;
  accent: string | null;
  mastery: number;
  level: number;
};

export type Stats = {
  profile: Profile | null;
  reviews_due: number;
  read_today: number;
  radar: RadarSlice[];
  recent_xp: { kind: string; xp: number; mastery: number; at: string }[];
};

export type DueReview = {
  review_id: string;
  content_id: string;
  quiz_index: number;
  category_id: string;
  category_name: string;
  accent_hex: string | null;
  source_title: string;
  question: string;
  /** Nur die Optionen. Die richtige Antwort kennt nur der Server. */
  options: string[];
  repetitions: number;
  interval_days: number;
  due_at: string;
};

export type ReviewSummary = {
  due_now: number;
  due_today: number;
  next_due_at: string | null;
  in_rotation: number;
  retired: number;
};

export type CategoryDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  emoji: string | null;
  accent: string | null;
  levelable: boolean;
  max_level: number;
  level: number;
  mastery: number;
  difficulty_pref: number;
  is_following: boolean;
  /** null, wenn das Maximallevel erreicht ist */
  mastery_for_next: number | null;
  cards_total: number;
  cards_read: number;
  children: { id: string; slug: string; name: string; emoji: string | null }[];
};

export type CourseSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category_id: string;
  category: string;
  emoji: string | null;
  accent: string | null;
  difficulty: number;
  premium: boolean;
  lessons: number;
  position: number;
  started: boolean;
  completed: boolean;
};

export type CourseDetail = Omit<CourseSummary, 'lessons' | 'started'> & {
  lessons: { position: number; title: string; deck: string | null; done: boolean }[];
};

export type RepostRef = {
  content_id: string;
  title: string;
  category: string;
  comment?: string | null;
  at: string;
};

export type PublicProfile = {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_seed: string;
  avatar_path: string | null;
  region_code: string | null;
  mastery_total: number | null;
  streak_current: number | null;
  follower_count: number;
  following_count: number;
  is_me: boolean;
  i_follow: boolean;
  likes_public: boolean;
  reposts: RepostRef[];
  /** null, wenn die Person ihre Likes privat hält */
  likes: RepostRef[] | null;
  /** 0083 */
  dabei_seit?: string;
  beitraege?: number;
  likes_bekommen?: number;
};

/** Die eigene Statistik (get_my_statistik, 0083). */
export type Statistik = {
  dabei_seit: string;
  /** Ab hier ist der Follower-Verlauf genau (follow_events, 0080). */
  mitschrift_seit: string;
  sozial: {
    follower: number;
    folgt: number;
    beitraege: number;
    likes: number;
    kommentar_likes: number;
    kommentare: number;
    geteilt: number;
    empfohlen: number;
  };
  lernen: {
    gesehen: number;
    gelesen: number;
    gelikt: number;
    quiz_versuche: number;
    quiz_richtig: number;
    xp: number;
    streak: number;
    streak_best: number;
    fokus_minuten: number;
  };
  follower_verlauf: { tag: string; follower: number; neu: number; weg: number }[];
  gelesen_verlauf: { tag: string; anzahl: number }[];
  quellen: Record<string, number>;
  top_beitraege: {
    id: string;
    body: string;
    at: string;
    likes: number;
    kommentare: number;
    geteilt: number;
    neue_follower: number;
  }[];
};

export type PersonHit = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_seed: string;
  avatar_path: string | null;
  follower_count: number;
  i_follow: boolean;
  is_me: boolean;
};

/** Eine Person, wie get_home und get_post (Migration 0077) sie mitschicken. */
export type HomePerson = {
  handle: string;
  name: string;
  avatar_seed: string;
  avatar_path: string | null;
  /** Das bin ich - die App schreibt dann "Du". */
  ich?: boolean;
};

/** Eine Karte als Verweis in einem Beitrag. */
export type PostCard = {
  content_id: string;
  title: string;
  deck: string | null;
  category: string;
};

/** Ein eigener Beitrag (Migration 0077, post_json). */
export type Post = {
  id: string;
  art: 'post' | 'frage';
  body: string;
  at: string;
  wer: HomePerson;
  ist_meins: boolean;
  likes: number;
  ich_like: boolean;
  kommentare: number;
  reposts: number;
  karte: PostCard | null;
  /** Gesetzt, wenn der Beitrag einen anderen weiterteilt. */
  original: {
    id: string;
    art: 'post' | 'frage';
    body: string;
    at: string;
    wer: HomePerson;
    karte: PostCard | null;
  } | null;
};

export type PostComment = {
  id: string;
  body: string;
  at: string;
  wer: HomePerson;
  ist_meins: boolean;
  /** Eigene Kommentare - und alle unter dem eigenen Beitrag. */
  darf_loeschen: boolean;
  /** Kommentar-Likes (0080). */
  likes: number;
  ich_like: boolean;
  antworten: PostComment[];
};

/** Wo ein Folgen-Knopf gedrueckt wurde (set_following, 0080). */
export type FolgenQuelle = 'beitrag' | 'home' | 'profil' | 'suche' | 'liste';

export type PostDetail =
  | { gesperrt: false; post: Post; kommentare: PostComment[] }
  | { gesperrt: true; wer: HomePerson };

export type CreatePostResult = {
  id: string;
  status: 'visible' | 'blocked';
  reason: string | null;
};

/** Die Beitraege einer Person, seitenweise (get_user_posts, 0078). */
export type UserPostsPage = {
  /** Wer nicht folgt, sieht die Anzahl, aber nicht den Inhalt. */
  gesperrt: boolean;
  anzahl: number;
  posts: Post[];
};

/** Eine Zeile aus notifications (0051, Arten erweitert in 0078). */
export type AppNotification = {
  id: string;
  user_id: string;
  kind:
    | 'follow' | 'repost' | 'review' | 'streak'
    | 'post_like' | 'post_comment' | 'comment_reply' | 'post_repost' | 'duel'
    | 'comment_like'
    | string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  sent_at: string | null;
  read_at: string | null;
  dedupe_key: string | null;
};

type HomeBasis = { at: string; wer: HomePerson };

export type HomeEntry =
  | (HomeBasis & { art: 'post'; was: Post })
  | (HomeBasis & {
      art: 'repost';
      was: PostCard & {
        comment: string | null;
        likes: number;
        kommentare: number;
        ich_like: boolean;
        ich_repost: boolean;
      };
    })
  | (HomeBasis & { art: 'frage'; was: { content_id: string; title: string; body: string } })
  // Nur der Sieger, nicht gegen wen (0077).
  | (HomeBasis & { art: 'duell'; was: { punkte: number; gegner_punkte: number } })
  | (HomeBasis & { art: 'kurs'; was: { slug: string; title: string; lessons: number } })
  | (HomeBasis & { art: 'abzeichen'; was: { title: string; emoji: string | null } })
  | (HomeBasis & { art: 'folgt'; was: HomePerson & { bin_ich: boolean } });

export type HomeData = {
  eintraege: HomeEntry[];
  /** Wer von meinen Leuten zuletzt etwas gemacht hat, neueste zuerst. */
  leute: (HomePerson & { zuletzt: string })[];
  folge_ich: number;
  vorschlaege: (HomePerson & { id: string; follower_count: number; grund: string | null })[];
};

export type FollowingItem = {
  kind: 'repost';
  content_id: string;
  title: string;
  deck: string | null;
  category: string;
  /** Bleibt in der Nutzlast: der Link aufs Profil laeuft darueber. */
  handle: string;
  display_name: string;
  avatar_seed: string;
  avatar_path: string | null;
  comment: string | null;
  at: string;
};

/**
 * Ein Eintrag in einer der beiden eigenen Sammlungen (Empfohlen, Geliked).
 *
 * Dieselbe Form im Profilauszug und in der vollstaendigen Liste - sonst
 * haette der zweite Bildschirm eine zweite Form desselben Dings.
 */
export type CollectionEntry = {
  content_id: string;
  title: string;
  category: string;
  comment: string | null;
  likes: number;
  at: string;
};

export type MySocial = {
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_seed: string;
  avatar_path: string | null;
  follower_count: number;
  following_count: number;
  likes_public: boolean;
  repost_count: number;
  like_count: number;
  reposts: CollectionEntry[];
  likes: CollectionEntry[];
};

// --- Tagesaufgabe ------------------------------------------------------------

export type DailyQuestion = {
  pos: number;
  content_id: string;
  title: string;
  deck: string | null;
  category: string;
  difficulty: number;
  question: string;
  /** Nur die Optionen. Der richtige Index kommt erst mit dem Ergebnis. */
  options: string[];
};

export type DailyResultSummary = {
  correct: number;
  total: number;
  duration_ms: number;
  answers: number[];
  finished_at: string;
};

export type DailyChallenge = {
  date: string;
  available: boolean;
  language?: string;
  /** Gesetzt, wenn heute schon gespielt wurde. */
  result?: DailyResultSummary | null;
  questions?: DailyQuestion[];
};

export type DailyDetail = {
  content_id: string;
  correct_index: number;
  chosen: number;
  ok: boolean;
  explanation: string | null;
};

export type DailySubmission = {
  correct: number;
  total: number;
  xp?: number;
  duration_ms: number;
  detail?: DailyDetail[];
  /** true, wenn heute schon gespielt wurde - dann kommt nur das Ergebnis. */
  repeat: boolean;
};

export type DailyLeaderRow = {
  pos: number;
  handle: string;
  display_name: string;
  avatar_seed: string;
  avatar_path: string | null;
  correct: number;
  total: number;
  duration_ms: number;
  is_me: boolean;
};

export type DailyLeaderboard = {
  date: string;
  rows: DailyLeaderRow[];
  me: { pos: number; correct: number; total: number; duration_ms: number } | null;
  players: number;
};

// --- Kommentare --------------------------------------------------------------

export type CommentAuthor = {
  handle: string;
  display_name: string;
  avatar_seed: string;
  avatar_path: string | null;
  is_mine: boolean;
};

export type CommentAnswer = CommentAuthor & {
  id: string;
  body: string;
  at: string;
};

export type CommentQuestion = CommentAnswer & {
  answers: CommentAnswer[];
};

export type PostCommentResult = {
  id: string;
  /** 'visible' oder 'blocked' - die Vorpruefung entscheidet sofort (0037). */
  status: 'visible' | 'blocked';
  reason: string | null;
};
