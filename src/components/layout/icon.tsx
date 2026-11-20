import {
  LayoutDashboard, Sun, CalendarDays, Sparkles, ListChecks, Users, Clock, Bell, Settings, Contact, Palette, Factory,
  Warehouse, ShoppingBag, Store, Truck, Plane, Award, BarChart3, type LucideProps,
} from "lucide-react";

const map = {
  layout: LayoutDashboard, sun: Sun, calendar: CalendarDays, sparkles: Sparkles, check: ListChecks, users: Users, clock: Clock,
  bell: Bell, settings: Settings, contact: Contact, palette: Palette, factory: Factory, warehouse: Warehouse, shopping: ShoppingBag,
  store: Store, truck: Truck, plane: Plane, award: Award, chart: BarChart3,
} as const;

export function NavIcon({ name, ...props }: { name: string } & LucideProps) {
  const C = map[name as keyof typeof map] ?? LayoutDashboard;
  return <C strokeWidth={1.8} {...props} />;
}
