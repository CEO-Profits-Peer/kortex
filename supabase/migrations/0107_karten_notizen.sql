-- =============================================================================
-- 0107_karten_notizen.sql  ·  Eigene Stichworte zu einer Karte
--
-- Eine kurze Notiz je Person und Karte (bis 280 Zeichen), privat. Sie steht
-- unter der Karte und taucht beim Wiederholen ueber der Frage wieder auf -
-- das eigene Stichwort ist oft die beste Erinnerungsstuetze.
--
-- Nur ueber die zwei Funktionen, keine Tabellenrechte: Notizen anderer sind
-- nie lesbar.
-- =============================================================================

create table if not exists public.karten_notizen (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  text       text not null check (length(text) between 1 and 280),
  at         timestamptz not null default now(),
  primary key (user_id, content_id)
);
alter table public.karten_notizen enable row level security;
revoke all on public.karten_notizen from anon, authenticated;

create or replace function public.notiz_setzen(p_content uuid, p_text text)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
  v_t  text := btrim(coalesce(p_text, ''));
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if v_t = '' then
    delete from public.karten_notizen where user_id = v_me and content_id = p_content;
    return;
  end if;
  if length(v_t) > 280 then raise exception 'Höchstens 280 Zeichen'; end if;
  insert into public.karten_notizen (user_id, content_id, text) values (v_me, p_content, v_t)
  on conflict (user_id, content_id) do update set text = excluded.text, at = now();
end
$fn$;

create or replace function public.notizen(p_ids uuid[])
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_object_agg(content_id::text, text), '{}'::jsonb)
    from public.karten_notizen
   where user_id = auth.uid() and content_id = any (p_ids[1:100]);
$fn$;

revoke execute on function public.notiz_setzen(uuid, text), public.notizen(uuid[]) from anon;
grant execute on function public.notiz_setzen(uuid, text), public.notizen(uuid[]) to authenticated;

notify pgrst, 'reload schema';
