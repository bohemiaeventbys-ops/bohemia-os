import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePerm } from "@/lib/auth";
import { ClientForm } from "../client-form";

export const metadata = { title: "Nouveau client" };

export default async function NewClient({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const sp = await searchParams;
  await requirePerm(["clients.manage", "events.manage"]);
  const back = sp.retour?.startsWith("/") ? sp.retour : undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href="/clients" className="hover:underline">Clients</Link>} title="Nouveau client" />
      <Card><CardBody className="py-6"><ClientForm back={back} /></CardBody></Card>
    </div>
  );
}
