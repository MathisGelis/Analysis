// src/features/classement/classement.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { LigneClassement } from "./ligne-classement.entity";
import { ClassementService } from "./classement.service";
import { ClassementController } from "./classement.controller";

@Module({
  imports: [TypeOrmModule.forFeature([LigneClassement])],
  controllers: [ClassementController],
  providers: [ClassementService],
})
export class ClassementModule {}
