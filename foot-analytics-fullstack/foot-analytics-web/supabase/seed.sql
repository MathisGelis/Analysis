-- seed.sql — donnees d'exemple generees depuis FMI_Neuville1.pdf
-- A executer APRES schema.sql.

insert into saisons (id, libelle, debut, fin) values
  ('00000000-0000-0000-0000-0000000000s1','2025-2026','2025-08-01','2026-06-30');

insert into clubs (id, numero_fff, nom, ville) values
  ('00000000-0000-0000-0000-0000000000c1','504275','Neuville S/S','Neuville-sur-Saone'),
  ('00000000-0000-0000-0000-0000000000c2','560530','F.C. Meys Grezieu','Grezieu-la-Varenne');

insert into equipes (id, club_id, saison_id, nom, categorie, division, poule) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000s1','Neuville S/S 2','Seniors','D2','C'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000s1','F.C. Meys Grezieu 1','Seniors','D2','C');

insert into joueurs (licence, nom, prenom, club_id) values
  ('2546012357','DRONEAU','Lucas','00000000-0000-0000-0000-0000000000c1'),
  ('2548007372','BOURGEOIS BIDDI','Jason','00000000-0000-0000-0000-0000000000c1'),
  ('2547278913','MAYOUX','Theo','00000000-0000-0000-0000-0000000000c1'),
  ('2538644299','MANSOUR','Abdamalek','00000000-0000-0000-0000-0000000000c1'),
  ('2543026622','BOULY','Quentin','00000000-0000-0000-0000-0000000000c1'),
  ('2543280074','BEN KAHLA','Eddy','00000000-0000-0000-0000-0000000000c1'),
  ('2545972549','DAOUADI','Kais','00000000-0000-0000-0000-0000000000c1'),
  ('2546225705','SAAD','Nassim','00000000-0000-0000-0000-0000000000c1'),
  ('9603945687','NJIE','Abdoulie','00000000-0000-0000-0000-0000000000c1'),
  ('2543946440','GASPARD','Mael','00000000-0000-0000-0000-0000000000c1'),
  ('2546004300','KHARKHACHE','Nidal','00000000-0000-0000-0000-0000000000c1'),
  ('2578618153','MANOUBI','Nooman','00000000-0000-0000-0000-0000000000c1'),
  ('2546982285','CHAPELLE','Johan','00000000-0000-0000-0000-0000000000c1'),
  ('2546620828','PAVIOLO','Teemy','00000000-0000-0000-0000-0000000000c1'),
  ('2547017895','RAMBAUD','Enzo','00000000-0000-0000-0000-0000000000c2'),
  ('2544707143','PLEVY','Tanguy','00000000-0000-0000-0000-0000000000c2'),
  ('2546076078','VILLARD','Louis','00000000-0000-0000-0000-0000000000c2'),
  ('2546543220','BESSON','Charly','00000000-0000-0000-0000-0000000000c2'),
  ('2547075495','PALLANDRE','Damien','00000000-0000-0000-0000-0000000000c2'),
  ('2544352790','GRANGE','Timothe','00000000-0000-0000-0000-0000000000c2'),
  ('2546970692','GRANGE','Enzo','00000000-0000-0000-0000-0000000000c2'),
  ('2545948137','CHARTIER','Tom','00000000-0000-0000-0000-0000000000c2'),
  ('2544707144','VENET','Baptiste','00000000-0000-0000-0000-0000000000c2'),
  ('2544352800','VILLEMAGNE','Leo','00000000-0000-0000-0000-0000000000c2'),
  ('2546549334','VERICEL','Lois','00000000-0000-0000-0000-0000000000c2'),
  ('2546980459','GRANGE','Robin','00000000-0000-0000-0000-0000000000c2'),
  ('2544320319','GRANJON','Alexandre','00000000-0000-0000-0000-0000000000c2')
on conflict (licence) do nothing;

insert into arbitres (id, licence, nom_complet, tendance) values
  ('00000000-0000-0000-0000-0000000000a1','2543106382','FARGEOT Jeremy','stricte');

insert into matchs (id, numero_fmi, saison_id, journee, date, heure, competition, poule, terrain, equipe_dom_id, equipe_ext_id, score_dom, score_ext, arbitre_id, formation_dom, formation_ext) values
  ('00000000-0000-0000-0000-0000000000m1','53415223','00000000-0000-0000-0000-0000000000s1','J16','2026-01-18','15:00','Seniors D2 / Phase Unique','C','STADE JEAN OBOUSSIER 2','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2',2,0,'00000000-0000-0000-0000-0000000000a1','4-4-2','4-2-3-1');

insert into compositions (match_id, equipe_id, joueur_id, numero, titulaire, capitaine)
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 1, true, false from joueurs where licence='2546012357'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 2, true, false from joueurs where licence='2548007372'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 3, true, false from joueurs where licence='2547278913'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 4, true, true from joueurs where licence='2538644299'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 5, true, false from joueurs where licence='2543026622'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 6, true, false from joueurs where licence='2543280074'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 7, true, false from joueurs where licence='2545972549'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 8, true, false from joueurs where licence='2546225705'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 9, true, false from joueurs where licence='9603945687'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 10, true, false from joueurs where licence='2543946440'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 11, true, false from joueurs where licence='2546004300'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 12, false, false from joueurs where licence='2578618153'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 13, false, false from joueurs where licence='2546982285'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 14, false, false from joueurs where licence='2546620828'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 1, true, false from joueurs where licence='2547017895'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 2, true, false from joueurs where licence='2544707143'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 3, true, false from joueurs where licence='2546076078'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 4, true, false from joueurs where licence='2546543220'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 5, true, false from joueurs where licence='2547075495'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 6, true, false from joueurs where licence='2544352790'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 7, true, false from joueurs where licence='2546970692'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 8, true, false from joueurs where licence='2545948137'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 9, true, false from joueurs where licence='2544707144'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 10, true, true from joueurs where licence='2544352800'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 11, true, false from joueurs where licence='2546549334'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 12, false, false from joueurs where licence='2546980459'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 13, false, false from joueurs where licence='2544320319';

insert into evenements_match (match_id, joueur_id, type, sous_type, motif, minute, arret)
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Enfreindre avec persistance les Lois du Jeu',90,3 from joueurs where licence='2544320319'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','rouge','Commet un acte de brutalité',59,0 from joueurs where licence='2538644299'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Comportement antisportif',19,0 from joueurs where licence='2543280074'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Désapprobation en paroles ou en actes',60,0 from joueurs where licence='2545972549'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Comportement antisportif',90,4 from joueurs where licence='2546982285'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Retarder la reprise du jeu',90,2 from joueurs where licence='2548007372';
