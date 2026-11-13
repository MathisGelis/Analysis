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
          Foot Analytics aide les staffs techniques à suivre leur effectif et à préparer leurs matchs. L'accès est réservé
          aux personnes à qui un compte a été créé par l'administrateur ou par le référent de leur club.
        </p>
      </section>
      <section>
        <h2>Engagements de l'utilisateur</h2>
        <ul>
          <li>Garder son mot de passe personnel et secret, ne jamais partager son compte.</li>
          <li>N'utiliser les données qu'à des fins de préparation sportive du club, sans les diffuser hors du staff.</li>
          <li>Ne pas extraire massivement de données (fiches de joueurs, exports en série) : ces usages sont détectés.</li>
          <li>Ne saisir des données de santé que si l'on y est habilité par le club, et seulement le nécessaire.</li>
        </ul>
      </section>
      <section>
        <h2>Statistiques et prédictions</h2>
        <p>
          Onze et système probables, scores, fatigue estimée et analyses sont des estimations statistiques : une aide à la
          décision, non contraignante. Les choix sportifs restent ceux du staff.
        </p>
      </section>
      <section>
        <h2>Traçabilité et comptes</h2>
        <p>
          Les connexions et les opérations sensibles (gestion des comptes, données médicales, exports, consultation de
          fiches d'autres clubs) sont journalisees pendant 12 mois. Un compte sans connexion depuis 12 mois est désactivé ;
          son gestionnaire peut le réactiver.
        </p>
      </section>
      <section>
        <h2>Données personnelles</h2>
        <p>Voir la politique de confidentialité.</p>
      </section>
    </PageLegale>
  );
}
