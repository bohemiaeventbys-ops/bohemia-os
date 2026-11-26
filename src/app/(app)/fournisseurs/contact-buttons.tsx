import { MessageCircle, Phone } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { telLink, waLink, type Supplier } from "@/lib/suppliers";

/** Gros boutons Appeler / WhatsApp, utilisables d'un pouce. */
export function ContactButtons({ s, size = "md" }: { s: Pick<Supplier, "phone" | "whatsapp">; size?: "sm" | "md" | "lg" }) {
  const tel = telLink(s.phone);
  const wa = waLink(s.whatsapp ?? s.phone);
  if (!tel && !wa) return <span className="text-xs text-ink-300">Pas de numéro</span>;
  return (
    <div className="flex gap-2">
      {tel && <a href={tel} className={buttonClass("secondary", size)}><Phone className="h-4 w-4" /> Appeler</a>}
      {wa && <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("success", size)}><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
    </div>
  );
}
