import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Supplier } from "@/lib/suppliers";
import { SupplierForm } from "../../supplier-form";

export const metadata = { title: "Modifier le fournisseur" };

export default async function EditSupplier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("suppliers.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle<Supplier>();
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href={`/fournisseurs/${id}`} className="hover:underline">{data.name}</Link>} title="Modifier" />
      <Card><CardBody className="py-6"><SupplierForm s={data} /></CardBody></Card>
    </div>
  );
}
