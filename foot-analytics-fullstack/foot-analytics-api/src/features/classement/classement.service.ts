// src/features/classement/classement.service.ts

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { LigneClassement } from "./ligne-classement.entity";

@Injectable()
export class ClassementService {
  constructor(
    @InjectRepository(LigneClassement) private repo: Repository<LigneClassement>,
  ) {}
  findAll() {
    return this.repo.find({ order: { rang: "ASC" } });
  }
}
