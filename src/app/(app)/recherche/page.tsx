import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Empty } from "@/components/ui/empty";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Recherche" };

const KIND: Record<string, string> = { employe: "Employés", tache: "Tâches", evenement: "Événements", departement: "Départements" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  await requireSession();
  const term = q.trim();
  const supabase = await createClient();
  const { data } = term.length >= 2 ? await supabase.rpc("global_search", { q: term }) : { data: [] };
  const rows = (data ?? []) as { kind: string; id: string; title: string; subtitle: string; link: string }[];
  const groups = Object.keys(KIND).map((k) => ({ k, items: rows.filter((r) => r.kind === k) })).filter((g) => g.items.length);
  return (
    <>
      <PageHeader eyebrow="Recherche globale" title={term ? `« ${term} »` : "Recherche"} subtitle={term.length < 2 ? "Saisissez au moins 2 caractères dans la barre de recherche." : `${rows.length} résultat(s)`} />
      {term.length >= 2 && groups.length === 0 && <Card><Empty title="Aucun résultat." /></Card>}
      <div className="space-y-6">
        {groups.map((g) => (
          <Card key={g.k}>
            <p className="border-b border-line px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-400">{KIND[g.k]}</p>
            <ul className="divide-y divide-line">
              {g.items.map((r) => (
                <li key={r.kind + r.id}><Link href={r.link} className="block px-5 py-3 hover:bg-sand-50"><p className="text-sm font-medium">{r.title}</p>{r.subtitle && <p className="text-xs text-ink-400">{r.subtitle}</p>}</Link></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-ink-300">Clients, fournisseurs, matériel, achats et documents rejoindront la recherche avec leurs modules.</p>
    </>
  );
}
