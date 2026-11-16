import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Direct d'un match (features/direct) : l'etat du chrono par match et les evenements saisis pendant la rencontre. Tables
 * verrouillees comme les autres (RLS sans politique : seul le role de l'API y accede).
 */
export class Direct1791900000000 implements MigrationInterface {
  name = "Direct1791900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "directs" ("match_id" character varying NOT NULL, "statut" character varying NOT NULL DEFAULT 'avant', "periode" integer NOT NULL DEFAULT '1', "accumuleMs" double precision NOT NULL DEFAULT '0', "demarreLe" double precision, "dureePeriodeMin" integer NOT NULL DEFAULT '45', "clotureLe" character varying, "cloturePar" character varying, "creeLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e77b7acda54ebf8f65bf3d0391f" PRIMARY KEY ("match_id"))`);
    await queryRunner.query(`CREATE TABLE "evenements_direct" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "cote" character varying NOT NULL, "type" character varying NOT NULL, "resultat" character varying, "periode" integer NOT NULL, "minute" integer NOT NULL, "joueurNumero" integer, "joueurNom" character varying, "joueurId" character varying, "joueur2Numero" integer, "joueur2Nom" character varying, "joueur2Id" character varying, "zoneTier" integer, "zoneCouloir" integer, "zoneCadre" integer, "contextes" text NOT NULL, "auteurId" character varying, "supprimeLe" character varying, "creeLe" TIMESTAMP NOT NULL DEFAULT now(), "modifieLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a0b7f5b855242ac28aad828060b" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_374c426e6f640bd1b34252f08b" ON "evenements_direct" ("match_id") `);
    await queryRunner.query(`ALTER TABLE "directs" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "evenements_direct" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_374c426e6f640bd1b34252f08b"`);
    await queryRunner.query(`DROP TABLE "evenements_direct"`);
    await queryRunner.query(`DROP TABLE "directs"`);
  }
}
