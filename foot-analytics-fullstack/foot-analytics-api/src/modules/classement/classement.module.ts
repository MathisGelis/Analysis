// src/modules/classement/classement.module.ts
import {
  Controller, Get, Injectable, Module,
} from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LigneClassement } from "@/entities";
import { Acces, ContexteAcces } from "@/modules/acces/acces.module";

@Injectable()
export class ClassementService {
  constructor(
    @InjectRepository(LigneClassement) private repo: Repository<LigneClassement>,
  ) {}
  findAll() {
    return this.repo.find({ order: { rang: "ASC" } });
  }
}

@Controller("classement")
class ClassementController {
  constructor(private svc: ClassementService) {}
  // Les classements des saisons fermees au compte ne sont pas renvoyes.
  @Get() async list(@Acces() ctx: ContexteAcces) { return ctx.filtrerSaison(await this.svc.findAll(), (l) => l.saisonId); }
}

@Module({
  imports: [TypeOrmModule.forFeature([LigneClassement])],
  controllers: [ClassementController],
  providers: [ClassementService],
})
export class ClassementModule {}
