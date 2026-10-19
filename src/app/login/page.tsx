"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email atau password salah. Silakan coba lagi.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-login-gradient px-4 py-10">
      {/* Background: gedung Inspektorat Kab. Sumba Barat — dibuat lebih terang & jelas,
          overlay gelap dikurangi drastis (hanya cukup untuk kontras teks & kartu form). */}
      <div className="absolute inset-0">
        <Image
          src="/gedung-inspektorat.png"
          alt="Gedung Inspektorat Kabupaten Sumba Barat"
          fill
          priority
          className="object-cover opacity-95"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1220]/30 via-[#0b1220]/20 to-[#0b1220]/55" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 p-2 shadow-glass-dark backdrop-blur-xl">
            <Image
              src="/logo-sumba-barat.gif"
              alt="Logo Kabupaten Sumba Barat"
              width={64}
              height={64}
              className="h-full w-full object-contain"
              unoptimized
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Absensi Digital</h1>
          <p className="text-sm text-slate-300">Inspektorat Kabupaten Sumba Barat</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-dark space-y-4 rounded-2xl p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 backdrop-blur-md focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
              placeholder="nama@sumbabaratkab.go.id"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 backdrop-blur-md focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            <LogIn size={18} />
            {loading ? "Memproses..." : "Masuk"}
          </button>

          <p className="text-center text-xs text-slate-400">
            Akun pegawai dibuat oleh Admin. Hubungi Admin/Sekretariat Inspektorat bila belum
            memiliki akun.
          </p>
        </form>
      </div>
    </main>
  );
}
