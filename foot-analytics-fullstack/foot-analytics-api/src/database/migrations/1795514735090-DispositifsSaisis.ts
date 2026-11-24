import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Drapeau « dispositifs saisis par le staff » : sans lui, deux dispositifs courants saisis ensemble (4-4-2 contre 4-2-3-1) etaient pris pour le
 * couple que l'ancien import ecrivait en dur sur chaque feuille, et effaces. Reprise de l'existant : un match SANS numero de feuille (cree a la
 * main ou par le calendrier) n'a jamais ete touche par cet ancien import, ses dispositifs sont donc ceux du staff.
 */
export class DispositifsSaisis1795514735090 implements MigrationInterface {
    name = 'DispositifsSaisis1795514735090'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matchs" ADD "dispositifs_saisis" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`UPDATE "matchs" SET "dispositifs_saisis" = true WHERE "numeroFmi" IS NULL AND ("formationDom" IS NOT NULL OR "formationExt" IS NOT NULL)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matchs" DROP COLUMN "dispositifs_saisis"`);
    }

}
