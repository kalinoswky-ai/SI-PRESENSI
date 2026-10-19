import Link from "next/link";

const PERIODS = [
  { key: "day", label: "Harian" },
  { key: "week", label: "Mingguan" },
  { key: "month", label: "Bulanan" },
] as const;

/** Pemilih periode Timesheets: Harian / Mingguan / Bulanan. */
export default function TimesheetPeriodTabs({ active }: { active: "day" | "week" | "month" }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={`/admin/attendance?view=${p.key}`}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            active === p.key ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
