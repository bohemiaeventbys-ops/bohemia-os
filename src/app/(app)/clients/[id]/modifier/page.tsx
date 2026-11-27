import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/clients";
import { ClientForm } from "../../client-form";

export const metadata = { title: "Modifier le client" };

export default async function EditClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm(["clients.manage", "events.manage"]);
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle<Client>();
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href={`/clients/${id}`} className="hover:underline">{data.name}</Link>} title="Modifier" />
      <Card><CardBody className="py-6"><ClientForm c={data} /></CardBody></Card>
    </div>
  );
}
