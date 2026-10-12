import { dansPerimetre, equipesHorsPerimetre, estRole, roleAvecClub, rolesAttribuables } from "@/features/utilisateurs/droits-comptes";

const admin = { id: "a", role: "admin", clubId: null };
const referent = { id: "r", role: "referent", clubId: "club-1" };
const educateur = { id: "u", role: "user", clubId: "club-1" };

describe("rolesAttribuables", () => {
  it("l'admin donne tous les roles ; le referent seulement educateur ; un educateur aucun", () => {
    expect(rolesAttribuables(admin)).toEqual(["admin", "referent", "user"]);
    expect(rolesAttribuables(referent)).toEqual(["user"]);
    expect(rolesAttribuables(educateur)).toEqual([]);
  });
});

describe("dansPerimetre", () => {
  it("l'admin gere tout le monde", () => {
    expect(dansPerimetre(admin, { role: "referent", clubId: "club-9" })).toBe(true);
  });

  it("le referent : les educateurs de son club, ni ceux d'un autre club, ni les referents, ni les admins", () => {
    expect(dansPerimetre(referent, { role: "user", clubId: "club-1" })).toBe(true);
    expect(dansPerimetre(referent, { role: "user", clubId: "club-2" })).toBe(false);
    expect(dansPerimetre(referent, { role: "referent", clubId: "club-1" })).toBe(false);
    expect(dansPerimetre(referent, { role: "admin", clubId: null })).toBe(false);
    expect(dansPerimetre(referent, { role: "user", clubId: null })).toBe(false);
  });

  it("un referent sans club, ou un educateur : rien", () => {
    expect(dansPerimetre({ id: "r", role: "referent", clubId: null }, { role: "user", clubId: null })).toBe(false);
    expect(dansPerimetre(educateur, { role: "user", clubId: "club-1" })).toBe(false);
  });
});

describe("equipesHorsPerimetre", () => {
  const equipes = [{ id: "e1", clubId: "club-1" }, { id: "e2", clubId: "club-1" }, { id: "x", clubId: "club-2" }];

  it("le referent ne peut attribuer que les equipes de son club (une equipe inconnue est refusee aussi)", () => {
    expect(equipesHorsPerimetre(referent, equipes, ["e1", "e2"])).toEqual([]);
    expect(equipesHorsPerimetre(referent, equipes, ["e1", "x", "fantome"])).toEqual(["x", "fantome"]);
  });

  it("l'admin n'est pas limite", () => {
    expect(equipesHorsPerimetre(admin, equipes, ["x", "fantome"])).toEqual([]);
  });
});

describe("estRole / roleAvecClub", () => {
  it("roles connus ; referent et educateur ont un club", () => {
    expect(estRole("referent")).toBe(true);
    expect(estRole("root")).toBe(false);
    expect(roleAvecClub("referent")).toBe(true);
    expect(roleAvecClub("user")).toBe(true);
    expect(roleAvecClub("admin")).toBe(false);
  });
});
