-- =============================================================================
-- 0063_repost_earlier.sql  ·  Empfehlen darf man, bevor man fertig ist
--
-- Bisher liess set_repost() nur durch, was `is_read_validated` war. Das
-- klingt vernuenftig und ist in der Praxis eine gesperrte Taste: die
-- Lese-Validierung braucht `dwell_target_ms` bei mindestens 80 Prozent
-- Sichtbarkeit, und dieser Wert liegt im Bestand bei SIEBZEHN BIS ZWANZIG
-- SEKUNDEN je Karte.
--
-- Zwanzig Sekunden sind im Feed eine Ewigkeit. Der Moment, in dem man etwas
-- weiterempfehlen will, ist der Moment, in dem man es verstanden hat - und
-- der kommt bei einer Erklaerkarte nach dem dritten Takt, nicht nach dem
-- letzten. Wer bis dahin warten muss, tippt einmal, sieht "Lies die Karte
-- erst zu Ende" und tippt nie wieder.
--
-- Die Absicht der Sperre bleibt richtig: ein Repost darf kein Verteilkanal
-- fuer Karten sein, die niemand angesehen hat. Genau dagegen genuegt aber
-- schon eine echte Beruehrung. Neu reicht eines von drei Dingen:
--
--   * die Karte ist gelesen (wie bisher), ODER
--   * sie ist geliked - ein Like ist selbst eine bewusste Handlung, ODER
--   * sie war fuenf Sekunden zu sehen.
--
-- Fuenf Sekunden statt "die Haelfte des Ziels": eine feste Zahl ist
-- erklaerbar, und die halbe Zielzeit waere bei langen Karten weiter zehn
-- Sekunden gewesen - also dasselbe Problem, nur kleiner.
--
-- Was NICHT mitgeaendert wird: die gleiche Schwelle beim Kommentieren
-- (0037_comment_guard). Ein Kommentar ist eine Aussage ueber den Inhalt und
-- soll teurer sein als eine Empfehlung. Wenn sich das als falsch erweist,
-- ist es eine eigene Entscheidung und eine eigene Migration.
--
-- Vollstaendig aus der Fassung von 0016_social.sql neu geschrieben, nicht
-- aus einem Ausschnitt geflickt: dieselbe Einfuege-Logik samt
-- `on conflict ... do update set comment`, eine andere Bedingung davor.
-- =============================================================================

--: Ab wann eine Karte als "wirklich angesehen" gilt, nur fuer das Empfehlen.
create or replace function public.set_repost(
  p_content_id uuid,
  p_on         boolean,
  p_comment    text default null
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me        uuid := auth.uid();
  v_validated boolean;
  v_liked     boolean;
  v_dwell     int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  if p_on then
    select ucs.is_read_validated, ucs.is_liked, ucs.total_dwell_ms
      into v_validated, v_liked, v_dwell
      from public.user_content_state ucs
     where ucs.user_id = v_me and ucs.content_id = p_content_id;

    -- Keine Zeile heisst: die Karte war noch nie auf dem Bildschirm. Dann
    -- ist es kein Empfehlen, sondern ein Verteilen.
    if not coalesce(v_validated, false)
       and not coalesce(v_liked, false)
       and coalesce(v_dwell, 0) < 5000 then
      -- Wortlaut absichtlich unveraendert: die App erkennt 'not read'
      -- daran und zeigt einen eigenen Hinweis (ContentCard.tsx).
      raise exception 'card not read yet';
    end if;

    insert into public.reposts (user_id, content_id, comment)
    values (v_me, p_content_id, nullif(trim(coalesce(p_comment, '')), ''))
    on conflict (user_id, content_id) do update set comment = excluded.comment;
  else
    delete from public.reposts where user_id = v_me and content_id = p_content_id;
  end if;
end
$fn$;
grant execute on function public.set_repost(uuid, boolean, text) to authenticated;
