import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diffDays, formatDate, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { PURCHASE_STATUS, type Purchase, type Supplier } from "@/lib/suppliers";
import type { Employee, EventRow } from "@/lib/types";

export const metadata = { title: "Achats" };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.from("purchase_requests").select("*").order("created_at", { ascending: false }).limit(500);
  const all = (data ?? []) as Purchase[];
  const canValidate = s.can("purchases.validate");
  const canBuy = s.can("purchases.manage");
  const canReceive = canBuy || s.can("stock.manage");

  const views = [
    canValidate && { key: "valider", label: "À valider", filter: (p: Purchase) => p.status === "demande" },
    canBuy && { key: "commander", label: "À commander", filter: (p: Purchase) => p.status === "validee" },
    canReceive && { key: "recevoir", label: "À recevoir", filter: (p: Purchase) => p.status === "commandee" },
    { key: "mes", label: "Mes demandes", filter: (p: Purchase) => p.requested_by === s.employee.id && !["recue", "annulee", "refusee"].includes(p.status) },
    { key: "historique", label: "Historique", filter: (p: Purchase) => ["recue", "annulee", "refusee"].includes(p.status) },
  ].filter(Boolean) as { key: string; label: string; filter: (p: Purchase) => boolean }[];
  const firstBusy = views.find((v) => v.key !== "historique" && all.some(v.filter));
  const vue = views.find((v) => v.key === sp.vue) ?? firstBusy ?? views.find((v) => v.key === "mes")!;
  const list = all.filter(vue.filter);

  const evIds = Array.from(new Set(list.map((p) => p.event_id).filter(Boolean))) as string[];
  const [{ data: ev }, { data: emp }, { data: sup }] = await Promise.all([
    evIds.length ? supabase.from("events").select("id, name").in("id", evIds) : Promise.resolve({ data: [] }),
    supabase.from("employees").select("id, first_name, last_name"),
    supabase.from("suppliers").select("id, name"),
  ]);
  const events = new Map(((ev ?? []) as Pick<EventRow, "id" | "name">[]).map((e) => [e.id, e.name]));
  const people = new Map(((emp ?? []) as Employee[]).map((e) => [e.id, e]));
  const suppliers = new Map(((sup ?? []) as Supplier[]).map((x) => [x.id, x.name]));
  const today = todayISO();

  return (
    <>
      <PageHeader title="Achats" subtitle="Matière première, fournitures, matériel : on demande, la Direction valide, l'acheteur commande, le dépôt réceptionne."
        actions={<ButtonLink href="/achats/nouveau" size="lg"><Plus className="h-5 w-5" /> Demander un achat</ButtonLink>} />
      <Tabs active={vue.key} items={views.map((v) => ({ key: v.key, label: v.label, href: `/achats?vue=${v.key}`, count: all.filter(v.filter).length }))} />
      {list.length === 0 ? <Card><Empty icon={<ShoppingCart className="h-8 w-8" />} title="Rien ici pour le moment." /></Card> : (
        <Card>
          <ul className="divide-y divide-line">
            {list.map((p) => {
              const late = p.needed_by && !["recue", "annulee", "refusee"].includes(p.status) ? diffDays(p.needed_by, today) : null;
              return (
                <li key={p.id}>
                  <Link href={`/achats/${p.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-sand-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{p.title}</span>
                      <span className="block text-sm text-ink-500">
                        {fullName(people.get(p.requested_by ?? ""))}
                        {p.event_id && ` · ${events.get(p.event_id) ?? "Événement"}`}
                        {p.supplier_id && ` · chez ${suppliers.get(p.supplier_id)}`}
                      </span>
                    </span>
                    {p.needed_by && <span className={`text-sm tabular-nums ${late !== null && late < 0 ? "font-semibold text-clay-700" : late !== null && late <= 2 ? "font-semibold text-ochre-700" : "text-ink-500"}`}>Pour le {formatDate(p.needed_by)}</span>}
                    <Badge tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
