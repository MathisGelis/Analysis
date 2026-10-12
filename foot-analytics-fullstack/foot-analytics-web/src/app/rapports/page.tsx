// src/app/rapports/page.tsx
//
// Route /rapports : la page vit dans features/rapports. C'est le point d'entree unique des rapports pre-match (avec leurs
// predictions), de l'analyse d'equipe et du scouting.

export const metadata = { title: "Rapports · Foot Analytics" };

export { default } from "@/features/rapports/components/RapportsPage";
