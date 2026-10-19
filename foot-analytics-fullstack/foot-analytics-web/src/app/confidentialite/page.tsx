// src/app/confidentialite/page.tsx
//
// Politique de confidentialite : publique (sans connexion), liee depuis l'ecran de connexion, la coquille et les fiches
// joueurs. Les informations propres a l'exploitant (responsable de traitement, contact, durees) sont a completer.

import { ACompleter, PageLegale } from "@/features/legal/components/PageLegale";
import { COOKIES } from "@/features/legal/lib/legal";

export const metadata = { title: "Confidentialite · Foot Analytics" };

export default function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialite" majLe="octobre 2026">
      <section>
        <h2>Responsable du traitement</h2>
        <p>
          <ACompleter>nom du club ou de l'association exploitant l'application, adresse, representant</ACompleter>.
          Contact pour toute question sur vos donnees : <ACompleter>adresse e-mail dediee</ACompleter>.
        </p>
      </section>

      <section>
        <h2>Donnees traitees et finalites</h2>
        <ul>
          <li><strong>Preparation sportive du club</strong> : effectif (nom, prenom, poste, numero), statistiques de match,
            cartons et suspensions, seances et presences, plans de jeu.</li>
          <li><strong>Suivi physique et medical</strong> : blessures (localisation, dates, statut, notes) et fatigue estimee.
            Ces donnees de sante ne sont visibles que des comptes du club qui les a saisies ; elles ne suivent pas un joueur
            qui change de club et ne sortent dans aucune statistique, recherche ni export.</li>
          <li><strong>Analyse du championnat (scouting)</strong> : donnees des feuilles de match officielles (compositions,
            buts, cartons, arbitres, encadrement), y compris la recherche de joueurs par criteres pour le recrutement (poste,
            niveau joue, presence sur les feuilles d'une saison). Ces recherches n'utilisent aucune donnee privee d'un club
            et sont tracees.</li>
          <li><strong>Comptes et securite</strong> : identifiant, nom, prenom, role, club ; journal d'audit des connexions et
            des operations sensibles (avec l'adresse IP pour les connexions).</li>
        </ul>
        <p>
          Base legale : interet legitime du club a organiser son activite sportive ; pour les donnees de sante,
          <ACompleter>base legale retenue (consentement explicite du joueur ou de son representant legal...)</ACompleter>.
        </p>
      </section>

      <section>
        <h2>Qui voit quoi</h2>
        <p>
          Les comptes d'un club voient les donnees de leur club. Un autre club ne voit d'un joueur que son identite
          sportive (nom, prenom, poste), ses statistiques de match, ses cartons et suspensions et son historique de clubs :
          jamais son numero de licence, sa date de naissance, sa morphologie, ses donnees de sante, de fatigue ou de
          presence, ni les commentaires du staff.
        </p>
      </section>

      <section>
        <h2>Durees de conservation</h2>
        <ul>
          <li>Comptes : desactives apres 12 mois sans connexion (reactivables par un gestionnaire du club).</li>
          <li>Journal d'audit (dont adresses IP de connexion) : 12 mois.</li>
          <li>Sessions : 30 jours sans activite.</li>
          <li>Feuilles de match importees : le fichier PDF n'est jamais conserve, seules les donnees utiles sont extraites.</li>
          <li>Donnees des joueurs et donnees medicales : <ACompleter>duree retenue par le club</ACompleter>.</li>
        </ul>
      </section>

      <section>
        <h2>Hebergement et securite</h2>
        <p>
          Application hebergee en Europe (Francfort pour l'interface et l'API, Irlande pour la base de donnees) par des
          prestataires dont certains sont etablis hors de l'Union europeenne
          (<ACompleter>verifier les garanties de transfert : clauses contractuelles types, Data Privacy Framework</ACompleter>).
          Echanges chiffres (HTTPS), mots de passe haches, sessions dans des cookies inaccessibles aux scripts, acces
          cloisonnes par club et journalises.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>Uniquement des cookies strictement necessaires au fonctionnement : aucune mesure d'audience, aucun pixel ni traceur publicitaire.</p>
        <ul>
          {COOKIES.map((c) => (
            <li key={c.nom}><strong>{c.nom}</strong> : {c.finalite} ({c.duree}).</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Vos droits</h2>
        <p>
          Vous disposez d'un droit d'acces, de rectification, d'effacement, de limitation, d'opposition et de portabilite
          sur vos donnees. Pour l'exercer, contactez le responsable du traitement (ci-dessus). Vous pouvez aussi introduire
          une reclamation aupres de la CNIL (cnil.fr).
        </p>
      </section>
    </PageLegale>
  );
}
