-- =============================================================================
-- 0047_dedupe_cleanup.sql  ·  Die Dubletten, die schon drin sind
--
-- 0046 verhindert neue. Diese Datei raeumt die alten weg - ohne sie
-- bleibt der Feed so lange doppelt, bis die betroffenen Karten
-- irgendwann von selbst verfallen.
--
-- Gemessen an drei Karten ueber denselben Satellitenstart:
--
--     "Start der Missionen FLEX und Sentinel-3C"
--     "Neuer Satellitenstart von FLEX und Sentinel-3C"   0.923
--     "Die FLEX-Mission der ESA"                         0.932 / 0.962
--
-- Die Schwelle steht hier auf 0.90 und nicht auf den 0.86 der Pipeline.
-- Der Unterschied ist Absicht: eine Karte gar nicht erst anzulegen kostet
-- nichts, eine bestehende nachtraeglich zu verwerfen schon - deshalb
-- rueckwirkend nur, was zweifelsfrei dasselbe erzaehlt.
--
-- Behalten wird die aelteste jeder Gruppe. Nicht die beste - das kann
-- eine Abfrage nicht wissen -, sondern die, die zuerst da war: wer sie
-- schon gesehen hat, soll sie nicht ein zweites Mal unter anderem Titel
-- bekommen.
-- =============================================================================

with doppelt as (
  select distinct b.id
    from public.content_items a
    join public.content_items b
      on b.created_at > a.created_at
     and (1 - (a.embedding operator(public.<=>) b.embedding)) >= 0.90
   where a.status = 'approved'
     and b.status = 'approved'
     and a.embedding is not null
     and b.embedding is not null
)
update public.content_items ci
   set status = 'rejected',
       reject_reason = 'Dublette (0047): erzaehlt dasselbe wie eine aeltere Karte'
  from doppelt d
 where ci.id = d.id;
