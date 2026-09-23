import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: requester } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  return requester?.role === "admin" ? userData.user.id : null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Hanya Admin yang dapat mengubah data pegawai." }, { status: 403 });
  }

  const body = await request.json();
  const allowed = ["full_name", "position", "role", "is_active", "nip", "phone"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { error } = await admin.from("employees").update(updates).eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
