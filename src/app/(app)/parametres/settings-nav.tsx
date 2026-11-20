"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function SettingsNav({ isAdmin, canSettings, canAudit }: { isAdmin: boolean; canSettings: boolean; canAudit: boolean }) {
  const p = usePathname();
  const items = [
    canSettings && { href: "/parametres", label: "Entreprise" },
    canSettings && { href: "/parametres/departements", label: "Départements" },
    canSettings && { href: "/parametres/horaires", label: "Horaires" },
    canSettings && { href: "/parametres/kiosques", label: "Postes de pointage" },
    isAdmin && { href: "/parametres/roles", label: "Rôles & permissions" },
    canAudit && { href: "/parametres/journal", label: "Journal des actions" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1 w-fit">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={cn("rounded-lg px-3.5 py-1.5 text-sm transition", p === i.href ? "bg-ink text-ivory" : "text-ink-500 hover:bg-sand-100")}>{i.label}</Link>
      ))}
    </div>
  );
}
