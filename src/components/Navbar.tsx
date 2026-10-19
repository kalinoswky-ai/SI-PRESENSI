"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, ShieldCheck } from "lucide-react";

interface NavLink {
  href: string;
  label: string;
}

export default function Navbar({ links, title }: { links: NavLink[]; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <ShieldCheck className="text-brand-600" size={22} />
          <span className="text-sm sm:text-base">{title}</span>
        </div>

        <nav className="hidden gap-1 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                pathname === link.href
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Keluar</span>
        </button>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 sm:hidden">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              pathname === link.href ? "bg-brand-50 text-brand-700" : "text-slate-600"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
