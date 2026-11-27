import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUPPLIER_KIND, type Supplier } from "@/lib/suppliers";

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
  const fin = s.can("finance.view");
  const [{ data: ex }, { data: bk }] = fin
    ? await Promise.all([
        supabase.from("expenses").select("supplier_id, amount_mad, paid_mad").not("supplier_id", "is", null),
        supabase.from("supplier_bank").select("supplier_id, bank_name, payment_mode"),
      ])
    : [{ data: [] }, { data: [] }];
  const money = new Map<string, { total: number; rest: number }>();
  for (const e of (ex ?? []) as { supplier_id: string; amount_mad: number; paid_mad: number }[]) {
    const m = money.get(e.supplier_id) ?? { total: 0, rest: 0 };
    m.total += Number(e.amount_mad); m.rest += Math.max(0, Number(e.amount_mad) - Number(e.paid_mad));
    money.set(e.supplier_id, m);
  }
  const PAY: Record<string, string> = { virement: "Virement", especes: "Espèces", cheque: "Chèque", mixte: "Virement ou espèces" };
  const banks = new Map(((bk ?? []) as { supplier_id: string; bank_name: string | null; payment_mode: string }[]).map((b) => [b.supplier_id, b]));
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
      <DataTable exportName="fournisseurs" empty="Personne ne correspond. Essayez un autre mot ou retirez le filtre."
        columns={[
          { key: "name", label: "Nom", filter: "text" },
          { key: "kind", label: "Type", type: "badge", filter: "select" },
          { key: "cats", label: "Catégories", filter: "select" },
          { key: "contact", label: "Contact", filter: "text" },
          { key: "phone", label: "Téléphone" },
          ...(fin ? [
            { key: "bank", label: "Banque", filter: "select" as const },
            { key: "pay", label: "Paiement", filter: "select" as const },
            { key: "total", label: "Total facturé", type: "money" as const, sum: true },
            { key: "rest", label: "Reste à payer", type: "money" as const, sum: true },
          ] : []),
        ]}
        rows={list.map((x) => ({
          id: x.id, href: `/fournisseurs/${x.id}`, view: `/fournisseurs/${x.id}`,
          cells: {
            name: x.name, kind: SUPPLIER_KIND[x.kind].label, cats: x.categories.join(" · "), contact: x.contact_name, phone: x.phone,
            bank: banks.get(x.id)?.bank_name, pay: banks.get(x.id) ? PAY[banks.get(x.id)!.payment_mode] : null,
            total: money.get(x.id)?.total ?? 0, rest: money.get(x.id)?.rest ?? 0,
          },
          tones: { kind: SUPPLIER_KIND[x.kind].tone },
        }))} />
      <p className="mt-6 text-sm"><Link className="link" href={sp.archives ? "/fournisseurs" : "/fournisseurs?archives=1"}>{sp.archives ? "← Retour aux actifs" : "Voir les archivés"}</Link></p>
    </>
  );
}
