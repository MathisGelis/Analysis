import { MigrationInterface, QueryRunner } from "typeorm";

/** Observations de l'adversaire saisies apres le match (features/apres-match) : table verrouillee (RLS sans politique), lue par l'API seule. */
export class ObservationsAdversaire1795510861718 implements MigrationInterface {
    name = 'ObservationsAdversaire1795510861718'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "observations_adversaire" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "club_id" character varying NOT NULL, "adversaire_id" character varying NOT NULL, "valeurs" text NOT NULL, "auteurId" character varying, "modifieLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_737d0d7cc38b0df0b99ef2edf64" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c2d0d2f7bf78742e4707668f12" ON "observations_adversaire" ("match_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4a333130b54c3944837930aa01" ON "observations_adversaire" ("club_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_333e39ee7462fd928cdb842677" ON "observations_adversaire" ("adversaire_id") `);
        await queryRunner.query(`ALTER TABLE "observations_adversaire" ENABLE ROW LEVEL SECURITY`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_333e39ee7462fd928cdb842677"`);
        await queryRunner.query(`DROP INDEX "IDX_4a333130b54c3944837930aa01"`);
        await queryRunner.query(`DROP INDEX "IDX_c2d0d2f7bf78742e4707668f12"`);
        await queryRunner.query(`DROP TABLE "observations_adversaire"`);
    }

}
