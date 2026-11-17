import { MigrationInterface, QueryRunner } from "typeorm";

/** Numero de maillot choisi pour chaque joueur retenu dans le plan d'un match (features/tactiques). Colonne nullable : les plans existants sont inchanges. */
export class NumerosPlan1794904278707 implements MigrationInterface {
    name = 'NumerosPlan1794904278707'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tactiques" ADD "numeros" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tactiques" DROP COLUMN "numeros"`);
    }

}
