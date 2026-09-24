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

  if (!user && isProtected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let role: string | undefined;
  if (user && (isAuthRoute || isProtected)) {
    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", user.id)
      .single();
    role = employee?.role;
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
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login"],
};
