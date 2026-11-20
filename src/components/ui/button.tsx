import { cn } from "@/lib/cn";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle" | "success" | "warning";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-ivory hover:bg-ink-600 shadow-card",
  secondary: "bg-white text-ink border border-line-strong hover:border-taupe-300 hover:bg-sand-50",
  subtle: "bg-sand-100 text-ink hover:bg-sand-200",
  ghost: "text-ink-500 hover:text-ink hover:bg-sand-100",
  danger: "bg-white text-clay-700 border border-clay-200 hover:bg-clay-50",
  success: "bg-sage-600 text-white hover:bg-sage-700 shadow-card",
  warning: "bg-ochre-500 text-white hover:bg-ochre-600 shadow-card",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-14 px-6 text-base gap-2.5",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
    variants[variant], sizes[size], className,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ href, variant = "primary", size = "md", className, children }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return <Link href={href} className={buttonClass(variant, size, className)}>{children}</Link>;
}
