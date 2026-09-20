-- =============================================================================
-- 0120_wunsch_grund.sql  ·  Ein Satz zur Entscheidung
--
-- Bisher sah man bei einem abgelehnten Themenwunsch nur "Nicht dabei". Das
-- ist ehrlich, aber unfreundlich: wer sich etwas wuenscht, will wissen,
-- warum nicht. Jetzt kann im Kontrollzentrum ein Satz dazu geschrieben
-- werden - bei Ja wie bei Nein -, und er steht bei der Person unter ihrem
-- Wunsch.
--
-- admin_wunsch_entscheiden und meine_wuensche vollstaendig aus 0111, plus
-- p_grund bzw. 'grund'.
-- =============================================================================

alter table public.themen_freigabe add column if not exists grund text;

create or replace function public.admin_wunsch_entscheiden(
  p_pin text, p_norm text, p_language text, p_ja boolean,
  p_anzeige text default null, p_suchbegriff text default null, p_kategorie text default null,
  p_grund text default null)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_text text;
begin
  perform public.assert_admin(p_pin);
  select w.text into v_text from public.themen_wuensche w
   where w.norm = p_norm and w.language = p_language
   group by w.text order by count(*) desc limit 1;
  if v_text is null then raise exception 'Wunsch nicht gefunden'; end if;
  if p_ja then
    if not exists (select 1 from public.categories where id = p_kategorie and parent_id is not null) then
      raise exception 'Bitte eine Unterkategorie wählen';
    end if;
    if length(btrim(coalesce(p_suchbegriff, ''))) < 2 then raise exception 'Suchbegriff fehlt'; end if;
  end if;
  insert into public.themen_freigabe (norm, language, status, anzeige, suchbegriff, category_id, grund)
  values (p_norm, p_language, case when p_ja then 'frei' else 'nein' end,
          coalesce(nullif(btrim(p_anzeige), ''), v_text),
          case when p_ja then btrim(p_suchbegriff) end,
          case when p_ja then p_kategorie end,
          nullif(btrim(coalesce(p_grund, '')), ''))
  on conflict (norm, language) do update
     set status = excluded.status, anzeige = excluded.anzeige, suchbegriff = excluded.suchbegriff,
         category_id = excluded.category_id, grund = excluded.grund,
         entschieden_at = now(), titel = null;
end
$fn$;

-- Die alte Fassung ohne p_grund abraeumen, sonst stehen zwei Funktionen
-- gleichen Namens im Schema und PostgREST muss raten.
drop function if exists public.admin_wunsch_entscheiden(text, text, text, boolean, text, text, text);

create or replace function public.meine_wuensche()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'meine', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'text', w.text, 'created_at', w.created_at,
               'anzahl', (select count(*) from public.themen_wuensche x
                           where x.norm = w.norm and x.language = w.language),
               'status', coalesce(f.status, 'offen'),
               'anzeige', f.anzeige,
               'grund', f.grund)
             order by w.created_at desc)
        from public.themen_wuensche w
        left join public.themen_freigabe f on f.norm = w.norm and f.language = w.language
       where w.user_id = auth.uid()), '[]'::jsonb),
    'bald', coalesce((
      select jsonb_agg(jsonb_build_object('anzeige', f.anzeige, 'status', f.status,
                                          'category_id', f.category_id)
             order by f.entschieden_at desc)
        from (select * from public.themen_freigabe
               where status in ('frei', 'in_arbeit', 'fertig')
                 and language = any (public.user_feed_languages(auth.uid()))
               order by entschieden_at desc limit 12) f), '[]'::jsonb)
  );
$fn$;

revoke execute on function public.admin_wunsch_entscheiden(text, text, text, boolean, text, text, text, text) from anon;
grant execute on function public.admin_wunsch_entscheiden(text, text, text, boolean, text, text, text, text) to authenticated;

do $test$
declare
  v_j jsonb;
begin
  if not exists (select 1 from public.themen_wuensche) then
    raise notice 'Selbsttest 0120: keine Wuensche da';
    return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select user_id from public.themen_wuensche limit 1), 'role', 'authenticated')::text, true);
  v_j := public.meine_wuensche();
  if not (v_j->'meine'->0) ? 'grund' then raise exception 'Selbsttest 0120: grund fehlt: %', v_j; end if;
  raise notice 'Selbsttest 0120: ok';
end
$test$;

notify pgrst, 'reload schema';
