// src/app/mentions-legales/page.tsx
//
// Mentions legales : publiques. Les informations propres a l'exploitant sont a completer.

import { ACompleter, PageLegale } from "@/features/legal/components/PageLegale";

export const metadata = { title: "Mentions legales · Foot Analytics" };

export default function MentionsLegales() {
  return (
    <PageLegale titre="Mentions legales" majLe="octobre 2026">
      <section>
        <h2>Editeur</h2>
        <p><ACompleter>raison sociale ou nom de l'association, adresse, numero RNA ou SIRET, contact</ACompleter>.</p>
        <p>Directeur de la publication : <ACompleter>nom</ACompleter>.</p>
      </section>
      <section>
        <h2>Hebergement</h2>
        <ul>
          <li>Interface : Vercel Inc. (vercel.com), execution en region Francfort (fra1).</li>
          <li>API : Render Services, Inc. (render.com), region Francfort.</li>
          <li>Base de donnees : Supabase, Inc. (supabase.com), region Irlande (eu-west-1).</li>
        </ul>
      </section>
      <section>
        <h2>Nature du service</h2>
        <p>
          Outil prive d'analyse et de suivi destine aux staffs des clubs, accessible sur invitation. Les statistiques,
          scores et predictions affiches sont une aide a la decision, non contraignante : ils ne remplacent pas
          l'appreciation du staff.
        </p>
      </section>
      <section>
        <h2>Donnees personnelles</h2>
        <p>Voir la politique de confidentialite.</p>
      </section>
    </PageLegale>
  );
}
