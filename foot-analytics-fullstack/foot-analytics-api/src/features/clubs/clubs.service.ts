// src/features/clubs/clubs.service.ts

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Club } from "./club.entity";
import { UpsertClubDto } from "./clubs.dto";

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
