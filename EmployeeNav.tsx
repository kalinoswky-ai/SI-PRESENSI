"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, Home, CalendarDays, Briefcase, Timer, ScanFace, KeyRound, BarChart3 } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Beranda", sublabel: "Home / Time Clock", icon: Home },
  { href: "/dashboard/history", label: "Riwayat", sublabel: "Timesheets", icon: CalendarDays },
  { href: "/dashboard/leave", label: "Cuti/Izin", sublabel: "Time Off", icon: Briefcase },
  { href: "/dashboard/overtime", label: "Lembur", sublabel: "Overtime", icon: Timer },
  { href: "/dashboard/face-enrollment", label: "Wajah Saya", sublabel: "Face Enrollment", icon: ScanFace },
  { href: "/dashboard/account", label: "Akun", sublabel: "Ubah Password", icon: KeyRound },
];

/** Untuk akun 'pimpinan': tab tambahan agar bisa balik ke mode lihat statistik tanpa tombol Back. */
const statistikLink = { href: "/admin", label: "Statistik", sublabel: "Lihat Statistik", icon: BarChart3 };

export default function EmployeeNav({ title, isPimpinan = false }: { title: string; isPimpinan?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const navLinks = isPimpinan ? [statistikLink, ...links] : links;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="glass-nav">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5 font-semibold text-slate-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/70 p-1 shadow-sm">
              <Image
                src="/logo-sumba-barat.gif"
                alt="Logo Kabupaten Sumba Barat"
                width={28}
                height={28}
                className="h-full w-full object-contain"
                unoptimized
              />
            </span>
            <span className="text-sm sm:text-base">{title}</span>
          </div>

          <nav className="hidden gap-1 sm:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  pathname === link.href
                    ? "bg-gradient-to-r from-brand-600 to-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white/60"
                }`}
              >
                <link.icon size={16} />
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/60"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Mobile bottom tab bar. Untuk pimpinan (7 tab) dibuat bisa digeser agar label tetap terbaca. */}
      <nav
        className={`glass-nav fixed inset-x-0 bottom-0 top-auto z-10 flex border-b-0 border-t sm:hidden ${
          isPimpinan ? "overflow-x-auto" : ""
        }`}
      >
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition ${
              isPimpinan ? "w-[70px] shrink-0" : "flex-1"
            }`}
          >
            <span
              className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
                pathname === link.href ? "bg-brand-100 text-brand-700" : "text-slate-500"
              }`}
            >
              <link.icon size={20} />
            </span>
            <span className={pathname === link.href ? "text-brand-700" : "text-slate-500"}>{link.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
