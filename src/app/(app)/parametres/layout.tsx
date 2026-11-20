import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePerm(["settings.manage", "audit.view"]);
  return (
    <>
      <PageHeader eyebrow="Administration" title="Paramètres" subtitle="Organisation, horaires, postes de pointage, permissions et journal des actions. Tout est modifiable sans toucher au code." />
      <SettingsNav isAdmin={s.isAdmin} canSettings={s.can("settings.manage")} canAudit={s.can("audit.view")} />
      {children}
    </>
  );
}
