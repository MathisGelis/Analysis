import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * IA : les entrainements du modele de prediction des compos (progression, resultat complet) et les modeles qui en
 * sortent (poids appris, un seul actif a la fois). Les tables sont verrouillees comme toutes les autres (RLS sans
 * politique : voir VerrouillerApiDonnees) ; les privileges par defaut de anon / authenticated sont deja retires.
 */
export class ModelesIa1791204544745 implements MigrationInterface {
  name = "ModelesIa1791204544745";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "ia_entrainements" ("id" character varying NOT NULL, "statut" character varying NOT NULL DEFAULT 'en_cours', "progression" integer NOT NULL DEFAULT '0', "message" text, "options" text NOT NULL, "lancePar" character varying, "modeleId" character varying, "resultat" text, "termineLe" character varying, "creeLe" character varying NOT NULL, CONSTRAINT "PK_ed19f573ab83a79a1eb2c075218" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "ia_modeles" ("id" character varying NOT NULL, "nom" character varying NOT NULL, "entrainementId" character varying NOT NULL, "poids" text NOT NULL, "resume" text NOT NULL, "actif" boolean NOT NULL DEFAULT false, "creeLe" character varying NOT NULL, CONSTRAINT "PK_47a85a415f5f4dee878c552fb60" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "ia_entrainements" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "ia_modeles" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ia_modeles"`);
    await queryRunner.query(`DROP TABLE "ia_entrainements"`);
  }
}
