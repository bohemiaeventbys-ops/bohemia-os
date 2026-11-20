import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export function Avatar({ person, url, size = 32, className }: { person: { first_name: string; last_name?: string | null }; url?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.36) };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className={cn("shrink-0 rounded-full object-cover ring-1 ring-line", className)} />;
  }
  return (
    <span style={style} className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-nude-100 font-medium text-taupe-700 ring-1 ring-nude-200", className)}>
      {initials(person)}
    </span>
  );
}
