-- =============================================================================
-- 0119_lokale_karten.sql  ·  Karten fuer das eigene Bundesland
--
-- Die Kategorie "Regional" (local.at/.de/.ch/.ca) gab es, aber nur mit
-- Nachrichten auf Landesebene. Jetzt: Evergreen-Karten je Bundesland,
-- Kanton und Provinz - das Land selbst, sein Landtag, die Hauptstadt und je
-- nach Land ein Thema, das dort jeder kennt (Wiener Linien, Salzburger
-- Festspiele, Kaerntner Volksabstimmung ...). 122 Artikel, alle geprueft.
--
-- Wie sie nur dort ankommen: content_items.region_code. Der Feed zeigt eine
-- Karte mit region_code nur, wenn er zum Land oder zur Region im Profil
-- passt (seit 0003, unveraendert in get_feed 0067). Die Pipeline setzt den
-- Code aus topic_memory.region_code (evergreen.py).
--
-- Themen, die es schon gibt (etwa "Wien" aus der Handliste), bleiben wie
-- sie sind: on conflict do nothing.
-- =============================================================================

alter table public.topic_memory drop constraint if exists topic_memory_herkunft_check;
alter table public.topic_memory add constraint topic_memory_herkunft_check
  check (herkunft in ('liste', 'entdeckt', 'wunsch', 'regional'));
alter table public.topic_memory add column if not exists region_code text;

insert into public.topic_memory (language, title, category_id, herkunft, status, region_code)
select v.language, v.title, v.category_id, 'regional', 'offen', v.region_code
  from (values
  ('de', 'Burgenland', 'local.at', 'AT-1'),
  ('de', 'Burgenländischer Landtag', 'local.at', 'AT-1'),
  ('de', 'Eisenstadt', 'local.at', 'AT-1'),
  ('de', 'Neusiedler See', 'local.at', 'AT-1'),
  ('de', 'Kärnten', 'local.at', 'AT-2'),
  ('de', 'Kärntner Landtag', 'local.at', 'AT-2'),
  ('de', 'Klagenfurt am Wörthersee', 'local.at', 'AT-2'),
  ('de', 'Volksabstimmung in Kärnten 1920', 'local.at', 'AT-2'),
  ('de', 'Niederösterreich', 'local.at', 'AT-3'),
  ('de', 'Landtag von Niederösterreich', 'local.at', 'AT-3'),
  ('de', 'St. Pölten', 'local.at', 'AT-3'),
  ('de', 'Wachau', 'local.at', 'AT-3'),
  ('de', 'Oberösterreich', 'local.at', 'AT-4'),
  ('de', 'Oberösterreichischer Landtag', 'local.at', 'AT-4'),
  ('de', 'Linz', 'local.at', 'AT-4'),
  ('de', 'Voestalpine', 'local.at', 'AT-4'),
  ('de', 'Land Salzburg', 'local.at', 'AT-5'),
  ('de', 'Salzburger Landtag', 'local.at', 'AT-5'),
  ('de', 'Salzburg', 'local.at', 'AT-5'),
  ('de', 'Salzburger Festspiele', 'local.at', 'AT-5'),
  ('de', 'Steiermark', 'local.at', 'AT-6'),
  ('de', 'Landtag Steiermark', 'local.at', 'AT-6'),
  ('de', 'Graz', 'local.at', 'AT-6'),
  ('de', 'Erzberg', 'local.at', 'AT-6'),
  ('de', 'Tirol (Bundesland)', 'local.at', 'AT-7'),
  ('de', 'Tiroler Landtag', 'local.at', 'AT-7'),
  ('de', 'Innsbruck', 'local.at', 'AT-7'),
  ('de', 'Tiroler Volksaufstand', 'local.at', 'AT-7'),
  ('de', 'Vorarlberg', 'local.at', 'AT-8'),
  ('de', 'Vorarlberger Landtag', 'local.at', 'AT-8'),
  ('de', 'Bregenz', 'local.at', 'AT-8'),
  ('de', 'Bodensee', 'local.at', 'AT-8'),
  ('de', 'Wien', 'local.at', 'AT-9'),
  ('de', 'Wiener Gemeinderat und Landtag', 'local.at', 'AT-9'),
  ('de', 'Wiener Linien', 'local.at', 'AT-9'),
  ('de', 'Gemeindebau', 'local.at', 'AT-9'),
  ('de', 'Baden-Württemberg', 'local.de', 'DE-BW'),
  ('de', 'Stuttgart', 'local.de', 'DE-BW'),
  ('de', 'Bayern', 'local.de', 'DE-BY'),
  ('de', 'München', 'local.de', 'DE-BY'),
  ('de', 'Berlin', 'local.de', 'DE-BE'),
  ('de', 'Abgeordnetenhaus von Berlin', 'local.de', 'DE-BE'),
  ('de', 'Brandenburg', 'local.de', 'DE-BB'),
  ('de', 'Potsdam', 'local.de', 'DE-BB'),
  ('de', 'Freie Hansestadt Bremen', 'local.de', 'DE-HB'),
  ('de', 'Bremische Bürgerschaft', 'local.de', 'DE-HB'),
  ('de', 'Hamburg', 'local.de', 'DE-HH'),
  ('de', 'Hamburgische Bürgerschaft', 'local.de', 'DE-HH'),
  ('de', 'Hessen', 'local.de', 'DE-HE'),
  ('de', 'Wiesbaden', 'local.de', 'DE-HE'),
  ('de', 'Mecklenburg-Vorpommern', 'local.de', 'DE-MV'),
  ('de', 'Schwerin', 'local.de', 'DE-MV'),
  ('de', 'Niedersachsen', 'local.de', 'DE-NI'),
  ('de', 'Hannover', 'local.de', 'DE-NI'),
  ('de', 'Nordrhein-Westfalen', 'local.de', 'DE-NW'),
  ('de', 'Düsseldorf', 'local.de', 'DE-NW'),
  ('de', 'Rheinland-Pfalz', 'local.de', 'DE-RP'),
  ('de', 'Mainz', 'local.de', 'DE-RP'),
  ('de', 'Saarland', 'local.de', 'DE-SL'),
  ('de', 'Saarbrücken', 'local.de', 'DE-SL'),
  ('de', 'Sachsen', 'local.de', 'DE-SN'),
  ('de', 'Dresden', 'local.de', 'DE-SN'),
  ('de', 'Sachsen-Anhalt', 'local.de', 'DE-ST'),
  ('de', 'Magdeburg', 'local.de', 'DE-ST'),
  ('de', 'Schleswig-Holstein', 'local.de', 'DE-SH'),
  ('de', 'Kiel', 'local.de', 'DE-SH'),
  ('de', 'Thüringen', 'local.de', 'DE-TH'),
  ('de', 'Erfurt', 'local.de', 'DE-TH'),
  ('de', 'Kanton Zürich', 'local.ch', 'CH-ZH'),
  ('de', 'Zürich', 'local.ch', 'CH-ZH'),
  ('de', 'Kanton Bern', 'local.ch', 'CH-BE'),
  ('de', 'Bern', 'local.ch', 'CH-BE'),
  ('de', 'Kanton Luzern', 'local.ch', 'CH-LU'),
  ('de', 'Luzern', 'local.ch', 'CH-LU'),
  ('de', 'Kanton Basel-Stadt', 'local.ch', 'CH-BS'),
  ('de', 'Basel', 'local.ch', 'CH-BS'),
  ('de', 'Kanton St. Gallen', 'local.ch', 'CH-SG'),
  ('de', 'St. Gallen', 'local.ch', 'CH-SG'),
  ('de', 'Kanton Aargau', 'local.ch', 'CH-AG'),
  ('de', 'Aarau', 'local.ch', 'CH-AG'),
  ('de', 'Kanton Tessin', 'local.ch', 'CH-TI'),
  ('de', 'Bellinzona', 'local.ch', 'CH-TI'),
  ('de', 'Kanton Waadt', 'local.ch', 'CH-VD'),
  ('de', 'Lausanne', 'local.ch', 'CH-VD'),
  ('de', 'Kanton Genf', 'local.ch', 'CH-GE'),
  ('de', 'Genf', 'local.ch', 'CH-GE'),
  ('en', 'Ontario', 'local.ca', 'CA-ON'),
  ('en', 'Legislative Assembly of Ontario', 'local.ca', 'CA-ON'),
  ('en', 'Toronto', 'local.ca', 'CA-ON'),
  ('en', 'Quebec', 'local.ca', 'CA-QC'),
  ('en', 'National Assembly of Quebec', 'local.ca', 'CA-QC'),
  ('en', 'Montreal', 'local.ca', 'CA-QC'),
  ('en', 'British Columbia', 'local.ca', 'CA-BC'),
  ('en', 'Legislative Assembly of British Columbia', 'local.ca', 'CA-BC'),
  ('en', 'Vancouver', 'local.ca', 'CA-BC'),
  ('en', 'Alberta', 'local.ca', 'CA-AB'),
  ('en', 'Legislative Assembly of Alberta', 'local.ca', 'CA-AB'),
  ('en', 'Calgary', 'local.ca', 'CA-AB'),
  ('en', 'Manitoba', 'local.ca', 'CA-MB'),
  ('en', 'Legislative Assembly of Manitoba', 'local.ca', 'CA-MB'),
  ('en', 'Winnipeg', 'local.ca', 'CA-MB'),
  ('en', 'Saskatchewan', 'local.ca', 'CA-SK'),
  ('en', 'Legislative Assembly of Saskatchewan', 'local.ca', 'CA-SK'),
  ('en', 'Regina, Saskatchewan', 'local.ca', 'CA-SK'),
  ('en', 'Nova Scotia', 'local.ca', 'CA-NS'),
  ('en', 'Nova Scotia House of Assembly', 'local.ca', 'CA-NS'),
  ('en', 'Halifax, Nova Scotia', 'local.ca', 'CA-NS'),
  ('en', 'New Brunswick', 'local.ca', 'CA-NB'),
  ('en', 'Legislative Assembly of New Brunswick', 'local.ca', 'CA-NB'),
  ('en', 'Fredericton', 'local.ca', 'CA-NB'),
  ('en', 'Newfoundland and Labrador', 'local.ca', 'CA-NL'),
  ('en', 'Newfoundland and Labrador House of Assembly', 'local.ca', 'CA-NL'),
  ('en', 'St. John''s, Newfoundland and Labrador', 'local.ca', 'CA-NL'),
  ('en', 'Prince Edward Island', 'local.ca', 'CA-PE'),
  ('en', 'Legislative Assembly of Prince Edward Island', 'local.ca', 'CA-PE'),
  ('en', 'Charlottetown', 'local.ca', 'CA-PE'),
  ('en', 'Yukon', 'local.ca', 'CA-YT'),
  ('en', 'Whitehorse', 'local.ca', 'CA-YT'),
  ('en', 'Northwest Territories', 'local.ca', 'CA-NT'),
  ('en', 'Yellowknife', 'local.ca', 'CA-NT'),
  ('en', 'Nunavut', 'local.ca', 'CA-NU'),
  ('en', 'Iqaluit', 'local.ca', 'CA-NU')
  ) as v(language, title, category_id, region_code)
 where exists (select 1 from public.categories c where c.id = v.category_id)
on conflict (language, title) do nothing;

do $test$
declare
  v_n int;
begin
  select count(*) into v_n from public.topic_memory where herkunft = 'regional';
  if v_n < 100 then raise exception 'Selbsttest 0119: nur % regionale Themen', v_n; end if;
  raise notice 'Selbsttest 0119: % regionale Themen', v_n;
end
$test$;
