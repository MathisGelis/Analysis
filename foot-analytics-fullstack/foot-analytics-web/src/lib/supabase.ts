// src/lib/supabase.ts
//
// Client Supabase isomorphique. Si les variables d'environnement
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ne sont pas
// renseignees, l'application fonctionne en mode "demonstration" avec les
// donnees locales du dossier src/data (issues du parsing reel de la
// feuille de match Neuville vs Meys + du rapport Excel Chaponnay).

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && key);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

/**
 * Aide a l'inscription / connexion en mode dev.
 * En production, brancher la vraie UI d'auth sur ces helpers.
 */
export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase non configure (mode demo).");
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
