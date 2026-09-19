-- =============================================================================
-- 0102_anker_ligen.sql  ·  Ankereffekt: die eigene Liga als Vergleich
--
-- Der Ankereffekt zeigte bisher nur den Schnitt ALLER. Jetzt zusaetzlich je
-- Liga (0100), in der man ist: "Wie stark hat die Zufallszahl die 4B
-- gelenkt?" - Klassen-Umfrage im Ankereffekt-Stil.
--
-- Schutz: Ein Liga-Schnitt erscheint erst ab drei Antworten in der Gruppe.
-- Bei zwei Leuten kennt jede ihre eigene Zahl und kann die andere aus dem
-- Schnitt zurueckrechnen. Einzelwerte gibt diese Funktion nie heraus.
-- =============================================================================

create or replace function public.anker_ligen()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'liga', l.name,
           'n', s.n,
           'niedrig', case when s.n >= 3 then jsonb_build_object('n', s.n_niedrig, 'schnitt', s.s_niedrig) end,
           'hoch',    case when s.n >= 3 then jsonb_build_object('n', s.n_hoch, 'schnitt', s.s_hoch) end
         ) order by l.created_at), '[]'::jsonb)
    from public.ligen l
    join public.liga_mitglieder me on me.liga_id = l.id and me.user_id = auth.uid()
    cross join lateral (
      select count(*) as n,
             count(*) filter (where a.anker = 10) as n_niedrig,
             round(avg(a.schaetzung) filter (where a.anker = 10)) as s_niedrig,
             count(*) filter (where a.anker = 65) as n_hoch,
             round(avg(a.schaetzung) filter (where a.anker = 65)) as s_hoch
        from public.liga_mitglieder m
        join public.lab_anker a on a.user_id = m.user_id
       where m.liga_id = l.id
    ) s;
$fn$;
revoke execute on function public.anker_ligen() from anon;
grant execute on function public.anker_ligen() to authenticated;

notify pgrst, 'reload schema';
