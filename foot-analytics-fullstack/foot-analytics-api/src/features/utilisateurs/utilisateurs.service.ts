// src/features/utilisateurs/utilisateurs.service.ts
//
// Gestion des comptes. Deux profils de gestionnaires (voir features/utilisateurs/droits-comptes.ts) :
//   - l'administrateur gere tous les comptes ;
//   - le referent d'un club cree et gere les comptes de ses educateurs (role "user", rattaches a son club,
//     equipes de son club uniquement), sans voir ni toucher aux autres clubs.
// Le login est genere a partir du prenom + nom (1re lettre du prenom + nom, MAJUSCULES). Le mot de passe initial (et
// celui d'une reinitialisation) est tire au hasard, renvoye UNE fois au gestionnaire qui le transmet hors bande, et ne
// sert qu'a choisir un nouveau mot de passe (voir AccesGuard). Un compte desactive (inactivite, ou decision d'un
// gestionnaire) ne peut plus se connecter tant qu'il n'est pas reactive.

import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";

import { Equipe } from "@/features/equipes/equipe.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { AuthService, buildLogin, JwtPayload, revoquerSessions } from "@/features/auth/auth.service";
import { motDePasseTemporaire } from "@/features/auth/mots-de-passe";
import { Session } from "@/features/auth/session.entity";
import { JournalAuditService } from "@/features/audit/journal-audit.service";

import { Utilisateur } from "./utilisateur.entity";
import {
  Acteur, dansPerimetre, equipesHorsPerimetre, estRole, roleAvecClub, rolesAttribuables,
} from "./droits-comptes";
import { accesSaisonsResultant, saisonsInconnues } from "./acces-saisons";
import { CreateUserDto, UpdateUserDto } from "./utilisateurs.dto";

/** Compte qui a cree un autre compte, tel qu'on l'affiche. */
export interface CreateurCompte { id: string; login: string; prenom: string; nom: string }

/**
 * Le compte sans son hash ni ses compteurs internes, avec ses saisons en clair et son createur (null : inconnu ;
 * `createurSupprime` : compte disparu).
 */
function sortie(u: Utilisateur, createurs: Map<string, CreateurCompte>) {
  const { passwordHash, versionJeton, echecsConnexion, ...rest } = u;
  const createur = u.createdById ? createurs.get(u.createdById) ?? null : null;
  return {
    ...rest,
    actif: !u.desactiveLe,
    verrouille: !!u.verrouilleJusqua && Date.parse(u.verrouilleJusqua) > Date.now(),
    toutesSaisons: u.toutesSaisons !== false,
    saisonIds: u.toutesSaisons === false ? (u.saisonIds ?? []) : [],
    createur,
    createurSupprime: !!u.createdById && !createur,
  };
}

@Injectable()
export class UtilisateursService {
  constructor(
    @InjectRepository(Utilisateur) private repo: Repository<Utilisateur>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Saison) private saisons: Repository<Saison>,
    @InjectRepository(Session) private sessions: Repository<Session>,
    private journal: JournalAuditService,
  ) {}

  /** Les createurs des comptes donnes (une seule requete). */
  private async createursDe(users: Utilisateur[]): Promise<Map<string, CreateurCompte>> {
    const ids = [...new Set(users.map((u) => u.createdById).filter((x): x is string => !!x))];
    if (ids.length === 0) return new Map();
    const trouves = await this.repo.find({ where: { id: In(ids) } });
    return new Map(trouves.map((c) => [c.id, { id: c.id, login: c.login, prenom: c.prenom, nom: c.nom }]));
  }

  private async avecCreateurs(users: Utilisateur[]) {
    const createurs = await this.createursDe(users);
    return users.map((u) => sortie(u, createurs));
  }

  private async avecCreateur(u: Utilisateur) {
    return (await this.avecCreateurs([u]))[0];
  }

  /** Les saisons demandees doivent exister. */
  private async verifierSaisons(ids: string[]) {
    if (ids.length === 0) return;
    const connues = (await this.saisons.find({ where: { id: In(ids) } })).map((x) => x.id);
    const inconnues = saisonsInconnues(ids, connues);
    if (inconnues.length) throw new BadRequestException("Saison inconnue : " + inconnues.join(", "));
  }

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
    return this.avecCreateurs(users);
  }

  /** Un compte hors perimetre est "introuvable" : on ne revele pas qu'il existe. */
  private async cible(acteur: Acteur, id: string): Promise<Utilisateur> {
    const u = await this.repo.findOne({ where: { id } });
    if (!u || !dansPerimetre(acteur, { role: u.role, clubId: u.clubId })) throw new NotFoundException(`Utilisateur ${id} introuvable`);
    return u;
  }

  async findOne(acteur: Acteur, id: string) {
    return this.avecCreateur(await this.cible(acteur, id));
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
    // Seul un educateur a des saisons a restreindre : admin et referent voient toujours tout.
    const acces = role === "user" ? accesSaisonsResultant(dto) : { toutesSaisons: true, saisonIds: [] as string[] };
    await this.verifierSaisons(acces.saisonIds);

    const login = buildLogin(dto.prenom, dto.nom);
    if (await this.repo.findOne({ where: { login } })) {
      throw new ConflictException(
        `Un compte existe deja avec le login ${login}. Verifie le prenom/nom ou utilise une variante.`,
      );
    }
    const initialPassword = motDePasseTemporaire();
    const passwordHash = await AuthService.hash(initialPassword);
    const saved = await this.repo.save(this.repo.create({
      login, prenom: dto.prenom.trim(), nom: dto.nom.trim(), role,
      clubId: clubId as any,
      equipeIds: role === "admin" ? [] : (dto.equipeIds ?? []),
      toutesSaisons: acces.toutesSaisons, saisonIds: acces.toutesSaisons ? null : acces.saisonIds,
      createdById: acteur.id,
      passwordHash, mustChangePassword: true,
      derniereActivite: new Date().toISOString(),
    }));
    await this.journal.noter("compte.creation", { acteur, cible: `utilisateur:${saved.id}`, cibleClubId: saved.clubId, details: { role } });
    return {
      ...(await this.avecCreateur(saved)),
      // Le mot de passe initial n'est renvoye qu'ici (jamais stocke en clair) : le gestionnaire le transmet hors bande.
      initialPassword,
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
    const acces = roleNew === "user"
      ? accesSaisonsResultant(dto, { toutesSaisons: u.toutesSaisons !== false, saisonIds: u.saisonIds ?? [] })
      : { toutesSaisons: true, saisonIds: [] as string[] };
    await this.verifierSaisons(acces.saisonIds);

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
    u.toutesSaisons = acces.toutesSaisons;
    u.saisonIds = acces.toutesSaisons ? null : acces.saisonIds;
    let initialPassword: string | undefined;
    let revoquer = false;
    if (dto.reinitialiserMotDePasse) {
      initialPassword = motDePasseTemporaire();
      u.passwordHash = await AuthService.hash(initialPassword);
      u.mustChangePassword = true;
      u.echecsConnexion = 0;
      u.verrouilleJusqua = null;
      revoquer = true;
    }
    if (dto.actif === false && !u.desactiveLe) {
      if (u.id === acteur.id) throw new BadRequestException("Tu ne peux pas desactiver ton propre compte.");
      if (u.role === "admin" && (await this.adminsActifs()) <= 1) {
        throw new BadRequestException("Impossible de desactiver le dernier compte administrateur actif.");
      }
      u.desactiveLe = new Date().toISOString();
      revoquer = true;
    } else if (dto.actif === true && u.desactiveLe) {
      // Reactive : l'inactivite repart de zero, sinon l'entretien quotidien le desactiverait aussitot.
      u.desactiveLe = null;
      u.derniereActivite = new Date().toISOString();
      u.echecsConnexion = 0;
      u.verrouilleJusqua = null;
    }
    if (revoquer) u.versionJeton = (u.versionJeton ?? 0) + 1;
    const etaitActif = dto.actif === undefined ? null : !(await this.repo.findOne({ where: { id: u.id } }))?.desactiveLe;
    const saved = await this.repo.save(u);
    if (revoquer) await revoquerSessions(this.sessions, u.id);
    const trace = { acteur, cible: `utilisateur:${u.id}`, cibleClubId: u.clubId };
    const champs = Object.keys(dto).filter((k) => !["reinitialiserMotDePasse", "actif"].includes(k));
    if (champs.length) await this.journal.noter("compte.modification", { ...trace, details: { champs } });
    if (initialPassword) await this.journal.noter("compte.mot_de_passe_reinitialise", trace);
    if (etaitActif === true && saved.desactiveLe) await this.journal.noter("compte.desactivation", trace);
    if (etaitActif === false && !saved.desactiveLe) await this.journal.noter("compte.reactivation", trace);
    const out = await this.avecCreateur(saved);
    return initialPassword ? { ...out, initialPassword } : out;
  }

  private async adminsActifs(): Promise<number> {
    return this.repo.count({ where: { role: "admin", desactiveLe: IsNull() } });
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
    await this.sessions.delete({ utilisateurId: u.id });
    await this.repo.remove(u);
    await this.journal.noter("compte.suppression", { acteur, cible: `utilisateur:${id}`, cibleClubId: u.clubId, details: { role: u.role } });
    return { ok: true, id };
  }
}
