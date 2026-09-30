// src/modules/utilisateurs/utilisateurs.module.ts
//
// CRUD utilisateurs, ADMIN UNIQUEMENT. Le login est genere automatiquement
// a partir du prenom + nom (1ere lettre prenom + nom, UPPER). Le mdp
// initial est defini par defaultPassword() — l'utilisateur sera force
// de le changer a sa 1ere connexion.

import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  Injectable, Module, NotFoundException, Param, Patch, Post, UseGuards,
} from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { Utilisateur } from "@/entities";
import { AdminGuard, AuthModule, AuthService, buildLogin } from "../auth/auth.module";

class CreateUserDto {
  @IsString() prenom: string;
  @IsString() nom: string;
  @IsIn(["admin", "user"]) role: string;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsArray() equipeIds?: string[];
}

class UpdateUserDto {
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsIn(["admin", "user"]) role?: string;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsArray() equipeIds?: string[];
  // Si fourni, reset le mdp et force mustChangePassword=true.
  @IsOptional() @IsString() resetPassword?: string;
}

@Injectable()
export class UtilisateursService {
  constructor(
    @InjectRepository(Utilisateur) private repo: Repository<Utilisateur>,
  ) {}

  async findAll() {
    const users = await this.repo.find({ order: { login: "ASC" } });
    // Ne jamais leak le passwordHash en sortie.
    return users.map(({ passwordHash, ...rest }) => rest);
  }

  async findOne(id: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException(`Utilisateur ${id} introuvable`);
    const { passwordHash, ...rest } = u;
    return rest;
  }

  async create(dto: CreateUserDto) {
    const login = buildLogin(dto.prenom, dto.nom);
    const existing = await this.repo.findOne({ where: { login } });
    if (existing) {
      throw new ConflictException(
        `Un compte existe deja avec le login ${login}. Verifie le prenom/nom ou utilise une variante.`,
      );
    }
    if (dto.role === "user" && !dto.clubId) {
      throw new BadRequestException("Un utilisateur 'user' doit etre associe a un club.");
    }
    const passwordHash = await AuthService.hash(AuthService.defaultPassword());
    const u = this.repo.create({
      login,
      prenom: dto.prenom.trim(),
      nom: dto.nom.trim(),
      role: dto.role,
      clubId: dto.role === "admin" ? null as any : (dto.clubId ?? null),
      equipeIds: dto.equipeIds ?? [],
      passwordHash,
      mustChangePassword: true,
    });
    const saved = await this.repo.save(u);
    const { passwordHash: _, ...rest } = saved;
    return {
      ...rest,
      // On renvoie le mot de passe initial UNIQUEMENT a la creation pour
      // que l'admin puisse le communiquer (verbalement) a l'utilisateur.
      initialPassword: AuthService.defaultPassword(),
    };
  }

  async update(id: string, dto: UpdateUserDto) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException(`Utilisateur ${id} introuvable`);

    // Si le prenom ou nom change, on regenere le login en consequence.
    const prenomNew = dto.prenom?.trim() ?? u.prenom;
    const nomNew = dto.nom?.trim() ?? u.nom;
    const loginNew = buildLogin(prenomNew, nomNew);
    if (loginNew !== u.login) {
      const conflict = await this.repo.findOne({ where: { login: loginNew } });
      if (conflict) {
        throw new ConflictException(`Login ${loginNew} deja utilise.`);
      }
      u.login = loginNew;
    }
    u.prenom = prenomNew;
    u.nom = nomNew;
    if (dto.role) u.role = dto.role;
    if (dto.role === "admin") u.clubId = null as any;
    else if (dto.clubId !== undefined) u.clubId = dto.clubId;
    if (dto.equipeIds !== undefined) u.equipeIds = dto.equipeIds;
    if (dto.resetPassword) {
      u.passwordHash = await AuthService.hash(dto.resetPassword);
      u.mustChangePassword = true;
    }
    const saved = await this.repo.save(u);
    const { passwordHash, ...rest } = saved;
    return rest;
  }

  async remove(id: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException(`Utilisateur ${id} introuvable`);
    // Garde-fou : interdire la suppression du dernier admin.
    if (u.role === "admin") {
      const nbAdmins = await this.repo.count({ where: { role: "admin" } });
      if (nbAdmins <= 1) {
        throw new BadRequestException(
          "Impossible de supprimer le dernier compte administrateur.",
        );
      }
    }
    await this.repo.remove(u);
    return { ok: true, id };
  }
}

@UseGuards(AdminGuard)
@Controller("utilisateurs")
export class UtilisateursController {
  constructor(private svc: UtilisateursService) {}

  @Get() list() { return this.svc.findAll(); }
  @Get(":id") one(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: CreateUserDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Utilisateur]), AuthModule],
  controllers: [UtilisateursController],
  providers: [UtilisateursService],
  exports: [UtilisateursService],
})
export class UtilisateursModule {}
