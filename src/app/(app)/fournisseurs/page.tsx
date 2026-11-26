import Link from "next/link";
import { Plus, Search, Star, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUPPLIER_KIND, type Supplier } from "@/lib/suppliers";
import { ContactButtons } from "./contact-buttons";

export const metadata = { title: "Fournisseurs & prestataires" };

type SP = { type?: string; cat?: string; q?: string; archives?: string };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").order("name");
  const all = ((data ?? []) as Supplier[]).filter((x) => (sp.archives ? !x.is_active : x.is_active));
  const type = sp.type && sp.type in SUPPLIER_KIND ? sp.type : "tous";
  const q = (sp.q ?? "").trim().toLowerCase();
  const list = all.filter((x) => (type === "tous" || x.kind === type) && (!sp.cat || x.categories.includes(sp.cat))
    && (!q || [x.name, x.contact_name, x.notes, ...x.categories].some((v) => (v ?? "").toLowerCase().includes(q))));
  const cats = Array.from(new Set(all.flatMap((x) => x.categories))).sort((a, b) => a.localeCompare(b, "fr"));
  const link = (p: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ type: type === "tous" ? undefined : type, cat: sp.cat, q: sp.q, archives: sp.archives, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/fournisseurs${u.size ? `?${u}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Fournisseurs & prestataires" subtitle="Qui appeler pour la moquette, l'animation, l'impression, le bois…"
        actions={s.can("suppliers.manage") && <ButtonLink href="/fournisseurs/nouveau" size="lg"><Plus className="h-5 w-5" /> Ajouter</ButtonLink>} />
      <Tabs active={type} items={[
        { key: "tous", label: "Tous", href: link({ type: undefined }), count: all.length },
        ...Object.entries(SUPPLIER_KIND).map(([k, v]) => ({ key: k, label: v.plural, href: link({ type: k }), count: all.filter((x) => x.kind === k).length })),
      ]} />
      <form className="relative mb-4 max-w-xl">
        {type !== "tous" && <input type="hidden" name="type" value={type} />}
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input name="q" defaultValue={sp.q} placeholder="Chercher : moquette, Mouna, vinyle…" className="field h-12 pl-12 text-base" />
      </form>
      {cats.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href={link({ cat: undefined })} className={`rounded-full px-3.5 py-1.5 text-sm ring-1 ${!sp.cat ? "bg-ink text-ivory ring-ink" : "bg-white ring-line"}`}>Tout</Link>
          {cats.map((c) => <Link key={c} href={link({ cat: c })} className={`rounded-full px-3.5 py-1.5 text-sm ring-1 ${sp.cat === c ? "bg-ink text-ivory ring-ink" : "bg-white ring-line"}`}>{c}</Link>)}
        </div>
      )}
      {list.length === 0 ? <Card><Empty icon={<Users className="h-8 w-8" />} title="Personne ne correspond.">Essayez un autre mot ou retirez le filtre.</Empty></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((x) => (
            <Card key={x.id} className="flex flex-col p-5">
              <Link href={`/fournisseurs/${x.id}`} className="block flex-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge tone={SUPPLIER_KIND[x.kind].tone}>{SUPPLIER_KIND[x.kind].label}</Badge>
                  {x.rating && <span className="flex items-center gap-0.5 text-sm font-semibold text-ochre-600"><Star className="h-4 w-4 fill-current" />{x.rating}</span>}
                </div>
                <p className="text-lg font-semibold leading-snug">{x.name}</p>
                {x.contact_name && <p className="text-sm text-ink-500">{x.contact_name}</p>}
                <p className="mt-1 text-sm text-ink-400">{x.categories.join(" · ") || "—"}</p>
              </Link>
              <div className="mt-4"><ContactButtons s={x} /></div>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm"><Link className="link" href={sp.archives ? "/fournisseurs" : "/fournisseurs?archives=1"}>{sp.archives ? "← Retour aux actifs" : "Voir les archivés"}</Link></p>
    </>
  );
}
