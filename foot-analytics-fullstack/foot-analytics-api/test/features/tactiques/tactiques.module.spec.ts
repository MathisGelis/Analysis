import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";

import { OPTIONS_ENTITES } from "@/database/entities";
import { TactiquesModule } from "@/features/tactiques/tactiques.module";
import { TactiquesService } from "@/features/tactiques/tactiques.service";

@Module({
  imports: [
    TypeOrmModule.forRoot({ type: "sqljs", ...OPTIONS_ENTITES, synchronize: true, dropSchema: true }),
    TactiquesModule,
  ],
})
class RacineTest {}

// Demarrage reel du module : un depot oublie dans forFeature() ne se voit pas dans les tests de service.
describe("TactiquesModule (injection de dependances)", () => {
  it("demarre et fournit TactiquesService", async () => {
    const app = await NestFactory.createApplicationContext(RacineTest, { logger: false });
    try {
      expect(app.get(TactiquesService, { strict: false })).toBeInstanceOf(TactiquesService);
    } finally {
      await app.close();
    }
  });
});
