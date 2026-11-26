import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { STOCK_BUCKET, type StockCategory, type StockItem } from "@/lib/stock";
import { ItemForm } from "../../item-form";
import { updateItem } from "../../actions";

export const metadata = { title: "Modifier l'article" };

export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  if (!s.can("stock.manage")) redirect(`/stock/${id}`);
  const supabase = await createClient();
  const [{ data: item }, { data: cats }, { data: t }] = await Promise.all([
    supabase.from("stock_items").select("*").eq("id", id).maybeSingle<StockItem>(),
    supabase.from("stock_categories").select("*").order("sort_order"),
    supabase.from("stock_items").select("themes").limit(2000),
  ]);
  if (!item) notFound();
  const urls = await signedUrls(supabase, STOCK_BUCKET, [item.photo_path]);
  const known = Array.from(new Set((t ?? []).flatMap((r) => r.themes as string[])));
  return (
    <>
      <PageHeader eyebrow={<Link href={`/stock/${id}`} className="hover:underline">{item.name}</Link>} title="Modifier l'article"
        subtitle="Les quantités se changent depuis la fiche (entrée, réparation, retour) pour garder l'historique." />
      <Card className="max-w-4xl"><CardBody className="py-6">
        <ItemForm action={updateItem} item={item} cats={(cats ?? []) as StockCategory[]} knownThemes={known} photoUrl={item.photo_path ? urls.get(item.photo_path) : null} />
      </CardBody></Card>
    </>
  );
}
