// src/features/audit/audit.module.ts

import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuditController } from "./audit.controller";
import { JournalAudit } from "./journal-audit.entity";
import { JournalAuditService } from "./journal-audit.service";

/** Global : tout service peut noter une trace sans importer le module. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([JournalAudit])],
  controllers: [AuditController],
  providers: [JournalAuditService],
  exports: [JournalAuditService],
})
export class AuditModule {}
