/**
 * Français / العربية.
 * Traduit les menus, les écrans terrain (chauffeur, dépôt, installation), les boutons et les messages.
 * Les noms de matériel, codes, références, téléphones et noms propres restent tels qu'ils ont été saisis.
 */
export type Lang = "fr" | "ar";
export const isLang = (v: unknown): v is Lang => v === "fr" || v === "ar";
export const dir = (l: Lang) => (l === "ar" ? "rtl" : "ltr");

const FR = {
  // Menus
  "nav.terrain": "Terrain", "nav.semaine": "Cette semaine", "short.semaine": "Semaine", "nav.dashboard": "Tableau de bord", "nav.ma-journee": "Ma journée", "nav.calendrier": "Calendrier",
  "nav.evenements": "Événements", "nav.taches": "Tâches", "nav.mes-taches": "Mes tâches", "nav.equipe": "Équipe", "nav.pointage": "Pointage",
  "nav.mon-pointage": "Mon pointage", "nav.clients": "Clients", "nav.devis": "Devis & factures", "nav.tva": "TVA", "nav.stock": "Dépôt & Stock",
  "nav.achats": "Achats", "nav.fournisseurs": "Fournisseurs", "nav.conges": "Congés & absences", "nav.mes-conges": "Mes congés",
  "nav.notifications": "Notifications", "nav.parametres": "Paramètres", "nav.plus": "Plus",
  "short.dashboard": "Accueil", "short.ma-journee": "Ma journée", "short.calendrier": "Agenda", "short.evenements": "Événements", "short.taches": "Tâches",
  "short.stock": "Stock", "short.terrain": "Terrain", "short.conges": "Congés", "short.pointage": "Pointage", "short.equipe": "Équipe",
  "top.search": "Rechercher…", "top.logout": "Sortir", "lang.label": "Langue",

  // Terrain : onglets
  "t.title": "Terrain", "t.subtitle": "Vos missions du jour, en grand et en simple.",
  "t.tab.chauffeur": "Chauffeur", "t.tab.depot": "Dépôt", "t.tab.installation": "Installation",
  "t.none": "Rien de prévu pour le moment.", "t.next": "Prochaine mission", "t.later": "Ensuite",
  "t.today": "Aujourd'hui", "t.tomorrow": "Demain",
  // Horaires
  "t.load": "Chargement", "t.delivery": "Livraison", "t.setup": "Arrivée / installation", "t.start": "Début", "t.teardown": "Démontage",
  "t.address": "Adresse", "t.contact": "Contact sur place", "t.access": "Consignes d'accès", "t.noAddress": "Adresse non indiquée",
  // Chauffeur
  "t.route": "Ouvrir l'itinéraire", "t.call": "Appeler", "t.deliver": "Confirmer la livraison", "t.delivered": "Livré",
  "t.undo": "Annuler", "t.scanBL": "Scanner le BL", "t.invoiceHanded": "Facture remise", "t.invoiceNotHanded": "Facture pas encore remise",
  "t.blSaved": "BL enregistré", "t.blCount": "BL enregistré(s)",
  // Dépôt
  "t.toPrepare": "À préparer aujourd'hui et demain", "t.searchItem": "Chercher par nom ou code", "t.code": "Code", "t.place": "Emplacement",
  "t.qty": "Quantité", "t.finish": "Finition demandée", "t.markLoaded": "Marquer comme chargé", "t.loaded": "Chargé", "t.reserved": "À préparer",
  "t.prepared": "Prêt au quai", "t.returned": "Revenu", "t.reportMissing": "Signaler un manque", "t.reportDamaged": "Signaler un article abîmé",
  "t.howMany": "Combien manque-t-il ?", "t.missingSaved": "Manque signalé", "t.damagedSaved": "Article abîmé signalé",
  "t.noItems": "Aucun matériel prévu pour cet événement.", "t.allLoaded": "Tout est chargé",
  // Installation
  "t.visual": "Visuel validé par le client", "t.noVisual": "Pas encore de visuel validé.", "t.reportProblem": "Signaler un problème",
  "t.addPhoto": "Ajouter une photo de l'installation", "t.problemSaved": "Problème signalé", "t.photoSaved": "Photo enregistrée", "t.photos": "Photos de l'installation",
  // Envoi de photos
  "p.take": "Prendre la photo", "p.retake": "Reprendre", "p.send": "Envoyer", "p.sending": "Envoi en cours…", "p.pending": "Photo en attente d'envoi",
  "p.pendingN": "photo(s) en attente d'envoi : elles partiront dès que le réseau revient", "p.retry": "Réessayer maintenant", "p.note": "Commentaire (facultatif)",
  "p.cancel": "Annuler", "p.error": "Envoi impossible pour l'instant", "p.saved": "Enregistré",
  "p.denied": "Action non autorisée pour votre profil", "p.photoRequired": "Prenez d'abord la photo", "p.preparing": "Préparation…",
  "t.missingN": "Il manque", "t.of": "sur", "t.event": "Événement", "t.done": "Fait", "t.seeAll": "Tout voir", "t.sheet": "Voir la fiche de l'événement",
  "login.title": "Connexion", "login.subtitle": "Accédez à votre espace de travail.", "login.email": "Email", "login.password": "Mot de passe",
  "login.submit": "Se connecter", "login.kiosk": "Le pointage se fait uniquement sur le poste kiosque de l'entreprise.",
  "c.save": "Enregistrer", "c.missing": "Il manque", "c.close": "Fermer",
} as const;

export type Key = keyof typeof FR;

const AR: Record<Key, string> = {
  "nav.terrain": "الميدان", "nav.semaine": "هاد السيمانة", "short.semaine": "السيمانة", "nav.dashboard": "لوحة القيادة", "nav.ma-journee": "يومي", "nav.calendrier": "المواعيد",
  "nav.evenements": "الحفلات", "nav.taches": "المهام", "nav.mes-taches": "مهامي", "nav.equipe": "الفريق", "nav.pointage": "الحضور",
  "nav.mon-pointage": "حضوري", "nav.clients": "الزبناء", "nav.devis": "العروض والفواتير", "nav.tva": "الضريبة TVA", "nav.stock": "المخزن",
  "nav.achats": "المشتريات", "nav.fournisseurs": "المزودون", "nav.conges": "العطل والغياب", "nav.mes-conges": "عطلي",
  "nav.notifications": "التنبيهات", "nav.parametres": "الإعدادات", "nav.plus": "المزيد",
  "short.dashboard": "الرئيسية", "short.ma-journee": "يومي", "short.calendrier": "المواعيد", "short.evenements": "الحفلات", "short.taches": "المهام",
  "short.stock": "المخزن", "short.terrain": "الميدان", "short.conges": "العطل", "short.pointage": "الحضور", "short.equipe": "الفريق",
  "top.search": "بحث…", "top.logout": "خروج", "lang.label": "اللغة",

  "t.title": "الميدان", "t.subtitle": "مهامك ديال اليوم، بشكل واضح وبسيط.",
  "t.tab.chauffeur": "السائق", "t.tab.depot": "المخزن", "t.tab.installation": "التركيب",
  "t.none": "ما كاين والو دابا.", "t.next": "المهمة الجاية", "t.later": "من بعد",
  "t.today": "اليوم", "t.tomorrow": "غدا",
  "t.load": "التحميل", "t.delivery": "التسليم", "t.setup": "الوصول / التركيب", "t.start": "البداية", "t.teardown": "التفكيك",
  "t.address": "العنوان", "t.contact": "المسؤول في المكان", "t.access": "تعليمات الدخول", "t.noAddress": "العنوان ما مكتوبش",
  "t.route": "فتح الطريق", "t.call": "اتصل", "t.deliver": "تأكيد التسليم", "t.delivered": "تم التسليم",
  "t.undo": "إلغاء", "t.scanBL": "تصوير وصل التسليم", "t.invoiceHanded": "الفاتورة تسلمات", "t.invoiceNotHanded": "الفاتورة ما تسلماتش باقي",
  "t.blSaved": "وصل التسليم تسجل", "t.blCount": "وصل التسليم المسجل",
  "t.toPrepare": "للتحضير اليوم وغدا", "t.searchItem": "قلب بالسمية ولا الكود", "t.code": "الكود", "t.place": "البلاصة",
  "t.qty": "الكمية", "t.finish": "اللون / الفينيسيون المطلوب", "t.markLoaded": "تم التحميل", "t.loaded": "تم التحميل", "t.reserved": "للتحضير",
  "t.prepared": "واجد", "t.returned": "رجع", "t.reportMissing": "خاص شي حاجة", "t.reportDamaged": "حاجة مخسرة",
  "t.howMany": "شحال ناقص؟", "t.missingSaved": "النقص تسجل", "t.damagedSaved": "الحاجة المخسرة تسجلات",
  "t.noItems": "ما كاين حتى معدات لهاد الحفلة.", "t.allLoaded": "كلشي تحمل",
  "t.visual": "التصميم اللي وافق عليه الزبون", "t.noVisual": "باقي ما كاين تصميم موافق عليه.", "t.reportProblem": "بلغ على مشكل",
  "t.addPhoto": "زيد صورة ديال التركيب", "t.problemSaved": "المشكل تسجل", "t.photoSaved": "الصورة تسجلات", "t.photos": "صور التركيب",
  "p.take": "صور", "p.retake": "عاود الصورة", "p.send": "صيفط", "p.sending": "كيتصيفط…", "p.pending": "الصورة كتسنى الإرسال",
  "p.pendingN": "صورة كتسنى الإرسال: غادي تمشي ملي يرجع الريزو", "p.retry": "عاود دابا", "p.note": "ملاحظة (اختياري)",
  "p.cancel": "إلغاء", "p.error": "ما قدرناش نصيفطو دابا", "p.saved": "تسجل",
  "p.denied": "ما عندكش الحق فهاد العملية", "p.photoRequired": "صور الأول", "p.preparing": "كنوجدو…",
  "t.missingN": "ناقص", "t.of": "من", "t.event": "الحفلة", "t.done": "تم", "t.seeAll": "شوف كلشي", "t.sheet": "شوف ورقة الحفلة",
  "login.title": "الدخول", "login.subtitle": "دخل لفضاء الخدمة ديالك.", "login.email": "البريد الإلكتروني (Email)", "login.password": "كلمة السر",
  "login.submit": "دخول", "login.kiosk": "تسجيل الحضور كيتدار غير فالحاسوب ديال الشركة.",
  "c.save": "سجل", "c.missing": "ناقص", "c.close": "سد",
};

export const hasKey = (k: string): k is Key => k in FR;

export function t(lang: Lang, key: Key): string {
  return lang === "ar" ? AR[key] : FR[key];
}
export const dict = (lang: Lang) => (key: Key) => t(lang, key);
