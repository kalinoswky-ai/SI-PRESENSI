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

// Admin menyetujui atau menolak pendaftaran wajah yang dikirim pegawai secara mandiri.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Hanya Admin yang dapat memverifikasi wajah pegawai." }, { status: 403 });
  }

  const body = await request.json();
  const action = body.action as "approve" | "reject";
  const reason = (body.reason as string | undefined) || null;

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Aksi tidak valid." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: employee, error: fetchError } = await admin
    .from("employees")
    .select("pending_face_descriptor, pending_photo_url, face_enrollment_status")
    .eq("id", params.id)
    .single();

  if (fetchError || !employee) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }
  if (employee.face_enrollment_status !== "pending") {
    return NextResponse.json({ error: "Tidak ada pendaftaran wajah yang menunggu persetujuan." }, { status: 400 });
  }

  if (action === "approve") {
    const { error } = await admin
      .from("employees")
      .update({
        face_descriptor: employee.pending_face_descriptor,
        photo_url: employee.pending_photo_url,
        pending_face_descriptor: null,
        pending_photo_url: null,
        face_enrollment_status: "approved",
        face_rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, status: "approved" });
  }

  // reject
  const { error } = await admin
    .from("employees")
    .update({
      pending_face_descriptor: null,
      pending_photo_url: null,
      face_enrollment_status: "rejected",
      face_rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, status: "rejected" });
}
