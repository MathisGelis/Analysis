// src/app/confidentialite/page.tsx
//
// Politique de confidentialite : publique (sans connexion), liee depuis l'ecran de connexion, la coquille et les fiches
// joueurs. Les informations propres a l'exploitant (responsable de traitement, contact, durees) sont a completer.

import { ACompleter, PageLegale } from "@/features/legal/components/PageLegale";
import { COOKIES } from "@/features/legal/lib/legal";

export const metadata = { title: "Confidentialité · Foot Analytics" };

export default function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité" majLe="octobre 2026">
      <section>
        <h2>Responsable du traitement</h2>
        <p>
          <ACompleter>nom du club ou de l'association exploitant l'application, adresse, représentant</ACompleter>.
          Contact pour toute question sur vos données : <ACompleter>adresse e-mail dédiée</ACompleter>.
        </p>
      </section>

      <section>
        <h2>Données traitées et finalités</h2>
        <ul>
          <li><strong>Préparation sportive du club</strong> : effectif (nom, prénom, poste, numéro), statistiques de match,
            cartons et suspensions, séances et presences, plans de jeu.</li>
          <li><strong>Suivi physique et médical</strong> : blessures (localisation, dates, statut, notes) et fatigue estimée.
            Ces données de santé ne sont visibles que des comptes du club qui les a saisies ; elles ne suivent pas un joueur
            qui change de club et ne sortent dans aucune statistique, recherche ni export.</li>
          <li><strong>Analyse du championnat (scouting)</strong> : données des feuilles de match officielles (compositions,
            buts, cartons, arbitres, encadrement), y compris la recherche de joueurs par critères pour le recrutement (poste,
            niveau joué, présence sur les feuilles d'une saison). Ces recherches n'utilisent aucune donnée privée d'un club
            et sont tracées.</li>
          <li><strong>Comptes et sécurité</strong> : identifiant, nom, prénom, rôle, club ; journal d'audit des connexions et
            des opérations sensibles (avec l'adresse IP pour les connexions).</li>
        </ul>
        <p>
          Base légale : intérêt légitime du club à organiser son activité sportive ; pour les données de santé,
          <ACompleter>base légale retenue (consentement explicite du joueur ou de son représentant légal...)</ACompleter>.
        </p>
      </section>

      <section>
        <h2>Qui voit quoi</h2>
        <p>
          Les comptes d'un club voient les données de leur club. Un autre club ne voit d'un joueur que son identité
          sportive (nom, prénom, poste), ses statistiques de match, ses cartons et suspensions et son historique de clubs :
          jamais son numéro de licence, sa date de naissance, sa morphologie, ses données de santé, de fatigue ou de
          présence, ni les commentaires du staff.
        </p>
      </section>

      <section>
        <h2>Durées de conservation</h2>
        <ul>
          <li>Comptes : désactivés après 12 mois sans connexion (réactivables par un gestionnaire du club).</li>
          <li>Journal d'audit (dont adresses IP de connexion) : 12 mois.</li>
          <li>Sessions : 30 jours sans activité.</li>
          <li>Feuilles de match importées : le fichier PDF n'est jamais conservé, seules les données utiles sont extraites.</li>
          <li>Données des joueurs et données médicales : <ACompleter>durée retenue par le club</ACompleter>.</li>
        </ul>
      </section>

      <section>
        <h2>Hébergement et sécurité</h2>
        <p>
          Application hébergée en Europe (Francfort pour l'interface et l'API, Irlande pour la base de données) par des
          prestataires dont certains sont établis hors de l'Union européenne
          (<ACompleter>vérifier les garanties de transfert : clauses contractuelles types, Data Privacy Framework</ACompleter>).
          Échanges chiffres (HTTPS), mots de passe hachés, sessions dans des cookies inaccessibles aux scripts, accès
          cloisonnés par club et journalises.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>Uniquement des cookies strictement nécessaires au fonctionnement : aucune mesure d'audience, aucun pixel ni traceur publicitaire.</p>
        <ul>
          {COOKIES.map((c) => (
            <li key={c.nom}><strong>{c.nom}</strong> : {c.finalite} ({c.duree}).</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Vos droits</h2>
        <p>
          Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité
          sur vos données. Pour l'exercer, contactez le responsable du traitement (ci-dessus). Vous pouvez aussi introduire
          une réclamation auprès de la CNIL (cnil.fr).
        </p>
      </section>
    </PageLegale>
  );
}
