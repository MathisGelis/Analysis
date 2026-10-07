// src/app/scouting/page.tsx
//
// Ancienne page de scouting : la liste des clubs et de leurs rapports est maintenant dans /rapports (un dossier par club).

import { redirect } from "next/navigation";

export default function Scouting() {
  redirect("/rapports");
}
