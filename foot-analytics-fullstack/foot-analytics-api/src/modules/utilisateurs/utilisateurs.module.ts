// src/modules/utilisateurs/utilisateurs.module.ts
//
// Gestion des comptes. Deux profils de gestionnaires (voir common/droits-comptes.ts) :
//   - l'administrateur gere tous les comptes ;
//   - le referent d'un club cree et gere les comptes de ses educateurs (role "user", rattaches a son club,
//     equipes de son club uniquement), sans voir ni toucher aux autres clubs.
// Le login est genere a partir du prenom + nom (1re lettre du prenom + nom, MAJUSCULES). Le mot de passe initial est
// defini par defaultPassword() : l'utilisateur doit le changer a sa premiere connexion.

import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get,
  Injectable, Module, NotFoundException, Param, Patch, Post, Req, UseGuards,
} from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { Equipe, Utilisateur } from "@/entities";
import { GestionnaireGuard, AuthModule, AuthService, buildLogin, JwtPayload } from "../auth/auth.module";
import {
  Acteur, dansPerimetre, equipesHorsPerimetre, estRole, roleAvecClub, ROLES, rolesAttribuables,
} from "@/common/droits-comptes";

export class CreateUserDto {
  @IsString() prenom: string;
  @IsString() nom: string;
  /** Defaut : educateur ("user"). Un referent ne peut creer que des educateurs. */
  @IsOptional() @IsIn([...ROLES]) role?: string;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsArray() equipeIds?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsIn([...ROLES]) role?: string;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsArray() equipeIds?: string[];
  // Si fourni, reset le mdp et force mustChangePassword=true.
  @IsOptional() @IsString() resetPassword?: string;
}

const sansHash = ({ passwordHash, ...rest }: Utilisateur) => rest;

@Injectable()
export class UtilisateursService {
  constructor(
    @InjectRepository(Utilisateur) private repo: Repository<Utilisateur>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
  ) {}

  /**
   * L'acteur d'apres la BASE (pas le jeton) : un referent dont le role ou le club a change depuis son
   * jeton n'a plus les anciens droits.
   */
  async acteur(payload: Pick<JwtPayload, "sub">): Promise<Acteur> {
    const u = await this.repo.findOne({ where: { id: payload.sub } });
    if (!u || rolesAttribuables({ id: u.id, role: u.role, clubId: u.clubId ?? null }).length === 0) {
      throw new ForbiddenException("Acces reserve aux administrateurs et aux referents de club");
    }
    if (u.role === "referent" && !u.clubId) throw new ForbiddenException("Ce compte referent n'est rattache a aucun club");
    return { id: u.id, role: u.role, clubId: u.clubId ?? null };
  }

  async findAll(acteur: Acteur) {
    const users = acteur.role === "admin"
      ? await this.repo.find({ order: { login: "ASC" } })
      : await this.repo.find({ where: { clubId: acteur.clubId as string, role: "user" }, order: { login: "ASC" } });
    // Ne jamais leak le passwordHash en sortie.
    return users.map(sansHash);
  }

  /** Un compte hors perimetre est "introuvable" : on ne revele pas qu'il existe. */
  private async cible(acteur: Acteur, id: string): Promise<Utilisateur> {
    const u = await this.repo.findOne({ where: { id } });
    if (!u || !dansPerimetre(acteur, { role: u.role, clubId: u.clubId })) throw new NotFoundException(`Utilisateur ${id} introuvable`);
    return u;
  }

  async findOne(acteur: Acteur, id: string) {
    return sansHash(await this.cible(acteur, id));
  }

  /** Les equipes demandees doivent exister et, pour un referent, etre de son club. */
  private async verifierEquipes(acteur: Acteur, equipeIds: string[]) {
    if (acteur.role === "admin" || equipeIds.length === 0) return;
    const trouvees = await this.equipes.find({ where: { id: In(equipeIds) } });
    const refusees = equipesHorsPerimetre(acteur, trouvees, equipeIds);
    if (refusees.length) throw new ForbiddenException("Ces equipes ne font pas partie de ton club.");
  }

  async create(acteur: Acteur, dto: CreateUserDto) {
    const role = dto.role ?? "user";
    if (!estRole(role) || !rolesAttribuables(acteur).includes(role)) {
      throw new ForbiddenException(`Tu ne peux pas creer de compte "${role}".`);
    }
    // Un referent cree toujours dans son club ; un autre club est refuse plutot que corrige en silence.
    if (acteur.role === "referent" && dto.clubId && dto.clubId !== acteur.clubId) {
      throw new ForbiddenException("Tu ne peux creer des comptes que pour ton club.");
    }
    const clubId = roleAvecClub(role) ? (acteur.role === "referent" ? acteur.clubId : (dto.clubId ?? null)) : null;
    if (roleAvecClub(role) && !clubId) throw new BadRequestException("Ce compte doit etre associe a un club.");
    await this.verifierEquipes(acteur, dto.equipeIds ?? []);

    const login = buildLogin(dto.prenom, dto.nom);
    if (await this.repo.findOne({ where: { login } })) {
      throw new ConflictException(
        `Un compte existe deja avec le login ${login}. Verifie le prenom/nom ou utilise une variante.`,
      );
    }
    const passwordHash = await AuthService.hash(AuthService.defaultPassword());
    const saved = await this.repo.save(this.repo.create({
      login, prenom: dto.prenom.trim(), nom: dto.nom.trim(), role,
      clubId: clubId as any,
      equipeIds: role === "admin" ? [] : (dto.equipeIds ?? []),
      passwordHash, mustChangePassword: true,
    }));
    return {
      ...sansHash(saved),
      // On renvoie le mot de passe initial UNIQUEMENT a la creation pour
      // que le gestionnaire puisse le communiquer (verbalement) a l'utilisateur.
      initialPassword: AuthService.defaultPassword(),
    };
  }

  async update(acteur: Acteur, id: string, dto: UpdateUserDto) {
    const u = await this.cible(acteur, id);
    if (dto.role !== undefined && (!estRole(dto.role) || !rolesAttribuables(acteur).includes(dto.role))) {
      throw new ForbiddenException(`Tu ne peux pas donner le role "${dto.role}".`);
    }
    if (acteur.role === "referent" && dto.clubId !== undefined && dto.clubId !== acteur.clubId) {
      throw new ForbiddenException("Tu ne peux pas changer un compte de club.");
    }
    const roleNew = dto.role ?? u.role;
    const clubNew = roleAvecClub(roleNew) ? (dto.clubId !== undefined ? dto.clubId : u.clubId) : null;
    if (roleAvecClub(roleNew) && !clubNew) throw new BadRequestException("Ce compte doit etre associe a un club.");
    if (dto.equipeIds !== undefined) await this.verifierEquipes(acteur, dto.equipeIds);

    // Si le prenom ou nom change, on regenere le login en consequence.
    const prenomNew = dto.prenom?.trim() ?? u.prenom;
    const nomNew = dto.nom?.trim() ?? u.nom;
    const loginNew = buildLogin(prenomNew, nomNew);
    if (loginNew !== u.login) {
      if (await this.repo.findOne({ where: { login: loginNew } })) throw new ConflictException(`Login ${loginNew} deja utilise.`);
      u.login = loginNew;
    }
    u.prenom = prenomNew;
    u.nom = nomNew;
    u.role = roleNew;
    u.clubId = clubNew as any;
    if (roleNew === "admin") u.equipeIds = [];
    else if (dto.equipeIds !== undefined) u.equipeIds = dto.equipeIds;
    if (dto.resetPassword) {
      u.passwordHash = await AuthService.hash(dto.resetPassword);
      u.mustChangePassword = true;
    }
    return sansHash(await this.repo.save(u));
  }

  async remove(acteur: Acteur, id: string) {
    const u = await this.cible(acteur, id);
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

@UseGuards(GestionnaireGuard)
@Controller("utilisateurs")
export class UtilisateursController {
  constructor(private svc: UtilisateursService) {}

  @Get() async list(@Req() req: any) { return this.svc.findAll(await this.svc.acteur(req.user)); }
  @Get(":id") async one(@Req() req: any, @Param("id") id: string) { return this.svc.findOne(await this.svc.acteur(req.user), id); }
  @Post() async create(@Req() req: any, @Body() dto: CreateUserDto) { return this.svc.create(await this.svc.acteur(req.user), dto); }
  @Patch(":id") async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.svc.update(await this.svc.acteur(req.user), id, dto);
  }
  @Delete(":id") async remove(@Req() req: any, @Param("id") id: string) { return this.svc.remove(await this.svc.acteur(req.user), id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Utilisateur, Equipe]), AuthModule],
  controllers: [UtilisateursController],
  providers: [UtilisateursService],
  exports: [UtilisateursService],
})
export class UtilisateursModule {}
