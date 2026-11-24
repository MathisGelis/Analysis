import { MigrationInterface, QueryRunner } from "typeorm";

/** Planning de l'equipe (jours d'entrainement recurrents, evenements « autre ») : tables verrouillees (RLS sans politique), lues par l'API seule. */
export class PlanningEquipe1795509868738 implements MigrationInterface {
    name = 'PlanningEquipe1795509868738'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "plannings_equipe" ("equipe_id" character varying NOT NULL, "jours" text NOT NULL, "heure" character varying NOT NULL, "modifieLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_961f59ce8a8c5cfdca907a7db9c" PRIMARY KEY ("equipe_id"))`);
        await queryRunner.query(`CREATE TABLE "evenements_equipe" ("id" character varying NOT NULL, "equipe_id" character varying NOT NULL, "date" character varying NOT NULL, "heure" character varying, "titre" character varying NOT NULL, "description" text, "creeLe" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_836bf394d5370aa9fe9313d8809" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7404be823534990adf79deda41" ON "evenements_equipe" ("equipe_id") `);
        await queryRunner.query(`ALTER TABLE "plannings_equipe" ENABLE ROW LEVEL SECURITY`);
        await queryRunner.query(`ALTER TABLE "evenements_equipe" ENABLE ROW LEVEL SECURITY`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_7404be823534990adf79deda41"`);
        await queryRunner.query(`DROP TABLE "evenements_equipe"`);
        await queryRunner.query(`DROP TABLE "plannings_equipe"`);
    }

}
