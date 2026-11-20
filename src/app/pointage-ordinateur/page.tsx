export const metadata = { title: "Pointage" };

export default function PointageOrdinateur() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory p-8 text-center">
      <div className="max-w-sm">
        <p className="font-display text-3xl text-ink">Pointage indisponible</p>
        <p className="mt-3 text-sm text-ink-500">Le pointage se fait uniquement sur le poste kiosque installé dans les locaux de Bohemia Events.</p>
      </div>
    </div>
  );
}
