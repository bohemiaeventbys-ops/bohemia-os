/** Textes de la fiche technique imprimée : français, arabe, ou les deux. */
export type FicheLang = "fr" | "ar" | "bi";
export const isFicheLang = (v: unknown): v is FicheLang => v === "fr" || v === "ar" || v === "bi";

export const FICHE = {
  team: ["Fiche technique équipe", "البطاقة التقنية للفريق"],
  direction: ["Fiche technique Direction · confidentiel", "البطاقة التقنية للإدارة · سري"],
  guests: ["Personnes", "عدد الأشخاص"],
  place: ["Lieu", "المكان"],
  contact: ["Contact sur place", "جهة الاتصال فالبلاصة"],
  lead: ["Responsable", "المسؤول"],
  client: ["Client", "الزبون"],
  load: ["Chargement", "التحميل"],
  delivery: ["Livraison", "التوصيل"],
  setup: ["Installation", "التركيب"],
  start: ["Début", "البداية"],
  teardown: ["Démontage", "التفكيك"],
  access: ["Accès", "الدخول"],
  design: ["Design de l'événement", "تصميم الحفل"],
  approved: ["✓ Validé par l'infographiste et approuvé par la cliente", "✓ مصادق عليه من المصمم والزبونة"],
  clientOnly: ["✓ Approuvé par la cliente", "✓ مصادق عليه من الزبونة"],
  waiting: ["⏳ En attente de validation", "⏳ في انتظار المصادقة"],
  openPdf: ["Ouvrir le PDF du design", "فتح ملف التصميم"],
  inspirations: ["Photos d'inspiration", "صور للإلهام"],
  furniture: ["Mobilier et matériel à prendre", "الأثاث والمعدات اللي خاصنا ناخدو"],
  items: ["article(s)", "صنف"],
  pieces: ["pièces", "قطعة"],
  noItems: ["Aucun article sélectionné.", "ما كاين حتى شي صنف."],
  color: ["Couleur", "اللون"],
  finish: ["Finition", "التشطيب"],
  vinyl: ["Vinyle", "الفينيل"],
  zone: ["Zone", "البلاصة"],
  missing: ["Manquant", "ناقص"],
  stockState: ["État du stock", "حالة المخزون"],
  ref: ["Référence", "مرجع"],
  materials: ["Matériaux", "المواد"],
  suppliers: ["Prestataires", "مقدمو الخدمات"],
  team2: ["Équipe affectée", "الفريق المكلف"],
  noTeam: ["Personne n'est encore affecté.", "حتى واحد ما تكلف باقي."],
  extra: ["renfort", "مساعد خارجي"],
  notes: ["Notes", "ملاحظات"],
  sPrep: ["Préparé par (dépôt)", "وجدو (المخزن)"],
  sDeliv: ["Livré / installé par", "وصلو / ركبو"],
  sCheck: ["Vérifié par (responsable)", "راجعو (المسؤول)"],
  name: ["Nom", "الاسم"],
  date: ["Date", "التاريخ"],
  sign: ["Signature", "التوقيع"],
  todo: ["À renseigner", "خاصو يتعمر"],
  tbd: ["À préciser", "خاصو يتحدد"],
} as const;
export type FicheKey = keyof typeof FICHE;

export const TYPE_AR: Record<string, string> = {
  mariage: "عرس", anniversaire: "عيد ميلاد", baby_shower: "حفل المولود", bapteme: "عقيقة", corporate: "شركة", ramadan: "رمضان", stand: "رواق", ohmybox: "OHMYBOX", autre: "آخر",
};

export function dayLong(iso: string, l: "fr" | "ar") {
  const d = new Date(`${iso}T12:00:00Z`);
  const s = new Intl.DateTimeFormat(l === "ar" ? "ar-MA" : "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC", numberingSystem: "latn" }).format(d);
  return l === "fr" ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
