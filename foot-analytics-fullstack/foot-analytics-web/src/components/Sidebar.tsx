// src/components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Trophy, Shield, Users, ClipboardList, Dumbbell,
  Search, Layout, Calendar, HeartPulse, Award,
  FileText, Upload, ChevronRight,
} from "lucide-react";
import { useOwnClubId } from "@/lib/own-club-context";
import { OwnEquipeSwitcher } from "@/components/OwnEquipeSwitcher";
import { UserBadge } from "@/components/UserBadge";

export function Sidebar() {
  const path = usePathname();
  const ownClubId = useOwnClubId();

  const NAV: { section: string; items: { href: string; label: string; icon: any }[] }[] = [
    {
      section: "Vue d'ensemble",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/classement", label: "Classement", icon: Trophy },
        { href: "/calendrier", label: "Calendrier", icon: Calendar },
      ],
    },
    {
      section: "Mon equipe",
      items: [
        { href: `/club/${ownClubId}`, label: "Mon club", icon: Shield },
        { href: "/effectif", label: "Effectif", icon: Users },
        { href: "/entrainements", label: "Entrainements", icon: Dumbbell },
        { href: "/medical", label: "Medical & charge", icon: HeartPulse },
      ],
    },
    {
      section: "Match",
      items: [
        { href: "/matchs", label: "Matchs", icon: ClipboardList },
        { href: "/tactique", label: "Tactique", icon: Layout },
        { href: "/arbitres", label: "Arbitres", icon: Award },
      ],
    },
    {
      section: "Analyse",
      items: [
        { href: "/scouting", label: "Scouting", icon: Search },
        { href: "/rapports", label: "Rapports", icon: FileText },
      ],
    },
    {
      section: "Donnees",
      items: [
        { href: "/import", label: "Import feuilles FMI", icon: Upload },
      ],
    },
  ];

  return (
    <aside className="relative z-10 w-[244px] shrink-0 border-r border-line bg-panel/60 backdrop-blur-md">
      <div className="sticky top-0 h-screen overflow-y-auto flex flex-col">
        <div className="px-4 pt-5 pb-4 border-b border-line">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-turf grid place-items-center text-base font-display font-black text-[15px]"
                 style={{ color: "rgb(var(--bg))" }}>
              FA
            </div>
            <div className="leading-tight">
              <div className="font-display font-bold text-ink group-hover:text-turf transition-colors">
                Foot Analytics
              </div>
              <div className="text-[9px] uppercase tracking-[0.22em] text-faint font-semibold">
                Console staff
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-5">
          {NAV.map((g) => (
            <div key={g.section}>
              <div className="px-3 pb-1.5 h-section">{g.section}</div>
              <ul className="space-y-0.5">
                {g.items.map((it) => {
                  const Icon = it.icon;
                  const active =
                    path === it.href || (it.href !== "/" && path.startsWith(it.href));
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all
                          ${active
                            ? "bg-turf/[0.12] text-turf font-semibold"
                            : "text-muted hover:text-ink hover:bg-line/40"}`}
                      >
                        <Icon size={15} strokeWidth={active ? 2.5 : 1.8} />
                        <span className="flex-1">{it.label}</span>
                        {active && <ChevronRight size={12} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer : switcher + user. Reglages = icone settings de la TopBar. */}
        <div className="border-t border-line">
          <div className="p-3">
            <OwnEquipeSwitcher />
          </div>
          <UserBadge />
        </div>
      </div>
    </aside>
  );
}
