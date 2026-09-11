-- =============================================================================
-- 0025_shuffle_answers.sql  ·  Die richtige Antwort steht nicht mehr immer in
--                              der Mitte
--
-- Nachgezaehlt im Demo-Bestand: 21 von 22 Quizfragen hatten correct_index 1.
-- Also praktisch alle. Wer immer die mittlere Antwort waehlt, kommt damit auf
-- rund 95 Prozent, ohne eine Karte gelesen zu haben.
--
-- Bis eben war das ein Schoenheitsfehler beim Testen. Mit der Tagesaufgabe
-- (0022) ist es einer, der zaehlt: die Rangliste wuerde messen, wer den
-- Trick kennt, nicht wer etwas weiss. Und eine Rangliste, der man ansieht,
-- dass sie sich austricksen laesst, schaut sich niemand ein zweites Mal an.
--
-- Diese Migration mischt die Optionen aller bestehenden Karten neu. Die
-- Pipeline mischt seit derselben Aenderung schon beim Erzeugen
-- (transform/generate.py, _shuffle_options) - dort ist es der eigentliche
-- Ort, weil Sprachmodelle diese Vorliebe zuverlaessig mitbringen.
--
-- Sicherheit der Umstellung: es wird nur umgestellt, nie ersetzt. Der Text
-- der richtigen Antwort wird vorher gemerkt und der neue Index danach
-- daraus bestimmt. Eine Karte, deren correct_index nicht in die Optionen
-- zeigt, bleibt unberuehrt statt kaputtrepariert zu werden.
-- =============================================================================

do $do$
declare
  v_row     record;
  v_items   jsonb;
  v_item    jsonb;
  v_opts    jsonb;
  v_correct text;
  v_shuf    jsonb;
  v_idx     int;
  v_new     jsonb;
  v_touched int := 0;
begin
  for v_row in
    select id, quiz_items from public.content_items
     where jsonb_array_length(quiz_items) > 0
  loop
    v_new := '[]'::jsonb;

    for v_item in select * from jsonb_array_elements(v_row.quiz_items)
    loop
      v_opts := v_item -> 'options';

      -- Nur echte Auswahlfragen mit gueltigem Index anfassen.
      if jsonb_typeof(v_opts) <> 'array'
         or jsonb_array_length(v_opts) < 2
         or (v_item ->> 'correct_index') is null
         or (v_item ->> 'correct_index')::int < 0
         or (v_item ->> 'correct_index')::int >= jsonb_array_length(v_opts)
      then
        v_new := v_new || jsonb_build_array(v_item);
        continue;
      end if;

      v_correct := v_opts ->> (v_item ->> 'correct_index')::int;

      select jsonb_agg(value order by random()) into v_shuf
        from jsonb_array_elements(v_opts);

      -- Position der richtigen Antwort in der neuen Reihenfolge suchen.
      select ord - 1 into v_idx
        from jsonb_array_elements_text(v_shuf) with ordinality as e(val, ord)
       where e.val = v_correct
       limit 1;

      if v_idx is null then
        -- Kann nur passieren, wenn zwei Optionen denselben Text haben.
        -- Dann lieber alles lassen, wie es war.
        v_new := v_new || jsonb_build_array(v_item);
        continue;
      end if;

      v_new := v_new || jsonb_build_array(
        v_item || jsonb_build_object('options', v_shuf, 'correct_index', v_idx)
      );
    end loop;

    update public.content_items
       set quiz_items = v_new
     where id = v_row.id;

    v_touched := v_touched + 1;
  end loop;

  raise notice 'Antwortreihenfolge in % Karten neu gemischt', v_touched;
end
$do$;


-- --- Nachweis, dass es gewirkt hat ------------------------------------------
-- Nach dem Mischen sollte keine Position mehr weit ueber einem Drittel
-- liegen. Bei wenigen Karten schwankt das stark, deshalb nur ein Hinweis
-- und kein Abbruch.
do $do$
declare
  v_total int;
  v_max   int;
begin
  select count(*) into v_total
    from public.content_items where jsonb_array_length(quiz_items) > 0;

  select max(n) into v_max from (
    select count(*) as n
      from public.content_items
     where jsonb_array_length(quiz_items) > 0
     group by (quiz_items -> 0 ->> 'correct_index')
  ) t;

  raise notice 'Karten mit Quiz: % · haeufigste Antwortposition kommt %x vor',
    v_total, v_max;
end
$do$;
