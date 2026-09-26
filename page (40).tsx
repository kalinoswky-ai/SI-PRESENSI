import ChangePasswordForm from "@/components/ChangePasswordForm";

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Akun Saya</h1>
      <ChangePasswordForm />
    </div>
  );
}
