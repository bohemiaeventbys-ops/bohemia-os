import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/auth";
import { UPCOMING } from "@/lib/navigation";

export default async function UpcomingModule({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireSession();
  const m = UPCOMING[slug];
  if (!m) notFound();
  return (
    <>
      <PageHeader eyebrow={`Phase ${m.phase}`} title={m.label} subtitle={m.summary} />
      <Card className="max-w-2xl">
        <CardBody className="py-6">
          <p className="mb-4 text-sm text-ink-500">Ce module n&apos;est pas encore actif. Il sera construit en phase {m.phase} sur la même base de données, et reprendra automatiquement les employés, événements et tâches déjà saisis.</p>
          <ul className="space-y-2">
            {m.features.map((f) => <li key={f} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 text-sage-500" />{f}</li>)}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
