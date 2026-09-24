import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login");
  const isProtected = path.startsWith("/dashboard") || path.startsWith("/admin");
  const isForcePasswordRoute = path.startsWith("/ganti-password");

  if (!user && (isProtected || isForcePasswordRoute)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let role: string | undefined;
  let mustChangePassword = false;
  if (user && (isAuthRoute || isProtected || isForcePasswordRoute)) {
    let { data: employee, error } = await supabase
      .from("employees")
      .select("role, must_change_password")
      .eq("id", user.id)
      .single();
    if (error) {
      // Kolom must_change_password belum ada (migrasi SQL belum dijalankan) — jangan sampai
      // semua pengguna terkunci; ambil role saja dan lewati kewajiban ganti password.
      const fallback = await supabase.from("employees").select("role").eq("id", user.id).single();
      employee = fallback.data as typeof employee;
    }
    role = employee?.role;
    mustChangePassword = employee?.must_change_password === true;
  }

  // Login pertama akun hasil import Excel: wajib ganti password dulu sebelum masuk ke aplikasi.
  if (user && mustChangePassword && (isProtected || isAuthRoute)) {
    return NextResponse.redirect(new URL("/ganti-password", request.url));
  }
  if (user && isForcePasswordRoute && !mustChangePassword) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const isLeadership = role === "admin" || role === "pimpinan";

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL(isLeadership ? "/admin" : "/dashboard", request.url));
  }

  // Akun admin hanya mengontrol sistem — tidak melakukan absensi sendiri lewat /dashboard.
  // Pimpinan (Inspektur/Sekretaris) TETAP boleh membuka /dashboard: mereka tetap absen
  // sendiri seperti pegawai biasa, hanya ditambah akses lihat statistik di /admin.
  if (user && path.startsWith("/dashboard") && role === "admin") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Panel /admin: Admin (penuh) dan Pimpinan (lihat statistik saja) boleh masuk.
  if (user && path.startsWith("/admin") && !isLeadership) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Halaman berikut khusus Admin (mengubah data pegawai/pengaturan sistem/melihat
  // riwayat perubahan) — Pimpinan diarahkan kembali ke Dashboard Admin (ringkasan).
  const adminOnlySubpaths =
    path.startsWith("/admin/employees/new") ||
    /^\/admin\/employees\/[^/]+/.test(path) || // /admin/employees/[id] (form edit pegawai)
    path.startsWith("/admin/settings") ||
    path.startsWith("/admin/attendance/audit");

  if (user && role === "pimpinan" && adminOnlySubpaths) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/ganti-password"],
};
