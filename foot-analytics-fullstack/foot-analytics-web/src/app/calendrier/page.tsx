"use client";
// src/app/calendrier/page.tsx
//
// Calendrier mensuel interactif :
//  - Navigation mois (<- ->) + bouton "Aujourd'hui"
//  - Jour actuel mis en evidence (border accent)
//  - Matchs reels (api.matchs) de l'equipe propre
//  - Entrainements reels (api.entrainements) de l'equipe propre
//  - Evenements "Autre" (reunions, deplacements, etc.) stockes en
//    localStorage par equipe (pas de backend pour ce type)
//  - Jours d'entrainement prevus recurrents (localStorage par equipe)
//
// CREATION : 3 boutons distincts au survol (+E entrainement, +M match,
// +A autre). Chacun ouvre sa propre modale dediee.
//  - Entrainement -> reutilise <SeanceModal/> (la MEME que /entrainements)
//  - Match -> <MatchModal/> : type championnat/coupe/amical + adversaire
//    texte libre (datalist clubs)
//  - Autre -> <AutreEventModal/> : titre, description, heure

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useOwnEquipe } from "@/lib/own-equipe-context";
import { useOwnClubId } from "@/lib/own-club-context";
import { Modal } from "@/components/Modal";
import { AdversairePicker } from "@/components/AdversairePicker";
import type { ClubChoix } from "@/lib/adversaires";
import { SeanceModal } from "@/components/SeanceModal";
import { TimePicker24 } from "@/components/TimePicker24";
import { ClubBadge } from "@/components/ClubBadge";
import { SaisonGuard, useLectureSeule } from "@/components/SaisonGuard";
import { dateVersIso, moisInitial } from "@/lib/calendrier";
import { useAjouterClub } from "@/lib/clubs-context";
import {
  CalendarCheck, ChevronLeft, ChevronRight, Dumbbell,
  FileText, Plus, Save, Settings2, Trophy, X,
  Calendar as CalIcon, Trash2,
} from "lucide-react";

const JOURS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

interface MatchEv {
  id: string; date?: string; heure?: string; journee?: string;
  clubDom: string; clubExt: string; scoreDom: number; scoreExt: number;
  equipeDomId?: string | null; equipeExtId?: string | null; statut?: string;
  competition?: string;
}
interface AutreEv {
  id: string; date: string; heure?: string;
  titre: string; description?: string;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function dowFR(d: Date) { return (d.getDay() + 6) % 7; } // Lun=0...Dim=6

export default function Calendrier() {
  return (
    <SaisonGuard libelle="Le calendrier">
      <CalendrierContent/>
    </SaisonGuard>
  );
}

function CalendrierContent() {
  const lectureSeule = useLectureSeule();
  const ownClubId = useOwnClubId();
  const { equipeId, saisonId } = useOwnEquipe();
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [seances, setSeances] = useState<any[]>([]);
  const [matchs, setMatchs] = useState<MatchEv[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [effectif, setEffectif] = useState<any[]>([]);
  const [autres, setAutres] = useState<AutreEv[]>([]);
  const [planning, setPlanning] = useState<{ jours: number[]; heure: string }>(
    () => ({ jours: [1, 3], heure: "19:30" }),  // Mar/Jeu par defaut
  );
  const [planningOpen, setPlanningOpen] = useState(false);
  const [addOpen, setAddOpen] = useState<
    null | { date: string; type: "entrainement" | "match" | "autre" }
  >(null);

  // Charge la cle planning + autres depuis localStorage (par equipe).
  useEffect(() => {
    if (typeof window === "undefined" || !equipeId) return;
    const rawP = localStorage.getItem(`fa.planning.${equipeId}`);
    if (rawP) { try { setPlanning(JSON.parse(rawP)); } catch {} }
    const rawA = localStorage.getItem(`fa.autres.${equipeId}`);
    if (rawA) { try { setAutres(JSON.parse(rawA)); } catch {} }
  }, [equipeId]);

  // Charge les donnees au montage et a chaque changement d'equipe.
  useEffect(() => {
    if (!equipeId) return;
    (async () => {
      const [s, m, c, e, eff, saisons] = await Promise.all([
        api.entrainements(equipeId),
        api.matchs(),
        api.clubs(),
        api.equipes(),
        api.effectifEquipe(equipeId),
        api.saisons(),
      ]);
      // Ouvre le calendrier sur un mois de la SAISON choisie (et non sur
      // "aujourd'hui" d'office : une saison archivee y serait vide).
      const saison = saisons.find((x: any) => x.id === saisonId) ?? null;
      setCursor(moisInitial(saison, m
        .filter((mm: any) => mm.equipeDomId === equipeId || mm.equipeExtId === equipeId)
        .map((mm: any) => mm.date)));
      setSeances(s);
      setEquipes(e);
      setClubs(c);
      setEffectif(eff);
      setMatchs(m.filter((mm: any) =>
        mm.equipeDomId === equipeId || mm.equipeExtId === equipeId));
    })();
  }, [equipeId, saisonId]);

  const reload = async () => {
    if (!equipeId) return;
    // Les clubs aussi : un adversaire cree depuis la modale doit s'afficher par son nom, pas par son identifiant.
    const [s, m, c] = await Promise.all([
      api.entrainements(equipeId),
      api.matchs(),
      api.clubs(),
    ]);
    setSeances(s);
    setClubs(c);
    setMatchs(m.filter((mm: any) =>
      mm.equipeDomId === equipeId || mm.equipeExtId === equipeId));
  };

  const mois = useMemo(() => {
    const first = startOfMonth(cursor);
    const startDow = dowFR(first);
    const nbDays = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const slots: { date: Date | null; iso: string | null }[] = [];
    for (let i = 0; i < startDow; i++) slots.push({ date: null, iso: null });
    for (let i = 1; i <= nbDays; i++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), i);
      slots.push({ date: d, iso: isoDate(d) });
    }
    while (slots.length < 42) slots.push({ date: null, iso: null });
    return slots;
  }, [cursor]);

  const todayIso = isoDate(new Date());

  const seancesParDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of seances) {
      const iso = dateVersIso(s.date);
      if (!iso) continue;
      const arr = map.get(iso) ?? [];
      arr.push(s);
      map.set(iso, arr);
    }
    return map;
  }, [seances]);
  const matchsParDate = useMemo(() => {
    const map = new Map<string, MatchEv[]>();
    for (const m of matchs) {
      // Les FMI datent en JJ/MM/AAAA : cle normalisee en AAAA-MM-JJ.
      const iso = dateVersIso(m.date);
      if (!iso) continue;
      const arr = map.get(iso) ?? [];
      arr.push(m);
      map.set(iso, arr);
    }
    return map;
  }, [matchs]);
  const autresParDate = useMemo(() => {
    const map = new Map<string, AutreEv[]>();
    for (const a of autres) {
      const arr = map.get(a.date) ?? [];
      arr.push(a);
      map.set(a.date, arr);
    }
    return map;
  }, [autres]);

  // Sauve / supprime un evenement "Autre" en localStorage.
  const persistAutres = (list: AutreEv[]) => {
    setAutres(list);
    if (typeof window !== "undefined" && equipeId) {
      localStorage.setItem(`fa.autres.${equipeId}`, JSON.stringify(list));
    }
  };
  const removeAutre = (id: string) => {
    persistAutres(autres.filter((a) => a.id !== id));
  };

  const savePlanning = (p: { jours: number[]; heure: string }) => {
    setPlanning(p);
    if (typeof window !== "undefined" && equipeId) {
      localStorage.setItem(`fa.planning.${equipeId}`, JSON.stringify(p));
    }
  };

  if (!equipeId) {
    return (
      <div className="space-y-6 fade-up">
        <h1 className="font-display text-2xl font-bold text-ink">Calendrier</h1>
        <p className="text-muted">Selectionne une equipe dans la sidebar.</p>
      </div>
    );
  }

  const monEquipe = equipes.find((e) => e.id === equipeId);

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section">Vue mensuelle</div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {MOIS_FR[cursor.getMonth()]} {cursor.getFullYear()}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn" onClick={() => setCursor((d) => addMonths(d, -1))}>
            <ChevronLeft size={14}/> {MOIS_FR[addMonths(cursor, -1).getMonth()].slice(0, 4)}.
          </button>
          <button className="btn" onClick={() => setCursor(startOfMonth(new Date()))}>
            Aujourd'hui
          </button>
          <button className="btn" onClick={() => setCursor((d) => addMonths(d, 1))}>
            {MOIS_FR[addMonths(cursor, 1).getMonth()].slice(0, 4)}. <ChevronRight size={14}/>
          </button>
          <button className="btn" onClick={() => setPlanningOpen(true)}
            disabled={lectureSeule}
            title={lectureSeule ? "Saison archivee : consultation seule" : undefined}>
            <Settings2 size={14}/> Jours prevus
          </button>
        </div>
      </header>

      {/* Legende */}
      <div className="flex gap-5 text-[11px] text-muted flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent"/> Match
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber"/> Entrainement
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-sky"/> Autre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm border border-amber/30 bg-amber/5"/> Jour prevu (sans seance)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm border-2 border-accent"/> Aujourd'hui
        </span>
      </div>

      {/* Grille */}
      <section className="panel p-3">
        <div className="grid grid-cols-7 mb-2">
          {JOURS_FR.map((j) => (
            <div key={j} className="text-[10px] uppercase tracking-[0.18em] text-faint px-2 py-1">
              {j}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {mois.map((slot, i) => {
            if (!slot.date) {
              return <div key={i} className="min-h-[110px] opacity-30"/>;
            }
            const iso = slot.iso!;
            const isToday = iso === todayIso;
            const dow = dowFR(slot.date);
            const jourPrevu = planning.jours.includes(dow);
            const sList = seancesParDate.get(iso) ?? [];
            const mList = matchsParDate.get(iso) ?? [];
            const aList = autresParDate.get(iso) ?? [];
            const showPlaceholder = jourPrevu
              && sList.length === 0 && mList.length === 0;

            return (
              <div key={i}
                className={`min-h-[110px] panel-inset p-2 relative group ${
                  isToday ? "border-2 border-accent" : ""
                }`}>
                <div className="flex items-center justify-between">
                  <div className={`text-[11px] font-mono ${
                    isToday ? "text-accent font-bold" : "text-muted"
                  }`}>
                    {slot.date.getDate()}
                  </div>
                  {/* Visibles au survol, au clavier (focus) et en permanence sur ecran tactile (pas de survol). */}
                  <div className={`transition gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:!opacity-100 ${
                    lectureSeule ? "hidden" : "flex"
                  }`}>
                    <button
                      onClick={() => setAddOpen({ date: iso, type: "entrainement" })}
                      title="Ajouter un entrainement"
                      className="text-[9px] px-1 py-0.5 rounded hover:bg-amber/20 text-amber">+E</button>
                    <button
                      onClick={() => setAddOpen({ date: iso, type: "match" })}
                      title="Ajouter un match"
                      className="text-[9px] px-1 py-0.5 rounded hover:bg-accent/20 text-accent">+M</button>
                    <button
                      onClick={() => setAddOpen({ date: iso, type: "autre" })}
                      title="Ajouter un evenement"
                      className="text-[9px] px-1 py-0.5 rounded hover:bg-sky/20 text-sky">+A</button>
                  </div>
                </div>

                <div className="mt-1 space-y-1">
                  {/* Matchs */}
                  {mList.map((m) => {
                    const dom = m.equipeDomId === equipeId;
                    const advId = dom ? m.clubExt : m.clubDom;
                    const adv = clubs.find((c) => c.id === advId);
                    const isJoue = m.statut === "joue" || (m.scoreDom + m.scoreExt) > 0;
                    return (
                      <Link href={`/matchs/${m.id}`} key={m.id}
                        className="block px-1.5 py-1 rounded-sm text-[10px] leading-tight
                          bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25">
                        <div className="flex items-center gap-1">
                          {advId && <ClubBadge clubId={advId} size={12}/>}
                          <span className="font-bold truncate flex-1">{adv?.nom ?? advId}</span>
                          <span className="text-[9px] text-muted">{dom ? "D" : "E"}</span>
                        </div>
                        <div className="text-[9px] text-muted truncate">
                          {m.journee ?? m.competition} {m.heure ? `· ${m.heure}` : ""}
                          {isJoue && ` · ${dom ? m.scoreDom : m.scoreExt}-${dom ? m.scoreExt : m.scoreDom}`}
                        </div>
                      </Link>
                    );
                  })}
                  {/* Entrainements */}
                  {sList.map((s) => (
                    <div key={s.id}
                      className="px-1.5 py-1 rounded-sm text-[10px] leading-tight
                        bg-amber/10 text-amber border border-amber/20">
                      <div className="flex items-center gap-1">
                        <Dumbbell size={9}/>
                        <span className="font-bold truncate">{s.type ?? "Entr."}</span>
                        <span className="ml-auto text-[9px] text-muted">{s.heure ?? ""}</span>
                      </div>
                      {s.theme && (
                        <div className="text-[9px] text-muted truncate">{s.theme}</div>
                      )}
                    </div>
                  ))}
                  {/* Autres */}
                  {aList.map((a) => (
                    <div key={a.id}
                      className="px-1.5 py-1 rounded-sm text-[10px] leading-tight
                        bg-sky/10 text-sky border border-sky/20 group/autre relative">
                      <div className="flex items-center gap-1">
                        <FileText size={9}/>
                        <span className="font-bold truncate flex-1">{a.titre}</span>
                        <span className="text-[9px] text-muted">{a.heure ?? ""}</span>
                        <button onClick={() => removeAutre(a.id)}
                          title="Supprimer"
                          hidden={lectureSeule}
                          className="opacity-0 group-hover/autre:opacity-100 text-danger hover:bg-danger/20 rounded p-0.5">
                          <Trash2 size={8}/>
                        </button>
                      </div>
                      {a.description && (
                        <div className="text-[9px] text-muted truncate">{a.description}</div>
                      )}
                    </div>
                  ))}
                  {/* Placeholder jour d'entrainement prevu */}
                  {showPlaceholder && !lectureSeule && (
                    <button onClick={() => setAddOpen({ date: iso, type: "entrainement" })}
                      className="w-full px-1.5 py-1 rounded-sm text-[10px] leading-tight
                        border border-dashed border-amber/30 text-amber
                        hover:bg-amber/5 hover:text-amber transition text-left">
                      <div className="flex items-center gap-1">
                        <CalendarCheck size={9}/>
                        <span>Entrainement {planning.heure}</span>
                      </div>
                      <div className="text-[8px] text-muted">Prevu · clic pour creer</div>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {planningOpen && (
        <PlanningModal
          planning={planning}
          onSave={(p) => { savePlanning(p); setPlanningOpen(false); }}
          onClose={() => setPlanningOpen(false)}
        />
      )}

      {addOpen?.type === "entrainement" && (
        <SeanceModal
          equipeId={equipeId}
          effectif={effectif}
          defaultDate={addOpen.date}
          onClose={() => setAddOpen(null)}
          onSaved={async () => { setAddOpen(null); await reload(); }}
        />
      )}
      {addOpen?.type === "match" && (
        <MatchModal
          date={addOpen.date}
          monEquipe={monEquipe}
          clubs={clubs}
          equipes={equipes}
          onClose={() => setAddOpen(null)}
          onSaved={async () => { setAddOpen(null); await reload(); }}
        />
      )}
      {addOpen?.type === "autre" && (
        <AutreEventModal
          date={addOpen.date}
          onClose={() => setAddOpen(null)}
          onSaved={(ev) => { persistAutres([...autres, ev]); setAddOpen(null); }}
        />
      )}
    </div>
  );
}

/* ---- Modale : jours d'entrainement prevus ---- */

function PlanningModal({
  planning, onSave, onClose,
}: {
  planning: { jours: number[]; heure: string };
  onSave: (p: { jours: number[]; heure: string }) => void;
  onClose: () => void;
}) {
  const [jours, setJours] = useState<Set<number>>(new Set(planning.jours));
  const [heure, setHeure] = useState(planning.heure);
  const toggle = (j: number) => {
    const next = new Set(jours);
    if (next.has(j)) next.delete(j); else next.add(j);
    setJours(next);
  };
  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <ModalHeader
        icon={<CalIcon size={18} className="text-accent"/>}
        iconBg="bg-accent/15"
        title="Jours d'entrainement prevus"
        subtitle="Apparaissent en placeholder sur le calendrier, tant qu'aucune seance reelle n'est creee. Stocke localement (par equipe)."
        onClose={onClose}
      />

      <div className="space-y-5">
        <Section label="Jours de la semaine">
          <div className="flex gap-1.5 flex-wrap">
            {JOURS_FR.map((label, idx) => {
              const on = jours.has(idx);
              return (
                <button key={idx} onClick={() => toggle(idx)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${
                    on ? "bg-accent/15 border-accent/40 text-accent"
                       : "border-line text-muted hover:bg-line/30"
                  }`}>
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-faint mt-2">
            {jours.size === 0 ? "Aucun jour selectionne." : `${jours.size} jour${jours.size > 1 ? "s" : ""} selectionne${jours.size > 1 ? "s" : ""}.`}
          </p>
        </Section>

        <Section label="Heure de la seance">
          <TimePicker24 value={heure} onChange={setHeure}/>
        </Section>
      </div>

      <ModalFooter>
        <button onClick={onClose} className="btn">Annuler</button>
        <button onClick={() => onSave({ jours: [...jours].sort(), heure })}
          className="btn btn-accent">
          <Save size={14}/> Enregistrer
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* ---- Modale : creation match ---- */

const TYPES_MATCH = ["Championnat", "Coupe", "Amical"];

function MatchModal({
  date, monEquipe, clubs, equipes, onClose, onSaved,
}: {
  date: string;
  monEquipe: any;
  clubs: any[];
  equipes: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ajouterClub = useAjouterClub();
  const [typeMatch, setTypeMatch] = useState("Championnat");
  const [adversaire, setAdversaire] = useState<ClubChoix | null>(null);
  const [heure, setHeure] = useState("15:00");
  const [journee, setJournee] = useState("");
  const [domicile, setDomicile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Clubs crees depuis cette modale : ils rejoignent la liste tout de suite (la page ne se recharge qu'a l'enregistrement).
  const [clubsCrees, setClubsCrees] = useState<ClubChoix[]>([]);
  const tousLesClubs = useMemo(
    () => [...clubs, ...clubsCrees.filter((c) => !clubs.some((x) => x.id === c.id))],
    [clubs, clubsCrees],
  );

  // Les adversaires du championnat : les clubs des autres equipes de ma poule (meme saison, competition et poule).
  const suggeres = useMemo(() => {
    if (!monEquipe) return [];
    return equipes
      .filter((e) => e.id !== monEquipe.id && e.saisonId === monEquipe.saisonId
        && (e.competitionLibelle ?? null) === (monEquipe.competitionLibelle ?? null)
        && (e.poule ?? null) === (monEquipe.poule ?? null))
      .map((e) => e.clubId as string);
  }, [equipes, monEquipe]);

  async function creerClub(nom: string): Promise<ClubChoix> {
    const club = await api.createClub({ nom });
    const choix = { id: club.id, nom: club.nom, ville: club.ville };
    setClubsCrees((l) => [...l, choix]);
    ajouterClub(club);                      // son ecusson et son nom sont connus partout, sans recharger la page
    return choix;
  }

  async function save() {
    setError(null);
    if (!monEquipe) { setError("Equipe non chargee : recharge la page."); return; }
    if (!adversaire) { setError("Choisis l'adversaire."); return; }
    setSaving(true);
    try {
      // Le champ "competition" sert a la categorie : Championnat (libelle
      // de poule), Coupe ou Amical. Pour championnat on garde le libelle
      // exact, sinon on inscrit "Coupe" / "Amical".
      const competition = typeMatch === "Championnat"
        ? (monEquipe.competitionLibelle ?? "Championnat")
        : typeMatch;

      // Pour les non-championnat, pas de poule.
      const poule = typeMatch === "Championnat" ? monEquipe.poule : null;

      await api.createMatch({
        date, heure,
        journee: typeMatch === "Championnat" && journee.trim() ? journee.trim() : null,
        clubDom: domicile ? monEquipe.clubId : adversaire.id,
        clubExt: domicile ? adversaire.id : monEquipe.clubId,
        // Mon equipe cote domicile ou visiteur : c'est ce qui rattache le match a l'equipe (calendrier, dashboard).
        equipeDomId: domicile ? monEquipe.id : undefined,
        equipeExtId: domicile ? undefined : monEquipe.id,
        competition, poule,
        saisonId: monEquipe.saisonId,
        scoreDom: 0, scoreExt: 0,
        statut: "prevu",
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Erreur");
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader
        icon={<Trophy size={18} className="text-accent"/>}
        iconBg="bg-accent/15"
        title="Nouveau match"
        subtitle={`Date : ${formatDateFr(date)}`}
        onClose={onClose}
      />

      <div className="space-y-5">
        {/* Type de match : pills cliquables, plus visuel qu'un select */}
        <Section label="Type de match">
          <div className="flex gap-1.5">
            {TYPES_MATCH.map((t) => {
              const on = typeMatch === t;
              return (
                <button key={t} onClick={() => setTypeMatch(t)}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold border transition ${
                    on ? "bg-accent/15 border-accent/40 text-accent"
                       : "border-line text-muted hover:bg-line/30"
                  }`}>
                  {t}
                </button>
              );
            })}
          </div>
        </Section>

        <Section label="Adversaire">
          <AdversairePicker
            clubs={tousLesClubs} monClubId={monEquipe?.clubId} suggeres={suggeres}
            valeur={adversaire} onChange={setAdversaire} onCreer={creerClub}
          />
        </Section>

        <div className="grid grid-cols-2 gap-4">
          <Section label="Heure">
            <TimePicker24 value={heure} onChange={setHeure}/>
          </Section>
          <Section label="Cote">
            <div className="flex gap-1.5">
              <button onClick={() => setDomicile(true)}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold border transition ${
                  domicile ? "bg-accent/15 border-accent/40 text-accent"
                          : "border-line text-muted hover:bg-line/30"
                }`}>
                Domicile
              </button>
              <button onClick={() => setDomicile(false)}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold border transition ${
                  !domicile ? "bg-accent/15 border-accent/40 text-accent"
                            : "border-line text-muted hover:bg-line/30"
                }`}>
                Exterieur
              </button>
            </div>
          </Section>
        </div>

        {typeMatch === "Championnat" && (
          <Section label="Journee (optionnel)">
            <input className="inp" value={journee}
              onChange={(e) => setJournee(e.target.value)}
              placeholder="J23"/>
          </Section>
        )}

        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <ModalFooter>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-accent" onClick={save} disabled={saving || !monEquipe}>
          <Save size={14}/> {saving ? "Sauvegarde..." : "Creer le match"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* ---- Modale : evenement "Autre" (reunion, deplacement, etc.) ---- */

function AutreEventModal({
  date, onClose, onSaved,
}: {
  date: string;
  onClose: () => void;
  onSaved: (ev: AutreEv) => void;
}) {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [heure, setHeure] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (!titre.trim()) { setError("Renseigne un titre."); return; }
    const ev: AutreEv = {
      id: `autre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      heure: heure || undefined,
      titre: titre.trim(),
      description: description.trim() || undefined,
    };
    onSaved(ev);
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <ModalHeader
        icon={<FileText size={18} className="text-sky"/>}
        iconBg="bg-sky/15"
        title="Autre evenement"
        subtitle={`Date : ${formatDateFr(date)}`}
        onClose={onClose}
      />

      <div className="space-y-5">
        <p className="text-xs text-muted leading-relaxed">
          Reunion, deplacement, formation, evenement administratif... Stocke
          localement par equipe sur ce navigateur.
        </p>

        <Section label="Titre">
          <input className="inp" value={titre} autoFocus
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Reunion staff / AG club / etc."/>
        </Section>

        <Section label="Heure (optionnel)">
          <TimePicker24 value={heure} onChange={setHeure} allowEmpty/>
        </Section>

        <Section label="Description (optionnel)">
          <textarea className="inp min-h-[90px]" value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Lieu, participants, sujets..."/>
        </Section>

        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <ModalFooter>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-accent" onClick={save}>
          <Save size={14}/> Ajouter
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* ---- Helpers communs aux modales ---- */

/**
 * En-tete uniformise : icone dans une pastille coloree, titre + sous-titre,
 * bouton de fermeture. Trait de separation en bas.
 *
 * Pas de padding lateral : le composant Modal de base applique deja un p-6.
 */
function ModalHeader({
  icon, iconBg, title, subtitle, onClose,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-3 pb-4 mb-5 border-b border-line">
      <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="font-display text-lg font-bold text-ink leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="w-8 h-8 rounded-md grid place-items-center hover:bg-line/40 text-faint hover:text-ink transition"
        title="Fermer"
      >
        <X size={15}/>
      </button>
    </div>
  );
}

/**
 * Pied de modale : ligne de separation et boutons alignes a droite.
 * Les enfants doivent etre les boutons d'action (annuler + valider).
 */
function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 pt-4 mt-5 border-t border-line">
      {children}
    </div>
  );
}

/** Section labellisee, espacee, pour les blocs de formulaire. */
function Section({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-faint font-semibold mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

/** "12 mars 2026" : format lisible en francais. */
function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  return `${d} ${MOIS_FR[m - 1].toLowerCase()} ${y}`;
}
