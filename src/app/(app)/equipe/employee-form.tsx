import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ROLE } from "@/lib/labels";
import type { Department, Employee, WorkSchedule } from "@/lib/types";

export function EmployeeFields({ e, departments, schedules, showRole, showPin }: { e?: Employee; departments: Department[]; schedules: WorkSchedule[]; showRole?: boolean; showPin?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Prénom"><Input name="first_name" defaultValue={e?.first_name} required /></Field>
      <Field label="Nom"><Input name="last_name" defaultValue={e?.last_name} /></Field>
      <Field label="Fonction"><Input name="job_title" defaultValue={e?.job_title ?? ""} placeholder="Ex. Graphiste, Chauffeur, Fleuriste…" /></Field>
      <Field label="Département">
        <Select name="department_id" defaultValue={e?.department_id ?? ""}>
          <option value="">— Aucun —</option>
          {departments.filter((d) => d.is_active || d.id === e?.department_id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label="Téléphone"><Input name="phone" type="tel" defaultValue={e?.phone ?? ""} placeholder="06 00 00 00 00" /></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={e?.email ?? ""} /></Field>
      <Field label="Date d'embauche"><Input name="hire_date" type="date" defaultValue={e?.hire_date ?? ""} /></Field>
      <Field label="Horaires de travail">
        <Select name="schedule_id" defaultValue={e?.schedule_id ?? ""}>
          <option value="">Horaire par défaut</option>
          {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="Statut">
        <Select name="status" defaultValue={e?.status ?? "actif"}>
          <option value="actif">Actif</option><option value="suspendu">Suspendu</option><option value="inactif">Inactif (a quitté l&apos;entreprise)</option>
        </Select>
      </Field>
      {showRole && (
        <Field label="Niveau d'accès">
          <Select name="role" defaultValue={e?.role ?? "employee"}>
            {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      )}
      {showPin && <Field label="Code PIN de pointage" hint="4 à 6 chiffres, modifiable ensuite"><Input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" autoComplete="off" /></Field>}
      <Field label="Notes internes" className="md:col-span-2"><Textarea name="notes" defaultValue={e?.notes ?? ""} /></Field>
    </div>
  );
}
