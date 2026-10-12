// Etat initial du schema, genere par `npm run migration:generate` puis rendu independant du schema (aucun "public" en dur).
import { MigrationInterface, QueryRunner } from "typeorm";

export class EtatInitial1790837514313 implements MigrationInterface {
    name = 'EtatInitial1790837514313'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "clubs" ("id" character varying NOT NULL, "numeroFff" character varying, "nom" character varying NOT NULL, "ville" character varying, "abbr" character varying, "couleur" character varying NOT NULL DEFAULT '#b6f24a', "logoUrl" character varying, "creeLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3aab2aa0b7ec1c45148ec750a55" UNIQUE ("numeroFff"), CONSTRAINT "PK_bb09bd0c8d5238aeaa8f86ee0d4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "saisons" ("id" character varying NOT NULL, "nom" character varying NOT NULL, "anneeDebut" integer NOT NULL, "actif" boolean NOT NULL DEFAULT false, "statut" character varying NOT NULL DEFAULT 'en_cours', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8f70aadc6467c4014236fc612a2" UNIQUE ("nom"), CONSTRAINT "PK_afb594698a8392991598c32f0b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "equipes" ("id" character varying NOT NULL, "club_id" character varying NOT NULL, "nom" character varying NOT NULL, "categorie" character varying, "division" character varying, "poule" character varying, "competitionLibelle" character varying, "saison_id" character varying, "coach" character varying, "formationDef" character varying NOT NULL DEFAULT '4-2-3-1', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9f0bfc492ee9542b0c0f42eb21d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_74d29030a241ac42d46d6dc7c0" ON "equipes" ("club_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_86e05649126e0f4fa87ffadb41" ON "equipes" ("saison_id") `);
        await queryRunner.query(`CREATE TABLE "joueurs" ("id" character varying NOT NULL, "licence" character varying, "nom" character varying NOT NULL, "prenom" character varying, "club_id" character varying, "equipesAttachees" text, "poste" character varying, "numeroFavori" integer, "statutMutation" character varying, "statutMutationSaisi" boolean NOT NULL DEFAULT false, "commentaire" character varying, "dateNaissance" character varying, "tailleCm" integer, "poidsKg" integer, "piedFort" character varying, "matchs" integer NOT NULL DEFAULT '0', "titularisations" integer NOT NULL DEFAULT '0', "minutes" integer NOT NULL DEFAULT '0', "cartonsJaunes" integer NOT NULL DEFAULT '0', "cartonsRouges" integer NOT NULL DEFAULT '0', "buts" integer NOT NULL DEFAULT '0', "passesDecisives" integer NOT NULL DEFAULT '0', "blessuresAnt" integer NOT NULL DEFAULT '0', "noteMoyenne" double precision, "scoreFatigue" integer, "fatigueEntree" text, "fatigueDetail" text, "acwr" double precision, "chargeAcute7j" double precision, "chargeChronic28j" double precision, "postes" character varying, "typeDiscipline" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3c5020a521cefbd5a176140af05" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ec839c48b9ef03310932627587" ON "joueurs" ("club_id") `);
        await queryRunner.query(`CREATE TABLE "matchs" ("id" character varying NOT NULL, "numeroFmi" character varying, "journee" character varying, "date" character varying, "heure" character varying, "competition" character varying, "poule" character varying, "terrain" character varying, "club_dom" character varying NOT NULL, "club_ext" character varying NOT NULL, "equipe_dom" character varying, "equipe_ext" character varying, "saison_id" character varying, "scoreDom" integer NOT NULL DEFAULT '0', "scoreExt" integer NOT NULL DEFAULT '0', "arbitre" character varying, "formationDom" character varying, "formationExt" character varying, "statut" character varying NOT NULL DEFAULT 'joue', "pdfUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_87c351976a1a16da1502c44ed4f" UNIQUE ("numeroFmi"), CONSTRAINT "PK_0fdbc8e05ccfb9533008b132189" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b870571dfa7258a4ae1d824dd1" ON "matchs" ("club_dom") `);
        await queryRunner.query(`CREATE INDEX "IDX_a48cd27309f488a4d0a750064b" ON "matchs" ("club_ext") `);
        await queryRunner.query(`CREATE INDEX "IDX_ab8b0703afe36fd710f22fdc5d" ON "matchs" ("equipe_dom") `);
        await queryRunner.query(`CREATE INDEX "IDX_86664713546a898d2551769d11" ON "matchs" ("equipe_ext") `);
        await queryRunner.query(`CREATE INDEX "IDX_933c96e75e3e91f8deaefb0f2a" ON "matchs" ("saison_id") `);
        await queryRunner.query(`CREATE TABLE "compositions" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "cote" character varying NOT NULL, "numero" integer NOT NULL, "nom" character varying NOT NULL, "prenom" character varying, "licence" character varying, "titulaire" boolean NOT NULL DEFAULT true, "capitaine" boolean NOT NULL DEFAULT false, "minutes" integer NOT NULL DEFAULT '0', "note" double precision, CONSTRAINT "PK_1879d30f7f40415af66ef448e97" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bcbcca64b25770b6327e3f8e0a" ON "compositions" ("match_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_bb446b2ba496e010a740a688f1" ON "compositions" ("nom") `);
        await queryRunner.query(`CREATE INDEX "IDX_6b79e5bc0c584d996e61333dd7" ON "compositions" ("licence") `);
        await queryRunner.query(`CREATE TABLE "evenements_match" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "type" character varying NOT NULL, "sousType" character varying, "motif" character varying, "minute" integer, "arret" integer NOT NULL DEFAULT '0', "joueur" character varying NOT NULL, "joueur2" character varying, "equipe" character varying NOT NULL, CONSTRAINT "PK_e08a9b8114360726c57d9248abf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6693189ded8daca48cc1141f50" ON "evenements_match" ("match_id") `);
        await queryRunner.query(`CREATE TABLE "entrainements" ("id" character varying NOT NULL, "equipe_id" character varying, "date" character varying, "jour" character varying, "heure" character varying, "type" character varying, "theme" character varying, "dureeMin" integer NOT NULL DEFAULT '90', "intensite" integer, "charge" double precision NOT NULL DEFAULT '0', "terrain" character varying, "espace" character varying, "presents" integer NOT NULL DEFAULT '0', "total" integer NOT NULL DEFAULT '0', "joueursPresents" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7ec6dd165342143d9a14e94ffad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_830d6bf7f232bc10d7cc28f10e" ON "entrainements" ("equipe_id") `);
        await queryRunner.query(`CREATE TABLE "blessures" ("id" character varying NOT NULL, "joueur_id" character varying NOT NULL, "joueurNom" character varying, "localisation" character varying, "gravite" character varying, "dateDebut" character varying, "retourEstime" character varying, "statut" character varying, "details" text, "risqueRecidive" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0ad5433e158bc9cc08815ba48e5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f67d291f4ce4c5cb59eea2417d" ON "blessures" ("joueur_id") `);
        await queryRunner.query(`CREATE TABLE "rapports_scouting" ("id" character varying NOT NULL, "club_id" character varying NOT NULL, "equipeNom" character varying NOT NULL, "auteur" character varying, "date" character varying, "classement" character varying, "points" integer NOT NULL DEFAULT '0', "bilan" character varying, "bilanDom" character varying, "bilanExt" character varying, "butsMarques" integer NOT NULL DEFAULT '0', "butsEncaisses" integer NOT NULL DEFAULT '0', "cartonsJaunes" integer NOT NULL DEFAULT '0', "cartonsRouges" integer NOT NULL DEFAULT '0', "dispositifAttendu" character varying, "commentaires" text, "capitaine" character varying, "joueursSuspendus" text, "joueursCles" text, "forces" text, "faiblesses" text, "resultats" text, "dernier11" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dc0864d090cef93878bb6012444" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ddbf094bd6676f2bb13ad83717" ON "rapports_scouting" ("club_id") `);
        await queryRunner.query(`CREATE TABLE "classement" ("id" character varying NOT NULL, "club_id" character varying NOT NULL, "equipe_id" character varying, "saison_id" character varying, "rang" integer NOT NULL, "joues" integer NOT NULL, "v" integer NOT NULL, "n" integer NOT NULL, "d" integer NOT NULL, "bp" integer NOT NULL, "bc" integer NOT NULL, "pts" integer NOT NULL, "forme" text, CONSTRAINT "PK_8c232d5e071d0c6f058f8203173" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0d05dc4b53655ef812fd144662" ON "classement" ("club_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_345eed56b48a2244893157bf74" ON "classement" ("equipe_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_d1c11e5f2f321319826ab86eb3" ON "classement" ("saison_id") `);
        await queryRunner.query(`CREATE TABLE "arbitres" ("id" character varying NOT NULL, "nom" character varying NOT NULL, "prenom" character varying, "matchsOfficies" integer NOT NULL DEFAULT '0', "cartonsJaunesDonnes" integer NOT NULL DEFAULT '0', "cartonsRougesDonnes" integer NOT NULL DEFAULT '0', "matchsPrincipal" integer NOT NULL DEFAULT '0', "matchsAssistant" integer NOT NULL DEFAULT '0', "matchsAutre" integer NOT NULL DEFAULT '0', "roles" character varying, "profil" character varying, "motifsTop" character varying, "noteMoyenne" double precision, "participations" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6c626eb74f54dca3cf22de4b5a9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "arbitres_matchs" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "arbitre_id" character varying NOT NULL, "role" character varying NOT NULL, "note" double precision, CONSTRAINT "PK_8d5433b6307a7da34d9fb1698f6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b94b234d4b46ed21476ea0d071" ON "arbitres_matchs" ("match_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_893a2f26cb34c832f792115115" ON "arbitres_matchs" ("arbitre_id") `);
        await queryRunner.query(`CREATE TABLE "coachs" ("id" character varying NOT NULL, "nom" character varying NOT NULL, "prenom" character varying, "licence" character varying, "club_id" character varying, "matchsPresent" integer NOT NULL DEFAULT '0', "v" integer NOT NULL DEFAULT '0', "n" integer NOT NULL DEFAULT '0', "d" integer NOT NULL DEFAULT '0', "categorie" character varying, "cartonsJaunes" integer NOT NULL DEFAULT '0', "cartonsRouges" integer NOT NULL DEFAULT '0', "motifsTop" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c52dfd0d2f367c351f0e112fdb0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a830ceb5b903f377d5de4b5b4d" ON "coachs" ("club_id") `);
        await queryRunner.query(`CREATE TABLE "staff_matchs" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "coach_id" character varying NOT NULL, "cote" character varying NOT NULL, "fonctions" character varying NOT NULL, CONSTRAINT "PK_8fc0a717d030245d0c0b5ee3db1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ccf90b307ba51af3c4533ded01" ON "staff_matchs" ("match_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e680fb82c26ad6be2548fc60f7" ON "staff_matchs" ("coach_id") `);
        await queryRunner.query(`CREATE TABLE "utilisateurs" ("id" character varying NOT NULL, "login" character varying NOT NULL, "prenom" character varying NOT NULL, "nom" character varying NOT NULL, "passwordHash" character varying NOT NULL, "mustChangePassword" boolean NOT NULL DEFAULT true, "role" character varying NOT NULL DEFAULT 'user', "clubId" character varying, "equipeIds" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d3c39b551c51a0bdc76e07b9197" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_189fdf5180b09409bccf122dc1" ON "utilisateurs" ("login") `);
        await queryRunner.query(`CREATE TABLE "stats_joueur_equipe" ("id" character varying NOT NULL, "joueur_id" character varying NOT NULL, "equipe_id" character varying NOT NULL, "buts" integer, "passesDecisives" integer, CONSTRAINT "PK_36e93c2721759011845cc08e3e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ddac3d4cddd4d6e82a7d2319ad" ON "stats_joueur_equipe" ("joueur_id", "equipe_id") `);
        await queryRunner.query(`CREATE TABLE "tactiques" ("id" character varying NOT NULL, "equipe_id" character varying NOT NULL, "match_id" character varying, "formation" character varying NOT NULL, "titulaires" text NOT NULL, "remplacants" text NOT NULL, "capitaineId" character varying, "notes" text, "creeLe" TIMESTAMP NOT NULL DEFAULT now(), "modifieLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_04f2f34ab052f9b31af0a2b7ff8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_00c4f93100c6d96dc86e54afd0" ON "tactiques" ("equipe_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f22fc053f4065cb513b64cf2b0" ON "tactiques" ("match_id") `);
        await queryRunner.query(`ALTER TABLE "equipes" ADD CONSTRAINT "FK_74d29030a241ac42d46d6dc7c05" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "equipes" ADD CONSTRAINT "FK_86e05649126e0f4fa87ffadb41e" FOREIGN KEY ("saison_id") REFERENCES "saisons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "joueurs" ADD CONSTRAINT "FK_ec839c48b9ef033109326275872" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "compositions" ADD CONSTRAINT "FK_bcbcca64b25770b6327e3f8e0a8" FOREIGN KEY ("match_id") REFERENCES "matchs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "evenements_match" ADD CONSTRAINT "FK_6693189ded8daca48cc1141f500" FOREIGN KEY ("match_id") REFERENCES "matchs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "arbitres_matchs" ADD CONSTRAINT "FK_b94b234d4b46ed21476ea0d0717" FOREIGN KEY ("match_id") REFERENCES "matchs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "arbitres_matchs" ADD CONSTRAINT "FK_893a2f26cb34c832f7921151152" FOREIGN KEY ("arbitre_id") REFERENCES "arbitres"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "coachs" ADD CONSTRAINT "FK_a830ceb5b903f377d5de4b5b4d4" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "staff_matchs" ADD CONSTRAINT "FK_ccf90b307ba51af3c4533ded017" FOREIGN KEY ("match_id") REFERENCES "matchs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "staff_matchs" ADD CONSTRAINT "FK_e680fb82c26ad6be2548fc60f72" FOREIGN KEY ("coach_id") REFERENCES "coachs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "staff_matchs" DROP CONSTRAINT "FK_e680fb82c26ad6be2548fc60f72"`);
        await queryRunner.query(`ALTER TABLE "staff_matchs" DROP CONSTRAINT "FK_ccf90b307ba51af3c4533ded017"`);
        await queryRunner.query(`ALTER TABLE "coachs" DROP CONSTRAINT "FK_a830ceb5b903f377d5de4b5b4d4"`);
        await queryRunner.query(`ALTER TABLE "arbitres_matchs" DROP CONSTRAINT "FK_893a2f26cb34c832f7921151152"`);
        await queryRunner.query(`ALTER TABLE "arbitres_matchs" DROP CONSTRAINT "FK_b94b234d4b46ed21476ea0d0717"`);
        await queryRunner.query(`ALTER TABLE "evenements_match" DROP CONSTRAINT "FK_6693189ded8daca48cc1141f500"`);
        await queryRunner.query(`ALTER TABLE "compositions" DROP CONSTRAINT "FK_bcbcca64b25770b6327e3f8e0a8"`);
        await queryRunner.query(`ALTER TABLE "joueurs" DROP CONSTRAINT "FK_ec839c48b9ef033109326275872"`);
        await queryRunner.query(`ALTER TABLE "equipes" DROP CONSTRAINT "FK_86e05649126e0f4fa87ffadb41e"`);
        await queryRunner.query(`ALTER TABLE "equipes" DROP CONSTRAINT "FK_74d29030a241ac42d46d6dc7c05"`);
        await queryRunner.query(`DROP INDEX "IDX_f22fc053f4065cb513b64cf2b0"`);
        await queryRunner.query(`DROP INDEX "IDX_00c4f93100c6d96dc86e54afd0"`);
        await queryRunner.query(`DROP TABLE "tactiques"`);
        await queryRunner.query(`DROP INDEX "IDX_ddac3d4cddd4d6e82a7d2319ad"`);
        await queryRunner.query(`DROP TABLE "stats_joueur_equipe"`);
        await queryRunner.query(`DROP INDEX "IDX_189fdf5180b09409bccf122dc1"`);
        await queryRunner.query(`DROP TABLE "utilisateurs"`);
        await queryRunner.query(`DROP INDEX "IDX_e680fb82c26ad6be2548fc60f7"`);
        await queryRunner.query(`DROP INDEX "IDX_ccf90b307ba51af3c4533ded01"`);
        await queryRunner.query(`DROP TABLE "staff_matchs"`);
        await queryRunner.query(`DROP INDEX "IDX_a830ceb5b903f377d5de4b5b4d"`);
        await queryRunner.query(`DROP TABLE "coachs"`);
        await queryRunner.query(`DROP INDEX "IDX_893a2f26cb34c832f792115115"`);
        await queryRunner.query(`DROP INDEX "IDX_b94b234d4b46ed21476ea0d071"`);
        await queryRunner.query(`DROP TABLE "arbitres_matchs"`);
        await queryRunner.query(`DROP TABLE "arbitres"`);
        await queryRunner.query(`DROP INDEX "IDX_d1c11e5f2f321319826ab86eb3"`);
        await queryRunner.query(`DROP INDEX "IDX_345eed56b48a2244893157bf74"`);
        await queryRunner.query(`DROP INDEX "IDX_0d05dc4b53655ef812fd144662"`);
        await queryRunner.query(`DROP TABLE "classement"`);
        await queryRunner.query(`DROP INDEX "IDX_ddbf094bd6676f2bb13ad83717"`);
        await queryRunner.query(`DROP TABLE "rapports_scouting"`);
        await queryRunner.query(`DROP INDEX "IDX_f67d291f4ce4c5cb59eea2417d"`);
        await queryRunner.query(`DROP TABLE "blessures"`);
        await queryRunner.query(`DROP INDEX "IDX_830d6bf7f232bc10d7cc28f10e"`);
        await queryRunner.query(`DROP TABLE "entrainements"`);
        await queryRunner.query(`DROP INDEX "IDX_6693189ded8daca48cc1141f50"`);
        await queryRunner.query(`DROP TABLE "evenements_match"`);
        await queryRunner.query(`DROP INDEX "IDX_6b79e5bc0c584d996e61333dd7"`);
        await queryRunner.query(`DROP INDEX "IDX_bb446b2ba496e010a740a688f1"`);
        await queryRunner.query(`DROP INDEX "IDX_bcbcca64b25770b6327e3f8e0a"`);
        await queryRunner.query(`DROP TABLE "compositions"`);
        await queryRunner.query(`DROP INDEX "IDX_933c96e75e3e91f8deaefb0f2a"`);
        await queryRunner.query(`DROP INDEX "IDX_86664713546a898d2551769d11"`);
        await queryRunner.query(`DROP INDEX "IDX_ab8b0703afe36fd710f22fdc5d"`);
        await queryRunner.query(`DROP INDEX "IDX_a48cd27309f488a4d0a750064b"`);
        await queryRunner.query(`DROP INDEX "IDX_b870571dfa7258a4ae1d824dd1"`);
        await queryRunner.query(`DROP TABLE "matchs"`);
        await queryRunner.query(`DROP INDEX "IDX_ec839c48b9ef03310932627587"`);
        await queryRunner.query(`DROP TABLE "joueurs"`);
        await queryRunner.query(`DROP INDEX "IDX_86e05649126e0f4fa87ffadb41"`);
        await queryRunner.query(`DROP INDEX "IDX_74d29030a241ac42d46d6dc7c0"`);
        await queryRunner.query(`DROP TABLE "equipes"`);
        await queryRunner.query(`DROP TABLE "saisons"`);
        await queryRunner.query(`DROP TABLE "clubs"`);
    }

}
