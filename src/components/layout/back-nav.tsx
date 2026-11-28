"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const KEY = "bo-nav";
const read = (): string[] => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const write = (v: string[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(v.slice(-40))); } catch { /* navigation privée */ } };
const isForm = (u: string) => /\/(modifier|nouveau|nouvelle)(\/|\?|$)/.test(u);
const pathOf = (u: string) => u.split("?")[0];

/**
 * « ← Retour » sur chaque écran de détail.
 * Ramène à l'écran d'où l'on vient (liste, calendrier, « Cette semaine »…) avec ses filtres,
 * en sautant les formulaires et les sous-pages de l'écran actuel. Sinon : l'écran parent.
 */
export function BackNav({ label }: { label: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const here = pathname + (search.toString() ? `?${search}` : "");

  useEffect(() => {
    const s = read();
    if (s[s.length - 1] !== here) write([...s, here]);
  }, [here]);

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  function back() {
    const s = read();
    const cur = pathOf(here);
    for (let i = s.length - 1; i >= 0; i--) {
      const u = s[i], p = pathOf(u);
      if (p === cur || isForm(u) || p.startsWith(cur + "/")) continue;
      write(s.slice(0, i + 1));
      router.push(u);
      return;
    }
    router.push("/" + parts.slice(0, -1).join("/"));
  }

  return (
    <button type="button" onClick={back} className="mb-4 inline-flex h-11 items-center gap-2 rounded-xl bg-paper px-4 text-[15px] font-bold text-ink ring-1 ring-line-strong transition hover:bg-sand-100 active:scale-[0.98] print:hidden">
      <ArrowLeft className="h-5 w-5 rtl:rotate-180" /> {label}
    </button>
  );
}
