import Link from "next/link";

/** Tab pada fitur tambah pegawai: input satu per satu atau import Excel massal. */
export default function EmployeeAddTabs({ active }: { active: "manual" | "import" }) {
  const tabs = [
    { key: "manual", label: "Input Manual", href: "/admin/employees/new" },
    { key: "import", label: "Import Excel", href: "/admin/employees/import" },
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
