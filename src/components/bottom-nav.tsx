"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Globe, Heart, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Nearby", icon: MapPin },
  { href: "/online", label: "Online", icon: Globe },
  { href: "/saved", label: "Saved", icon: Heart },
  { href: "/resources", label: "Resources", icon: BookOpen },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-4 border-black bg-[#120018]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-6xl grid-cols-4">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/meetings")
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-semibold uppercase tracking-wide",
                  active ? "bg-hot text-black" : "text-warn",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
