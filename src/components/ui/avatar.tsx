import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

// Chaque personne garde toujours la même couleur douce : on la reconnaît d'un coup d'œil.
const palette = [
  "bg-rose-100 text-rose-700 ring-rose-200", "bg-mist-100 text-mist-700 ring-mist-200", "bg-ochre-100 text-ochre-700 ring-ochre-200",
  "bg-sage-100 text-sage-700 ring-sage-200", "bg-plum-100 text-plum-700 ring-plum-200", "bg-clay-100 text-clay-700 ring-clay-200",
  "bg-teal-100 text-teal-700 ring-teal-200",
];
function colorFor(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function Avatar({ person, url, size = 32, className }: { person: { first_name: string; last_name?: string | null }; url?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.36) };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className={cn("shrink-0 rounded-full object-cover ring-1 ring-line", className)} />;
  }
  return (
    <span style={style} className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1", colorFor(`${person.first_name} ${person.last_name ?? ""}`), className)}>
      {initials(person)}
    </span>
  );
}
