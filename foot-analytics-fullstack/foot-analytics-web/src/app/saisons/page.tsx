// src/app/saisons/page.tsx
//
// Liste les saisons en base, marque la saison active, permet d'en
// activer une autre ou d'en creer une nouvelle. Composant client pour
// l'interactivite.

import { api } from "@/lib/api";
import { SaisonsManager } from "@/components/SaisonsManager";

export const metadata = { title: "Saisons · Foot Analytics" };

export default async function SaisonsPage() {
  const [saisons, equipes] = await Promise.all([api.saisons(), api.equipes()]);
  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section">Gestion multi-saisons</div>
        <h1 className="font-display text-2xl font-bold text-ink">Saisons</h1>
        <p className="text-sm text-muted mt-1">
          La saison "active" est celle utilisee par defaut a l'import et
          dans les vues. Une seule peut etre active a un instant donne.
        </p>
      </header>

      <SaisonsManager saisons={saisons} equipes={equipes} />
    </div>
  );
}
