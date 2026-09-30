// src/modules/classement/classement.module.ts
import {
  Controller, Get, Injectable, Module,
} from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LigneClassement } from "@/entities";

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
  @Get() list() { return this.svc.findAll(); }
}

@Module({
  imports: [TypeOrmModule.forFeature([LigneClassement])],
  controllers: [ClassementController],
  providers: [ClassementService],
})
export class ClassementModule {}
