import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Authentification renforcee (voir features/auth) :
 *   - table sessions : jetons de rafraichissement (empreintes seulement), rotation et revocation, verrouillee comme
 *     les autres tables (RLS sans politique : voir VerrouillerApiDonnees) ;
 *   - comptes : version de jeton (revocation), derniere activite et desactivation (comptes inactifs), echecs de
 *     connexion et verrouillage temporaire, acceptation des conditions d'utilisation.
 * Les comptes existants partent d'une activite "aujourd'hui" : sans cela, l'entretien quotidien desactiverait d'emblee
 * tous les comptes crees il y a plus d'un an (la derniere connexion n'etait pas suivie).
 */
export class SessionsEtSecuriteComptes1791400000000 implements MigrationInterface {
  name = "SessionsEtSecuriteComptes1791400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "sessions" ("id" character varying NOT NULL, "utilisateurId" character varying NOT NULL, "famille" character varying NOT NULL, "empreinte" character varying NOT NULL, "creeeLe" character varying NOT NULL, "expireLe" character varying NOT NULL, "remplaceeLe" character varying, "revoqueeLe" character varying, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_bbd758c09355a32c80a2b21232" ON "sessions" ("utilisateurId") `);
    await queryRunner.query(`CREATE INDEX "IDX_1fb502d1f815e138a584b6bdb7" ON "sessions" ("famille") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e1139d9ebc6ddd10355cfeeac5" ON "sessions" ("empreinte") `);
    await queryRunner.query(`ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "versionJeton" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "derniereActivite" character varying`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "desactiveLe" character varying`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "echecsConnexion" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "verrouilleJusqua" character varying`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "cguVersion" character varying`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "cguAccepteesLe" character varying`);
    await queryRunner.query(`UPDATE "utilisateurs" SET "derniereActivite" = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "cguAccepteesLe"`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "cguVersion"`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "verrouilleJusqua"`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "echecsConnexion"`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "desactiveLe"`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "derniereActivite"`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "versionJeton"`);
    await queryRunner.query(`DROP INDEX "IDX_e1139d9ebc6ddd10355cfeeac5"`);
    await queryRunner.query(`DROP INDEX "IDX_1fb502d1f815e138a584b6bdb7"`);
    await queryRunner.query(`DROP INDEX "IDX_bbd758c09355a32c80a2b21232"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
