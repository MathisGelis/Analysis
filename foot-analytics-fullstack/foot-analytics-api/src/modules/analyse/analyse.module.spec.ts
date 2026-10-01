import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OPTIONS_ENTITES } from "@/entities";
import { AnalyseModule, AnalyseService } from "./analyse.module";
import { PrematchService } from "./prematch.service";

@Module({
  imports: [
    TypeOrmModule.forRoot({ type: "sqljs", ...OPTIONS_ENTITES, synchronize: true, dropSchema: true }),
    AnalyseModule,
  ],
})
class RacineTest {}

// Les tests de service construisent les classes a la main : ils ne voient pas un defaut de
// cablage Nest (cycle d'import, fournisseur oublie). Ici le module est demarre pour de vrai.
describe("AnalyseModule (injection de dependances)", () => {
  it("demarre et injecte AnalyseService dans PrematchService", async () => {
    const app = await NestFactory.createApplicationContext(RacineTest, { logger: false });
    try {
      const prematch = app.get(PrematchService, { strict: false });
      expect(prematch).toBeInstanceOf(PrematchService);
      expect((prematch as any).analyse).toBeInstanceOf(AnalyseService);
    } finally {
      await app.close();
    }
  });
});
