import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePerm } from "@/lib/auth";
import { SupplierForm } from "../supplier-form";

export const metadata = { title: "Nouveau fournisseur" };

export default async function NewSupplier() {
  await requirePerm("suppliers.manage");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href="/fournisseurs" className="hover:underline">Fournisseurs</Link>} title="Ajouter un contact" />
      <Card><CardBody className="py-6"><SupplierForm /></CardBody></Card>
    </div>
  );
}
