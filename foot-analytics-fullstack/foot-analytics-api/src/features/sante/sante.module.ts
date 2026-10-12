// src/features/sante/sante.module.ts
import { Module } from "@nestjs/common";

import { SanteController } from "./sante.controller";

@Module({ controllers: [SanteController] })
export class SanteModule {}
