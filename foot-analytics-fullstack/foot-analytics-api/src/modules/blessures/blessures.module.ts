// src/modules/blessures/blessures.module.ts
import {
  Body, Controller, Delete, Get, Injectable, NotFoundException, Param,
  Patch, Post, Query, Module,
} from "@nestjs/common";
import { IsInt, IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Blessure } from "@/entities";

class UpsertBlessureDto {
  @IsString() joueurId: string;
  @IsOptional() @IsString() joueurNom?: string;
  @IsOptional() @IsString() localisation?: string;
  @IsOptional() @IsString() gravite?: string;
  @IsOptional() @IsString() dateDebut?: string;
  @IsOptional() @IsString() retourEstime?: string;
  @IsOptional() @IsString() statut?: string;
  @IsOptional() @IsString() details?: string;
  @IsOptional() @IsInt() risqueRecidive?: number;
}

@Injectable()
export class BlessuresService {
  constructor(@InjectRepository(Blessure) private repo: Repository<Blessure>) {}
  findAll(joueurId?: string) {
    return this.repo.find({ where: joueurId ? { joueurId } : {} });
  }
  async findOne(id: string) {
    const b = await this.repo.findOne({ where: { id } });
    if (!b) throw new NotFoundException(`Blessure ${id} introuvable`);
    return b;
  }
  create(dto: UpsertBlessureDto) { return this.repo.save(this.repo.create(dto)); }
  async update(id: string, dto: Partial<UpsertBlessureDto>) {
    const b = await this.findOne(id);
    Object.assign(b, dto);
    return this.repo.save(b);
  }
  async remove(id: string) {
    await this.repo.remove(await this.findOne(id));
    return { ok: true, id };
  }
}

@Controller("blessures")
class BlessuresController {
  constructor(private svc: BlessuresService) {}
  @Get() list(@Query("joueurId") joueurId?: string) { return this.svc.findAll(joueurId); }
  @Get(":id") get(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: UpsertBlessureDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpsertBlessureDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Blessure])],
  controllers: [BlessuresController],
  providers: [BlessuresService],
})
export class BlessuresModule {}
