import { MigrationInterface, QueryRunner } from "typeorm";

/** Apres-match (features/apres-match) : notes des joueurs par le staff et bilan de l'entraineur. Tables verrouillees (RLS sans politique). */
export class ApresMatch1794846409416 implements MigrationInterface {
    name = 'ApresMatch1794846409416'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "bilans_match" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "club_id" character varying NOT NULL, "positifs" text, "aTravailler" text, "bilan" text, "auteurId" character varying, "modifieLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_af5d299aab298781bc4788c2c70" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a542c307a65e95cb93f3ec9622" ON "bilans_match" ("match_id") `);
        await queryRunner.query(`CREATE TABLE "notes_joueurs_match" ("id" character varying NOT NULL, "match_id" character varying NOT NULL, "joueur_id" character varying NOT NULL, "club_id" character varying NOT NULL, "note" double precision, "commentaire" text, "auteurId" character varying, "modifieLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e7bb302da1ab911b873ebf88f1c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cecb16441dfc70647aab8a25fa" ON "notes_joueurs_match" ("match_id") `);
        await queryRunner.query(`ALTER TABLE "bilans_match" ENABLE ROW LEVEL SECURITY`);
        await queryRunner.query(`ALTER TABLE "notes_joueurs_match" ENABLE ROW LEVEL SECURITY`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_cecb16441dfc70647aab8a25fa"`);
        await queryRunner.query(`DROP TABLE "notes_joueurs_match"`);
        await queryRunner.query(`DROP INDEX "IDX_a542c307a65e95cb93f3ec9622"`);
        await queryRunner.query(`DROP TABLE "bilans_match"`);
    }

}
