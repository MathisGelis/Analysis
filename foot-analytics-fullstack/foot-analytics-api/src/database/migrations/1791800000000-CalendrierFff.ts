import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Calendrier FFF (fichier .ics public d'une equipe) :
 *   - equipes.calendrierUrl / calendrierSynchroLe : l'adresse du calendrier et la derniere synchronisation reussie ;
 *   - matchs.idFff : identifiant du match chez la FFF, pour le retrouver (et le mettre a jour) a la synchronisation suivante ;
 *   - matchs.calendrierDisparu : un match programme n'est plus dans le calendrier (reporte ? annule ?) : a verifier.
 */
export class CalendrierFff1791800000000 implements MigrationInterface {
  name = "CalendrierFff1791800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "equipes" ADD "calendrierUrl" character varying`);
    await queryRunner.query(`ALTER TABLE "equipes" ADD "calendrierSynchroLe" character varying`);
    await queryRunner.query(`ALTER TABLE "matchs" ADD "idFff" character varying`);
    await queryRunner.query(`ALTER TABLE "matchs" ADD "calendrierDisparu" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "matchs" DROP COLUMN "calendrierDisparu"`);
    await queryRunner.query(`ALTER TABLE "matchs" DROP COLUMN "idFff"`);
    await queryRunner.query(`ALTER TABLE "equipes" DROP COLUMN "calendrierSynchroLe"`);
    await queryRunner.query(`ALTER TABLE "equipes" DROP COLUMN "calendrierUrl"`);
  }
}
