import Link from "next/link";

export default function AttendanceTabs({ active }: { active: "grid" | "log" | "audit" }) {
  const tabs = [
    { key: "grid", label: "Timesheets (Mingguan)", href: "/admin/attendance" },
    { key: "log", label: "Log Absensi (Edit/Hapus)", href: "/admin/attendance/log" },
    { key: "audit", label: "Riwayat Perubahan", href: "/admin/attendance/audit" },
  ] as const;

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
            active === t.key
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
