import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Comptes : qui a cree le compte, et quelles saisons son titulaire peut consulter. Les comptes existants gardent
 * l'acces a toutes les saisons (valeur par defaut vraie) et n'ont pas de createur connu.
 */
export class ComptesCreateurEtSaisons1790900000000 implements MigrationInterface {
  name = "ComptesCreateurEtSaisons1790900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "toutesSaisons" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "saisonIds" text`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" ADD "createdById" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "createdById"`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "saisonIds"`);
    await queryRunner.query(`ALTER TABLE "utilisateurs" DROP COLUMN "toutesSaisons"`);
  }
}
