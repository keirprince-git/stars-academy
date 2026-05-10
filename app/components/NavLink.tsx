"use client";
import { usePathname } from "next/navigation";

export default function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname() ?? "";
  const isCurrent = pathname === href || pathname.startsWith(href + "/");
  return (
    <a href={href} className={isCurrent ? "current" : undefined}>{label}</a>
  );
}
