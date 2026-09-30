// src/modules/entrainements/entrainements.module.ts
import {
  Body, Controller, Delete, Get, Injectable, NotFoundException, Param,
  Patch, Post, Query, Module,
} from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString, Min } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Entrainement } from "@/entities";
import { DerivationModule, DerivationService } from "../derivation/derivation.module";

// Charge d'entrainement en UA-RPE (Unité Arbitraire de Foster).
//
// FORMULE DE BASE — Foster session-RPE method (Foster et al. 2001) :
//
//     chargeBase = duree (min) x RPE (1-10)
//
// Methode validée par 36+ études en physiologie du sport, references :
//   - Foster C. et al. (2001), JSCR
//   - Impellizzeri F.M. et al. (2004), Use of RPE-based TL in soccer
//   - Haddad M. et al. (2017), Frontiers Neuroscience review
//
// Le RPE capture deja l'internal load (cardio, lactate, ressenti
// global). Les etudes montrent que pour deux seances de meme RPE
// mais d'espaces differents (SSG vs LSG), l'external load (distance,
// HSR, accelerations) varie significativement mais le RPE reste
// similaire (Castellano J. et al. 2023, Frontiers Sports).
//
// MODULATION (TYPE x ESPACE) — Estimation external load :
//
// Notre app n'a pas de GPS. On applique une modulation MODEREE (±15%
// max) pour ajuster vers une "charge externe estimee" base sur le
// type et l'espace. Les facteurs sont conservateurs car la litterature
// montre que le RPE explique deja ~80% de la variance de charge.
//
// Reference match officiel 90' RPE7 ~ 600-700 UA-RPE.
const FACTEURS_TYPE: Record<string, number> = {
  Physique: 1.00,        // course/sprint, RPE fidele a la charge
  "Pre-match": 1.00,     // intensite match, validee
  Tactique: 0.95,        // mouvements explosifs parfois sous-perçus
  Technique: 0.85,       // moins de course continue
  Activation: 0.70,      // duree active << duree de seance
  Recup: 0.60,           // intensite tres faible
};

// Le facteur ESPACE depend du TYPE de seance, selon la litterature :
//
//   - Physique / Pre-match : LSG (grand terrain) genere plus de HSR
//     et sprint distance (Riboli A. et al. 2023, PMC10110967)
//   - Tactique / Technique : SSG (espace reduit) genere plus
//     d'accelerations/decelerations (Castellano J. et al. 2023)
//
// Effet modere car les etudes montrent que le RPE varie peu entre
// formats (typical ES = 0.62 max, Aoki M. et al. 2017, PMC9465750).
function facteurEspace(type?: string, espace?: string): number {
  if (!espace) return 1.00;
  const isPhysique = type === "Physique" || type === "Pre-match";
  const matricePhysique: Record<string, number> = {
    terrain_entier: 1.10,   // sprints longs, HSR maximale
    demi_terrain: 1.00,     // reference
    quart_terrain: 0.95,
    espace_reduit: 0.90,    // limite par la place
    salle: 0.85,            // pas de sprint linéaire long
    autre: 1.00,
  };
  const matriceTechnicoTactique: Record<string, number> = {
    terrain_entier: 0.95,   // moins d'acc/dec, plus de placement
    demi_terrain: 1.00,     // reference
    quart_terrain: 1.05,
    espace_reduit: 1.10,    // densite duels & changement direction
    salle: 0.95,
    autre: 1.00,
  };
  const matrice = isPhysique ? matricePhysique : matriceTechnicoTactique;
  return matrice[espace] ?? 1.00;
}

function calcCharge(
  dureeMin?: number, intensite?: number,
  type?: string, espace?: string,
): number {
  if (!dureeMin || !intensite) return 0;
  const base = dureeMin * intensite;             // Foster pur
  const fType: number = (type && FACTEURS_TYPE[type]) || 0.85;
  const fEspace = facteurEspace(type, espace);
  return +(base * fType * fEspace).toFixed(1);
}

class CreateEntrainementDto {
  @IsOptional() @IsString() equipeId?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() jour?: string;
  @IsOptional() @IsString() heure?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsInt() @Min(0) dureeMin?: number;
  @IsOptional() @IsInt() @Min(0) intensite?: number;
  @IsOptional() @IsString() terrain?: string;
  @IsOptional() @IsString() espace?: string;
  @IsOptional() @IsInt() presents?: number;
  @IsOptional() @IsInt() total?: number;
  @IsOptional() @IsArray() joueursPresents?: string[];
}

@Injectable()
export class EntrainementsService {
  constructor(
    @InjectRepository(Entrainement) private repo: Repository<Entrainement>,
    private derivation: DerivationService,
  ) {}

  findAll(equipeId?: string) {
    return this.repo.find({
      where: equipeId ? { equipeId } : {},
      order: { date: "ASC" },
    });
  }
  async findOne(id: string) {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Entrainement ${id} introuvable`);
    return e;
  }
  /**
   * Apres toute mutation d'entrainement (create / update / delete), on
   * recalcule la fatigue des joueurs : la charge d'entrainement des 28
   * derniers jours intervient dans le calcul, donc une nouvelle seance ou
   * une seance modifiee/supprimee doit propager. On ne refait QUE recomputeJoueurs
   * (pas tout le rebuildAll), c'est suffisant et bien plus rapide.
   */
  private async refreshFatigueAsync() {
    try { await this.derivation.recomputeJoueurs(); }
    catch (e) { /* swallow : la sauvegarde principale a deja reussi */ }
  }

  async create(dto: CreateEntrainementDto) {
    const charge = calcCharge(dto.dureeMin, dto.intensite, dto.type, dto.espace);
    const presents = dto.joueursPresents
      ? dto.joueursPresents.length
      : dto.presents ?? 0;
    const saved = await this.repo.save(this.repo.create({ ...dto, charge, presents }));
    await this.refreshFatigueAsync();
    return saved;
  }
  async update(id: string, dto: Partial<CreateEntrainementDto>) {
    const e = await this.findOne(id);
    Object.assign(e, dto);
    e.charge = calcCharge(e.dureeMin, e.intensite, e.type, e.espace);
    if (dto.joueursPresents) e.presents = dto.joueursPresents.length;
    const saved = await this.repo.save(e);
    await this.refreshFatigueAsync();
    return saved;
  }
  async remove(id: string) {
    await this.repo.remove(await this.findOne(id));
    await this.refreshFatigueAsync();
    return { ok: true, id };
  }
}

@Controller("entrainements")
class EntrainementsController {
  constructor(private svc: EntrainementsService) {}
  @Get() list(@Query("equipeId") equipeId?: string) {
    return this.svc.findAll(equipeId);
  }
  @Get(":id") get(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: CreateEntrainementDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: CreateEntrainementDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Entrainement]),
    DerivationModule,
  ],
  controllers: [EntrainementsController],
  providers: [EntrainementsService],
})
export class EntrainementsModule {}
