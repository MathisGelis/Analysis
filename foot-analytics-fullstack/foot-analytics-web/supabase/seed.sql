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
  ('9962255817','POKOREK','Lucas','00000000-0000-0000-0000-0000000000c1'),
  ('9910691378','VIGUSAGUZ KILOV','Jason','00000000-0000-0000-0000-0000000000c1'),
  ('9945928813','FIKOSE','Theo','00000000-0000-0000-0000-0000000000c1'),
  ('9976714585','LUDENOZ','Abdamalek','00000000-0000-0000-0000-0000000000c1'),
  ('9958478997','ZITUL','Quentin','00000000-0000-0000-0000-0000000000c1'),
  ('9953964748','MOL BUDAV','Eddy','00000000-0000-0000-0000-0000000000c1'),
  ('9939235836','KURIZIS','Kais','00000000-0000-0000-0000-0000000000c1'),
  ('9943560125','BIMO','Nassim','00000000-0000-0000-0000-0000000000c1'),
  ('9924200880','FIKU','Abdoulie','00000000-0000-0000-0000-0000000000c1'),
  ('9927908139','KIFIRIS','Mael','00000000-0000-0000-0000-0000000000c1'),
  ('9994287181','BILAZARUPA','Nidal','00000000-0000-0000-0000-0000000000c1'),
  ('9991806307','SAROPUV','Nooman','00000000-0000-0000-0000-0000000000c1'),
  ('9918132692','TORONOFO','Johan','00000000-0000-0000-0000-0000000000c1'),
  ('9917961573','ZUPADAG','Teemy','00000000-0000-0000-0000-0000000000c1'),
  ('9940783537','DOPOTIN','Enzo','00000000-0000-0000-0000-0000000000c2'),
  ('9935502304','KEFAP','Tanguy','00000000-0000-0000-0000-0000000000c2'),
  ('9911861625','BELATIN','Louis','00000000-0000-0000-0000-0000000000c2'),
  ('9910411910','NEKUGE','Charly','00000000-0000-0000-0000-0000000000c2'),
  ('9920331787','BIRIFEFEM','Damien','00000000-0000-0000-0000-0000000000c2'),
  ('9964296552','LAZIBU','Timothe','00000000-0000-0000-0000-0000000000c2'),
  ('9969178574','LAZIBU','Enzo','00000000-0000-0000-0000-0000000000c2'),
  ('9914881281','DUGESETE','Tom','00000000-0000-0000-0000-0000000000c2'),
  ('9952517805','MAREB','Baptiste','00000000-0000-0000-0000-0000000000c2'),
  ('9948418805','BOBUVONUVO','Leo','00000000-0000-0000-0000-0000000000c2'),
  ('9983922136','RIBAZUK','Lois','00000000-0000-0000-0000-0000000000c2'),
  ('9937406960','LAZIBU','Robin','00000000-0000-0000-0000-0000000000c2'),
  ('9925091589','REPELEN','Alexandre','00000000-0000-0000-0000-0000000000c2')
on conflict (licence) do nothing;

insert into arbitres (id, licence, nom_complet, tendance) values
  ('00000000-0000-0000-0000-0000000000a1','9948075103','DOPAMAD Defari','stricte');

insert into matchs (id, numero_fmi, saison_id, journee, date, heure, competition, poule, terrain, equipe_dom_id, equipe_ext_id, score_dom, score_ext, arbitre_id, formation_dom, formation_ext) values
  ('00000000-0000-0000-0000-0000000000m1','53415223','00000000-0000-0000-0000-0000000000s1','J16','2026-01-18','15:00','Seniors D2 / Phase Unique','C','STADE JEAN OBOUSSIER 2','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2',2,0,'00000000-0000-0000-0000-0000000000a1','4-4-2','4-2-3-1');

insert into compositions (match_id, equipe_id, joueur_id, numero, titulaire, capitaine)
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 1, true, false from joueurs where licence='9962255817'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 2, true, false from joueurs where licence='9910691378'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 3, true, false from joueurs where licence='9945928813'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 4, true, true from joueurs where licence='9976714585'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 5, true, false from joueurs where licence='9958478997'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 6, true, false from joueurs where licence='9953964748'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 7, true, false from joueurs where licence='9939235836'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 8, true, false from joueurs where licence='9943560125'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 9, true, false from joueurs where licence='9924200880'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 10, true, false from joueurs where licence='9927908139'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 11, true, false from joueurs where licence='9994287181'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 12, false, false from joueurs where licence='9991806307'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 13, false, false from joueurs where licence='9918132692'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e1', id, 14, false, false from joueurs where licence='9917961573'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 1, true, false from joueurs where licence='9940783537'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 2, true, false from joueurs where licence='9935502304'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 3, true, false from joueurs where licence='9911861625'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 4, true, false from joueurs where licence='9910411910'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 5, true, false from joueurs where licence='9920331787'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 6, true, false from joueurs where licence='9964296552'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 7, true, false from joueurs where licence='9969178574'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 8, true, false from joueurs where licence='9914881281'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 9, true, false from joueurs where licence='9952517805'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 10, true, true from joueurs where licence='9948418805'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 11, true, false from joueurs where licence='9983922136'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 12, false, false from joueurs where licence='9937406960'
  union all
  select '00000000-0000-0000-0000-0000000000m1','00000000-0000-0000-0000-0000000000e2', id, 13, false, false from joueurs where licence='9925091589';

insert into evenements_match (match_id, joueur_id, type, sous_type, motif, minute, arret)
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Enfreindre avec persistance les Lois du Jeu',90,3 from joueurs where licence='9925091589'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','rouge','Commet un acte de brutalité',59,0 from joueurs where licence='9976714585'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Comportement antisportif',19,0 from joueurs where licence='9953964748'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Désapprobation en paroles ou en actes',60,0 from joueurs where licence='9939235836'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Comportement antisportif',90,4 from joueurs where licence='9918132692'
  union all
  select '00000000-0000-0000-0000-0000000000m1', id, 'carton','jaune','Retarder la reprise du jeu',90,2 from joueurs where licence='9910691378';
