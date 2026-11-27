"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import type { Lang } from "@/lib/i18n";
import { setLang } from "@/app/langue/actions";

/** Bouton Français | العربية. Ne recharge pas la page : l'écran et ce qui est déjà saisi restent en place. */
export function LangSwitch({ lang, compact }: { lang: Lang; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (l: Lang) => {
    if (l === lang || pending) return;
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    start(async () => { await setLang(l); router.refresh(); });
  };
  const btn = (l: Lang, label: string) => (
    <button type="button" onClick={() => pick(l)} aria-pressed={lang === l} lang={l}
      className={cn("rounded-lg font-semibold transition", compact ? "px-2.5 py-1.5 text-[13px]" : "px-4 py-2 text-sm",
        lang === l ? "bg-ink text-ivory" : "text-ink-500 hover:bg-sand-100")}>
      {label}
    </button>
  );
  return (
    <div dir="ltr" className={cn("inline-flex items-center gap-0.5 rounded-xl bg-white p-1 ring-1 ring-line", pending && "opacity-60")}>
      {btn("fr", compact ? "FR" : "Français")}
      {btn("ar", "العربية")}
    </div>
  );
}
