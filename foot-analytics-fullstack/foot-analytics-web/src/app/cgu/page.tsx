// src/app/cgu/page.tsx
//
// Conditions d'utilisation, versionnees (VERSION_CGU) : chaque compte les accepte a sa premiere connexion, puis a
// chaque nouvelle version (voir features/legal/components/AccordCgu.tsx). Publiques.

import { PageLegale } from "@/features/legal/components/PageLegale";
import { VERSION_CGU } from "@/features/legal/lib/legal";

export const metadata = { title: "Conditions d'utilisation · Foot Analytics" };

export default function Cgu() {
  return (
    <PageLegale titre="Conditions d'utilisation" majLe={`version ${VERSION_CGU}`}>
      <section>
        <h2>Objet</h2>
        <p>
          Foot Analytics aide les staffs techniques a suivre leur effectif et a preparer leurs matchs. L'acces est reserve
          aux personnes a qui un compte a ete cree par l'administrateur ou par le referent de leur club.
        </p>
      </section>
      <section>
        <h2>Engagements de l'utilisateur</h2>
        <ul>
          <li>Garder son mot de passe personnel et secret, ne jamais partager son compte.</li>
          <li>N'utiliser les donnees qu'a des fins de preparation sportive du club, sans les diffuser hors du staff.</li>
          <li>Ne pas extraire massivement de donnees (fiches de joueurs, exports en serie) : ces usages sont detectes.</li>
          <li>Ne saisir des donnees de sante que si l'on y est habilite par le club, et seulement le necessaire.</li>
        </ul>
      </section>
      <section>
        <h2>Statistiques et predictions</h2>
        <p>
          Onze et systeme probables, scores, fatigue estimee et analyses sont des estimations statistiques : une aide a la
          decision, non contraignante. Les choix sportifs restent ceux du staff.
        </p>
      </section>
      <section>
        <h2>Tracabilite et comptes</h2>
        <p>
          Les connexions et les operations sensibles (gestion des comptes, donnees medicales, exports, consultation de
          fiches d'autres clubs) sont journalisees pendant 12 mois. Un compte sans connexion depuis 12 mois est desactive ;
          son gestionnaire peut le reactiver.
        </p>
      </section>
      <section>
        <h2>Donnees personnelles</h2>
        <p>Voir la politique de confidentialite.</p>
      </section>
    </PageLegale>
  );
}
