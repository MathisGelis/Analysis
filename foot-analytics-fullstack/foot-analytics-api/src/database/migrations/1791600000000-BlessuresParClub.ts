import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Donnees medicales etanches par club : une blessure appartient au club qui l'a saisie, elle ne suit plus le joueur
 * s'il change de club. Les blessures existantes sont rattachees au club actuel de leur joueur (le seul qui pouvait les
 * saisir jusqu'ici).
 */
export class BlessuresParClub1791600000000 implements MigrationInterface {
  name = "BlessuresParClub1791600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "blessures" ADD "clubId" character varying`);
    await queryRunner.query(`CREATE INDEX "IDX_4a4d9542d42440068d4626c9e1" ON "blessures" ("clubId") `);
    await queryRunner.query(`UPDATE "blessures" b SET "clubId" = j."club_id" FROM "joueurs" j WHERE j."id" = b."joueur_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_4a4d9542d42440068d4626c9e1"`);
    await queryRunner.query(`ALTER TABLE "blessures" DROP COLUMN "clubId"`);
  }
}
