import { MigrationInterface, QueryRunner } from "typeorm";

/** Invitations a saisir le direct (features/direct) : liens a usage unique, seules les empreintes sont gardees. Table verrouillee (RLS sans politique). */
export class Invitations1794853556068 implements MigrationInterface {
    name = 'Invitations1794853556068'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "invitations_direct" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "creePar" character varying NOT NULL, "libelle" character varying NOT NULL, "peutChrono" boolean NOT NULL DEFAULT false, "jetonEmpreinte" character varying NOT NULL, "sessionEmpreinte" character varying, "expireLe" character varying NOT NULL, "ouvertLe" character varying, "revoqueLe" character varying, "derniereActiviteLe" character varying, "creeLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1c0c3c2912c64c20ea3fc3b7b6f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d867137922a209d80dc2954b48" ON "invitations_direct" ("match_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1bf1d25b7b278d89541e0d3278" ON "invitations_direct" ("jetonEmpreinte") `);
        await queryRunner.query(`CREATE INDEX "IDX_4ae6d55b2c09d307301df7ae43" ON "invitations_direct" ("sessionEmpreinte") `);
        await queryRunner.query(`ALTER TABLE "invitations_direct" ENABLE ROW LEVEL SECURITY`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_4ae6d55b2c09d307301df7ae43"`);
        await queryRunner.query(`DROP INDEX "IDX_1bf1d25b7b278d89541e0d3278"`);
        await queryRunner.query(`DROP INDEX "IDX_d867137922a209d80dc2954b48"`);
        await queryRunner.query(`DROP TABLE "invitations_direct"`);
    }

}
