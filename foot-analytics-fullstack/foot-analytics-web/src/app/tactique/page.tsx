// src/app/tactique/page.tsx
//
// Composition d'equipe : dispositif, onze de depart, remplacants, capitaine, consignes. Les joueurs
// sont ceux de l'EFFECTIF de l'equipe choisie (saison comprise), le plan est enregistre en base, par
// equipe (et par match quand un match est a venir).
//
// REGLE DES MUTES : au plus 6 joueurs mutes sur la feuille de match (titulaires + remplacants), dont
// 2 maximum hors delai. Les listes grisent les joueurs qui la feraient depasser, et l'API la refuse
// a l'enregistrement.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useOwnEquipe } from "@/lib/own-equipe-context";
import { useFeedback } from "@/lib/feedback-context";
import { useClub } from "@/lib/clubs-context";
import { prochainMatch, resultatsDeLEquipe } from "@/lib/matchs-equipe";
import {
  changerDispositif, FORMATION_DEFAUT, FORMATIONS, ligneDuPoste, MAX_REMPLACANTS, NB_TITULAIRES,
  nettoyerComposition, optionsJoueurs, slotsDeFormation, suggererOnze, vigilances, parseFormation,
  type JoueurTactique,
} from "@/lib/composition";
import { bilanMutations, categorieMutation, SIGLE_CATEGORIE } from "@/lib/mutations";
import type { TactiquePlan } from "@/lib/types";
import { Pitch, type JoueurTerrain } from "@/components/Pitch";
import { SaisonGuard, useLectureSeule } from "@/components/SaisonGuard";
import { RegleMutations } from "@/components/tactique/RegleMutations";
import { SelecteurJoueur } from "@/components/tactique/SelecteurJoueur";
import { FatigueBar } from "@/components/FatigueBar";
import { DernierPlanRealise } from "@/components/tactique/DernierPlanRealise";
import {
  AlertTriangle, CalendarClock, Eraser, Info, Plus, Save, Sparkles, X,
} from "lucide-react";

export default function Tactique() {
  return (
    <SaisonGuard libelle="La preparation tactique">
      <TactiqueContent />
    </SaisonGuard>
  );
}

/** Un match a venir de l'equipe : adversaire, date, lieu. */
interface ProchainMatch { id: string; date: string; domicile: boolean; adversaireId: string }

function TactiqueContent() {
  const lectureSeule = useLectureSeule();
  const { equipeId } = useOwnEquipe();
  const { notifier, confirmer } = useFeedback();

  const [chargement, setChargement] = useState(true);
  const [equipeNom, setEquipeNom] = useState("");
  const [joueurs, setJoueurs] = useState<JoueurTactique[]>([]);
  const [sansFiche, setSansFiche] = useState(0);
  const [prochain, setProchain] = useState<ProchainMatch | null>(null);

  const [formation, setFormation] = useState(FORMATION_DEFAUT);
  const [titulaires, setTitulaires] = useState<(string | null)[]>(Array(NB_TITULAIRES).fill(null));
  const [remplacants, setRemplacants] = useState<string[]>([]);
  const [capitaineId, setCapitaineId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [enregistre, setEnregistre] = useState<string | null>(null);     // instantane du plan enregistre (JSON)
  const [modifieLe, setModifieLe] = useState<string | null>(null);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreurRegle, setErreurRegle] = useState<string[] | null>(null);
  const [poste, setPoste] = useState<number | null>(null);               // poste selectionne sur le terrain
  const selects = useRef<(HTMLSelectElement | null)[]>([]);

  const instantane = useCallback(
    () => JSON.stringify({ formation, titulaires, remplacants, capitaineId, notes: notes.trim() }),
    [formation, titulaires, remplacants, capitaineId, notes],
  );

  // ---- Chargement : effectif, indisponibilites, prochain match, plan enregistre -----------------
  useEffect(() => {
    let annule = false;
    (async () => {
      setChargement(true);
      if (!equipeId) { setJoueurs([]); setChargement(false); return; }
      const [effectif, blessures, matchs, equipes] = await Promise.all([
        api.effectifEquipe(equipeId), api.blessures(), api.matchs(), api.equipes(),
      ]);
      if (annule) return;

      const indispo = new Set<string>(), reprise = new Set<string>();
      for (const b of blessures) {
        const st = String(b.statut ?? "");
        if (/indisp|suspendu/i.test(st)) indispo.add(b.joueurId);
        else if (/reprise/i.test(st)) reprise.add(b.joueurId);
      }
      const avecFiche = effectif.filter((j: any) => j.id);
      const liste: JoueurTactique[] = avecFiche.map((j: any) => ({
        id: j.id, nom: j.nom, prenom: j.prenom, poste: j.poste, numeroFavori: j.numeroFavori,
        statutMutation: j.statutMutation, matchs: j.matchs, titularisations: j.titularisations, minutes: j.minutes,
        noteMoyenne: j.noteMoyenne, scoreFatigue: j.scoreFatigue,
        indisponible: indispo.has(j.id), enReprise: reprise.has(j.id),
      }));
      setJoueurs(liste);
      setSansFiche(effectif.length - avecFiche.length);
      setEquipeNom(equipes.find((e: any) => e.id === equipeId)?.nom ?? "");

      const aVenir = prochainMatch(resultatsDeLEquipe(matchs, equipeId).aVenir).prochain;
      const pm: ProchainMatch | null = aVenir
        ? { id: aVenir.id, date: aVenir.date ?? "", domicile: aVenir.equipeDomId === equipeId,
            adversaireId: aVenir.equipeDomId === equipeId ? aVenir.clubExt : aVenir.clubDom }
        : null;
      setProchain(pm);

      // Plan du prochain match, sinon plan courant de l'equipe, sinon suggestion.
      let plan: TactiquePlan | null = pm ? await api.tactique(equipeId, pm.id) : null;
      if (!plan) plan = await api.tactique(equipeId);
      if (annule) return;

      const connus = new Set(liste.map((j) => j.id));
      if (plan) {
        const propre = nettoyerComposition(
          { titulaires: plan.titulaires.map((id) => id || null), remplacants: plan.remplacants }, connus,
        );
        const cap = plan.capitaineId && propre.titulaires.includes(plan.capitaineId) ? plan.capitaineId : null;
        setFormation(parseFormation(plan.formation) ? plan.formation : FORMATION_DEFAUT);
        setTitulaires(propre.titulaires);
        setRemplacants(propre.remplacants);
        setCapitaineId(cap);
        setNotes(plan.notes ?? "");
        setModifieLe(plan.modifieLe);
        setEnregistre(JSON.stringify({
          formation: plan.formation, titulaires: propre.titulaires, remplacants: propre.remplacants,
          capitaineId: cap, notes: (plan.notes ?? "").trim(),
        }));
        if (propre.retires > 0) {
          notifier.info(`${propre.retires} joueur${propre.retires > 1 ? "s" : ""} du plan enregistre ne fait${propre.retires > 1 ? "ont" : ""} plus partie de l'effectif : poste${propre.retires > 1 ? "s" : ""} libere${propre.retires > 1 ? "s" : ""}.`);
        }
      } else {
        const s = suggererOnze({ formation: FORMATION_DEFAUT, joueurs: liste });
        setFormation(FORMATION_DEFAUT);
        setTitulaires(s.titulaires);
        setRemplacants(s.remplacants);
        setCapitaineId(null);
        setNotes("");
        setModifieLe(null);
        setEnregistre(null);                   // pas de plan enregistre : la suggestion est a valider
      }
      setChargement(false);
    })().catch(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeId]);

  // ---- Derives ---------------------------------------------------------------------------------
  const slots = useMemo(() => slotsDeFormation(formation), [formation]);
  const parId = useMemo(() => new Map(joueurs.map((j) => [j.id, j])), [joueurs]);
  const groupe = useMemo(() => [...titulaires.filter((x): x is string => !!x), ...remplacants], [titulaires, remplacants]);
  const statutsGroupe = useMemo(() => groupe.map((id) => parId.get(id)?.statutMutation), [groupe, parId]);
  const bilan = useMemo(() => bilanMutations(statutsGroupe), [statutsGroupe]);
  const alertes = useMemo(
    () => vigilances({ formation, titulaires, remplacants, joueurs, sansMutations: true }),
    [formation, titulaires, remplacants, joueurs],
  );
  const modifie = enregistre === null || instantane() !== enregistre;
  const peutEnregistrer = !lectureSeule && !sauvegarde && bilan.valide && modifie && groupe.length > 0;

  const terrain: (JoueurTerrain | null)[] = titulaires.map((id, i) => {
    const j = id ? parId.get(id) : null;
    if (!j) return null;
    const cat = categorieMutation(j.statutMutation);
    return {
      numero: j.numeroFavori ?? i + 1, nom: j.nom, capitaine: j.id === capitaineId,
      marque: cat === "mutation" ? "M" : cat === "hors_delai" ? "HD" : null, indisponible: j.indisponible,
    };
  });

  // ---- Actions ---------------------------------------------------------------------------------
  function placer(index: number, id: string) {
    setErreurRegle(null);
    setTitulaires((t) => t.map((x, i) => (i === index ? id || null : x)));
    // Un joueur place en titulaire quitte le banc et perd le brassard s'il est remplace.
    if (id) setRemplacants((r) => r.filter((x) => x !== id));
    if (capitaineId && titulaires[index] === capitaineId && id !== capitaineId) setCapitaineId(null);
  }
  function ajouterRemplacant(id: string) {
    if (!id || remplacants.length >= MAX_REMPLACANTS) return;
    setErreurRegle(null);
    setRemplacants((r) => [...r, id]);
  }
  function retirerRemplacant(id: string) {
    setErreurRegle(null);
    setRemplacants((r) => r.filter((x) => x !== id));
  }
  function choisirFormation(nouvelle: string) {
    const { titulaires: nt, surplus } = changerDispositif(formation, nouvelle, titulaires);
    setFormation(nouvelle);
    setTitulaires(nt);
    setPoste(null);
    setErreurRegle(null);
    const place = Math.max(0, MAX_REMPLACANTS - remplacants.length);
    if (surplus.length > 0) {
      setRemplacants((r) => [...r, ...surplus.slice(0, place)]);
      notifier.info(`${surplus.length} joueur${surplus.length > 1 ? "s" : ""} sans poste dans le ${nouvelle} : passe${surplus.length > 1 ? "s" : ""} sur le banc.`);
    }
    if (capitaineId && !nt.includes(capitaineId)) setCapitaineId(null);
  }
  function suggerer() {
    const s = suggererOnze({ formation, joueurs });
    setTitulaires(s.titulaires);
    setRemplacants(s.remplacants);
    setCapitaineId(null);
    setErreurRegle(null);
    const regle = s.ecartes.filter((e) => e.raison === "regle des mutes").length;
    const indispo = s.ecartes.filter((e) => e.raison === "indisponible").length;
    const details = [indispo ? `${indispo} indisponible${indispo > 1 ? "s" : ""} ecarte${indispo > 1 ? "s" : ""}` : null, regle ? `${regle} ecarte${regle > 1 ? "s" : ""} par la regle des mutes` : null].filter(Boolean);
    notifier.info(`Onze suggere d'apres le temps de jeu, la note et la fraicheur${details.length ? ` (${details.join(", ")})` : ""}.`);
  }
  async function vider() {
    if (groupe.length > 0 && !(await confirmer({ titre: "Vider la composition ?", message: "Les titulaires et les remplacants sont retires (rien n'est supprime tant que tu n'enregistres pas).", libelleConfirmer: "Vider" }))) return;
    setTitulaires(Array(NB_TITULAIRES).fill(null));
    setRemplacants([]);
    setCapitaineId(null);
    setErreurRegle(null);
  }
  async function enregistrer() {
    if (!equipeId) return;
    setSauvegarde(true);
    setErreurRegle(null);
    try {
      const plan = await api.enregistrerTactique({
        equipeId, matchId: prochain?.id ?? null, formation, titulaires, remplacants,
        capitaineId, notes: notes.trim() || null,
      });
      setEnregistre(instantane());
      setModifieLe(plan.modifieLe);
      notifier.succes(prochain ? "Composition enregistree pour le prochain match." : "Composition enregistree.");
    } catch (e) {
      const corps = e instanceof ApiError ? e.corps : null;
      if (corps?.code === "REGLE_MUTATIONS") {
        setErreurRegle(corps.violations ?? [corps.message]);
        notifier.erreur(corps.message);
      } else {
        notifier.erreur(corps?.message ? String(corps.message) : "Enregistrement impossible. Reessaie dans un instant.");
      }
    } finally {
      setSauvegarde(false);
    }
  }
  function choisirPoste(index: number) {
    setPoste(index);
    const el = selects.current[index];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }

  // ---- Etats vides -----------------------------------------------------------------------------
  if (!equipeId) {
    return <EtatVide titre="Aucune equipe selectionnee" texte="Choisis une equipe dans le selecteur en bas a gauche pour preparer sa composition." />;
  }
  if (chargement) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Chargement de la composition">
        <div className="h-16 animate-pulse rounded-2xl bg-panel2" />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 h-[520px] animate-pulse rounded-2xl bg-panel2 lg:col-span-7" />
          <div className="col-span-12 h-[520px] animate-pulse rounded-2xl bg-panel2 lg:col-span-5" />
        </div>
      </div>
    );
  }
  if (joueurs.length === 0) {
    return (
      <EtatVide titre="Aucun joueur dans l'effectif"
        texte="La composition se construit a partir de l'effectif de l'equipe. Ajoute des joueurs ou importe une feuille de match."
        lien={{ href: "/effectif", libelle: "Ouvrir l'effectif" }} />
    );
  }

  // Pour un poste : tout l'effectif sauf les autres titulaires (un remplacant peut etre promu).
  const titulairesAilleurs = (index: number) => new Set(titulaires.filter((x, i): x is string => !!x && i !== index));

  return (
    <div className="space-y-6 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="h-section">Plan de jeu{equipeNom ? ` · ${equipeNom}` : ""}</div>
          <h1 className="font-display text-2xl font-bold text-ink">Tactique</h1>
          <ProchainMatchPuce prochain={prochain} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={formation} onChange={(e) => choisirFormation(e.target.value)} disabled={lectureSeule}
            className="btn" aria-label="Dispositif">
            {FORMATIONS.map((f) => <option key={f}>{f}</option>)}
          </select>
          <button onClick={suggerer} className="btn" disabled={lectureSeule}><Sparkles size={13} /> Onze suggere</button>
          <button onClick={vider} className="btn" disabled={lectureSeule || groupe.length === 0}><Eraser size={13} /> Vider</button>
          <button onClick={enregistrer} className="btn btn-primary" disabled={!peutEnregistrer}
            title={lectureSeule ? "Saison archivee : consultation seule"
              : !bilan.valide ? "La regle des mutes n'est pas respectee"
              : !modifie ? "Aucune modification a enregistrer" : undefined}>
            <Save size={13} /> {sauvegarde ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </header>

      <p className="-mt-3 text-[11px] text-faint" role="status">
        {modifieLe && !modifie
          ? `Enregistre le ${new Date(modifieLe).toLocaleDateString("fr-FR")} a ${new Date(modifieLe).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`
          : modifie ? (enregistre === null ? "Suggestion non enregistree : ajuste-la puis enregistre." : "Modifications non enregistrees.") : ""}
        {sansFiche > 0 && ` ${sansFiche} joueur${sansFiche > 1 ? "s" : ""} sans fiche ne ${sansFiche > 1 ? "sont" : "est"} pas proposable${sansFiche > 1 ? "s" : ""}.`}
      </p>

      <section className="grid grid-cols-12 gap-4">
        {/* Terrain */}
        <div className="col-span-12 space-y-4 lg:col-span-7">
          <Pitch formation={formation} joueurs={terrain} libellesPostes={slots.map((s) => s.libelle)}
            onSelectionne={lectureSeule ? undefined : choisirPoste} indexSelectionne={poste}
            titre={`Composition · ${formation}`} oriente="bas" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-faint">
            <span className="flex items-center gap-1.5"><span className="rounded-full bg-amber px-1.5 text-[9px] font-extrabold text-[rgb(var(--bg))]">M</span> Mute</span>
            <span className="flex items-center gap-1.5"><span className="rounded-full bg-danger px-1.5 text-[9px] font-extrabold text-[rgb(var(--bg))]">HD</span> Mute hors delai</span>
            <span>Clique un poste pour le choisir.</span>
          </div>
        </div>

        {/* Regle, onze, banc, vigilances */}
        <div className="col-span-12 space-y-4 lg:col-span-5">
          <RegleMutations bilan={bilan} effectifTotal={joueurs.length} />
          {erreurRegle && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              Le serveur a refuse cette composition : {erreurRegle.join(" ")}
            </p>
          )}

          <section className="panel p-5" aria-labelledby="onze-depart">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="onze-depart" className="h-section">11 de depart</h2>
              <span className="badge badge-accent" data-testid="nb-titulaires">{titulaires.filter(Boolean).length}/{NB_TITULAIRES}</span>
            </div>
            <ol className="space-y-2">
              {slots.map((slot) => {
                const courant = titulaires[slot.index];
                const j = courant ? parId.get(courant) : null;
                const options = optionsJoueurs({
                  joueurs, ligne: slot.ligne, liste: groupe, ailleurs: titulairesAilleurs(slot.index), courantId: courant,
                });
                const horsLigne = !!j && ligneDuPoste(j.poste) !== null && ligneDuPoste(j.poste) !== slot.ligne;
                return (
                  <li key={slot.index}
                    className={`flex items-center gap-2 rounded-lg ${poste === slot.index ? "bg-accent/10 ring-1 ring-accent/40" : ""}`}>
                    <span className="badge w-14 shrink-0 justify-center" title={horsLigne ? "Hors de sa ligne" : undefined}>{slot.libelle}</span>
                    <SelecteurJoueur ref={(el) => { selects.current[slot.index] = el; }}
                      ariaLabel={`Joueur pour le poste ${slot.libelle}`} valeur={courant ?? ""} options={options}
                      groupePoste={slot.ligne} vide="— Vide —" disabled={lectureSeule}
                      onChange={(id) => placer(slot.index, id)} />
                    <span className="w-16 shrink-0">{j ? <FatigueBar score={j.scoreFatigue} largeur="w-8" /> : null}</span>
                  </li>
                );
              })}
            </ol>
            <label className="mt-4 flex items-center gap-2 text-xs text-muted">
              <span className="w-14 shrink-0 text-[11px] uppercase tracking-wider text-faint">Capitaine</span>
              <select className="inp min-w-0 flex-1 text-xs" value={capitaineId ?? ""} disabled={lectureSeule}
                onChange={(e) => setCapitaineId(e.target.value || null)} aria-label="Capitaine">
                <option value="">— Aucun —</option>
                {titulaires.filter((x): x is string => !!x).map((id) => {
                  const p = parId.get(id)!;
                  return <option key={id} value={id}>{`${p.prenom ?? ""} ${p.nom}`.trim()}</option>;
                })}
              </select>
            </label>
          </section>

          <section className="panel p-5" aria-labelledby="remplacants">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="remplacants" className="h-section">Remplacants</h2>
              <span className="badge" data-testid="nb-remplacants">{remplacants.length}/{MAX_REMPLACANTS}</span>
            </div>
            {remplacants.length === 0 ? (
              <p className="mb-3 text-xs text-faint">Aucun remplacant : ajoute-les ci-dessous.</p>
            ) : (
              <ul className="mb-3 space-y-1.5">
                {remplacants.map((id) => {
                  const j = parId.get(id);
                  if (!j) return null;
                  const sigle = SIGLE_CATEGORIE[categorieMutation(j.statutMutation)];
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg bg-panel2 px-2.5 py-1.5 text-xs">
                      <span className="badge w-10 justify-center">{j.poste ?? "?"}</span>
                      <span className={`min-w-0 flex-1 truncate ${j.indisponible ? "text-danger line-through" : "text-ink"}`}>
                        {j.numeroFavori != null ? `#${j.numeroFavori} ` : ""}{j.prenom} {j.nom}
                      </span>
                      {sigle && <span className={`rounded-full px-1.5 text-[9px] font-extrabold text-[rgb(var(--bg))] ${sigle === "HD" ? "bg-danger" : "bg-amber"}`}>{sigle}</span>}
                      <FatigueBar score={j.scoreFatigue} largeur="w-10" />
                      <button className="rounded-md p-1 text-faint hover:bg-panel3 hover:text-ink disabled:opacity-40" disabled={lectureSeule}
                        onClick={() => retirerRemplacant(id)} aria-label={`Retirer ${j.prenom ?? ""} ${j.nom} du banc`}>
                        <X size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {remplacants.length < MAX_REMPLACANTS && (
              <div className="flex items-center gap-2">
                <Plus size={14} className="shrink-0 text-faint" aria-hidden />
                <SelecteurJoueur ariaLabel="Ajouter un remplacant" valeur="" vide="Ajouter un remplacant..." disabled={lectureSeule}
                  options={optionsJoueurs({ joueurs, ligne: null, liste: groupe, ailleurs: new Set(groupe) })}
                  onChange={ajouterRemplacant} />
              </div>
            )}
          </section>

          <section className="panel p-5" aria-labelledby="vigilances">
            <h2 id="vigilances" className="h-section mb-3">Points de vigilance</h2>
            {alertes.length === 0 ? (
              <p className="text-xs text-muted">Rien a signaler : onze complet, joueurs disponibles et reposes.</p>
            ) : (
              <ul className="space-y-2">
                {alertes.map((a) => (
                  <li key={a.texte} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${a.niveau === "alerte" ? "bg-danger/10 text-danger" : "bg-panel2 text-muted"}`}>
                    {a.niveau === "alerte" ? <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> : <Info size={14} className="mt-0.5 shrink-0 text-faint" aria-hidden />}
                    {a.texte}
                  </li>
                ))}
              </ul>
            )}
            <label className="mt-4 block text-xs text-muted">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-faint">Consignes</span>
              <textarea className="inp w-full resize-y text-xs" rows={3} maxLength={600} value={notes} disabled={lectureSeule}
                onChange={(e) => setNotes(e.target.value)} placeholder="Coups de pied arretes, pressing, joueur a surveiller..." />
            </label>
          </section>

          {equipeId && <DernierPlanRealise equipeId={equipeId} />}
        </div>
      </section>
    </div>
  );
}

function ProchainMatchPuce({ prochain }: { prochain: ProchainMatch | null }) {
  const adversaire = useClub(prochain?.adversaireId ?? "");
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
      <CalendarClock size={12} className="text-faint" aria-hidden />
      {prochain
        ? <>Prochain match : <b className="text-ink">{adversaire?.nom ?? "adversaire"}</b> · {prochain.date || "date a confirmer"} · {prochain.domicile ? "domicile" : "exterieur"}</>
        : "Aucun match a venir : la composition enregistree est le plan courant de l'equipe."}
    </p>
  );
}

function EtatVide({ titre, texte, lien }: { titre: string; texte: string; lien?: { href: string; libelle: string } }) {
  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section">Plan de jeu</div>
        <h1 className="font-display text-2xl font-bold text-ink">Tactique</h1>
      </header>
      <section className="panel p-8 text-center">
        <div className="mb-2 text-sm font-semibold text-ink">{titre}</div>
        <p className="mx-auto max-w-md text-xs text-muted">{texte}</p>
        {lien && <Link href={lien.href} className="btn btn-primary mt-4 inline-flex">{lien.libelle}</Link>}
      </section>
    </div>
  );
}
