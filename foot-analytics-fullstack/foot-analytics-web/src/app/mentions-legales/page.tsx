// src/app/mentions-legales/page.tsx
//
// Mentions legales : publiques. Les informations propres a l'exploitant sont a completer.

import { ACompleter, PageLegale } from "@/features/legal/components/PageLegale";

export const metadata = { title: "Mentions légales · Foot Analytics" };

export default function MentionsLegales() {
  return (
    <PageLegale titre="Mentions légales" majLe="octobre 2026">
      <section>
        <h2>Éditeur</h2>
        <p><ACompleter>raison sociale ou nom de l'association, adresse, numéro RNA ou SIRET, contact</ACompleter>.</p>
        <p>Directeur de la publication : <ACompleter>nom</ACompleter>.</p>
      </section>
      <section>
        <h2>Hébergement</h2>
        <ul>
          <li>Interface : Vercel Inc. (vercel.com), exécution en région Francfort (fra1).</li>
          <li>API : Render Services, Inc. (render.com), région Francfort.</li>
          <li>Base de données : Supabase, Inc. (supabase.com), région Irlande (eu-west-1).</li>
        </ul>
      </section>
      <section>
        <h2>Nature du service</h2>
        <p>
          Outil privé d'analyse et de suivi destiné aux staffs des clubs, accessible sur invitation. Les statistiques,
          scores et prédictions affichés sont une aide à la décision, non contraignante : ils ne remplacent pas
          l'appréciation du staff.
        </p>
      </section>
      <section>
        <h2>Données personnelles</h2>
        <p>Voir la politique de confidentialité.</p>
      </section>
    </PageLegale>
  );
}
