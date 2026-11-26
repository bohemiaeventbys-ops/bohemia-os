import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StockCategory } from "@/lib/stock";
import { ItemForm } from "../item-form";
import { createItem } from "../actions";

export const metadata = { title: "Nouvel article" };

export default async function NewItem({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  if (!s.can("stock.manage")) redirect("/stock");
  const supabase = await createClient();
  const [{ data: cats }, { data: t }] = await Promise.all([
    supabase.from("stock_categories").select("*").order("sort_order"),
    supabase.from("stock_items").select("themes").limit(2000),
  ]);
  const known = Array.from(new Set((t ?? []).flatMap((r) => r.themes as string[])));
  return (
    <>
      <PageHeader eyebrow={<Link href="/stock" className="hover:underline">Dépôt & Stock</Link>} title="Ajouter un article" subtitle="Une photo, un nom, une quantité : c'est tout ce qu'il faut." />
      <Card className="max-w-4xl"><CardBody className="py-6"><ItemForm action={createItem} cats={(cats ?? []) as StockCategory[]} knownThemes={known} defaultCat={sp.cat} /></CardBody></Card>
    </>
  );
}
