// src/modules/clubs/clubs.module.ts
import {
  Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param,
  Patch, Post, Module,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Club } from "@/entities";
import { Acces, AccesModule, AccesService, ContexteAcces } from "@/modules/acces/acces.module";

class UpsertClubDto {
  @IsOptional() @IsString() id?: string;
  @IsString() nom: string;
  @IsOptional() @IsString() abbr?: string;
  @IsOptional() @IsString() ville?: string;
  @IsOptional() @IsString() numeroFff?: string;
  @IsOptional() @IsString() couleur?: string;
  @IsOptional() @IsString() logoUrl?: string;
}

@Injectable()
export class ClubsService {
  constructor(@InjectRepository(Club) private repo: Repository<Club>) {}

  findAll() {
    return this.repo.find({ order: { nom: "ASC" } });
  }
  async findOne(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Club ${id} introuvable`);
    return c;
  }
  create(dto: UpsertClubDto) {
    return this.repo.save(this.repo.create(dto));
  }
  async update(id: string, dto: Partial<UpsertClubDto>) {
    const c = await this.findOne(id);
    Object.assign(c, dto);
    return this.repo.save(c);
  }
  async remove(id: string) {
    await this.repo.remove(await this.findOne(id));
    return { ok: true, id };
  }
}

@Controller("clubs")
class ClubsController {
  constructor(private svc: ClubsService, private acces: AccesService) {}
  @Get() list() { return this.svc.findAll(); }
  @Get(":id") get(@Param("id") id: string) { return this.svc.findOne(id); }
  // Tout compte peut ajouter un club adverse absent de la base (calendrier, scouting) ; modifier un club, c'est l'affaire
  // de l'administrateur ou du referent de ce club ; le supprimer, de l'administrateur seul.
  @Post() create(@Body() dto: UpsertClubDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpsertClubDto) {
    if (!ctx.admin) {
      if (!ctx.referent) throw new ForbiddenException("Seuls l'administrateur et le referent du club modifient un club.");
      this.acces.exigerClub(ctx, id);
    }
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    this.acces.exigerAdmin(ctx);
    return this.svc.remove(id);
  }
}

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Club])],
  controllers: [ClubsController],
  providers: [ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}
