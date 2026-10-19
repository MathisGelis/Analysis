import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Minimisation des donnees (revue du schema colonne par colonne) et provenance des feuilles de match :
 *   - matchs.pdfUrl : jamais utilisee (le PDF n'est pas conserve) ;
 *   - blessures.joueurNom : copie du nom du joueur, deja connu par joueur_id ;
 *   - blessures.risqueRecidive : donnee de sante jamais saisie ni affichee ;
 *   - evenements_match : la localisation d'une blessure lue sur la feuille de match n'est plus conservee (l'evenement
 *     reste : il explique un remplacement) ;
 *   - matchs.fmiImporteeLe / fmiImporteePar : date de l'import de la feuille et compte importateur.
 * Le retour arriere recree les colonnes, vides : les donnees supprimees ne reviennent pas.
 */
export class MinimisationEtProvenanceFmi1791700000000 implements MigrationInterface {
  name = "MinimisationEtProvenanceFmi1791700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "matchs" DROP COLUMN "pdfUrl"`);
    await queryRunner.query(`ALTER TABLE "blessures" DROP COLUMN "joueurNom"`);
    await queryRunner.query(`ALTER TABLE "blessures" DROP COLUMN "risqueRecidive"`);
    await queryRunner.query(`ALTER TABLE "matchs" ADD "fmiImporteeLe" character varying`);
    await queryRunner.query(`ALTER TABLE "matchs" ADD "fmiImporteePar" character varying`);
    await queryRunner.query(`UPDATE "evenements_match" SET "sousType" = NULL WHERE "type" = 'blessure'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "matchs" DROP COLUMN "fmiImporteePar"`);
    await queryRunner.query(`ALTER TABLE "matchs" DROP COLUMN "fmiImporteeLe"`);
    await queryRunner.query(`ALTER TABLE "blessures" ADD "risqueRecidive" integer`);
    await queryRunner.query(`ALTER TABLE "blessures" ADD "joueurNom" character varying`);
    await queryRunner.query(`ALTER TABLE "matchs" ADD "pdfUrl" character varying`);
  }
}
