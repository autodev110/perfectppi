import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { generatePresignedGetUrl, isStoredObjectConfigured } from "@/lib/storage/r2";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { data: contract } = await auth.supabase
    .from("contracts")
    .select("document_url")
    .eq("id", id)
    .maybeSingle();
  if (!contract?.document_url) {
    return NextResponse.json({ error: "Signed contract not found" }, { status: 404 });
  }
  if (!isStoredObjectConfigured(contract.document_url)) {
    return NextResponse.json({ error: "Contract storage is unavailable" }, { status: 503 });
  }

  try {
    return NextResponse.redirect(await generatePresignedGetUrl(contract.document_url, 300));
  } catch {
    return NextResponse.json({ error: "Contract could not be opened" }, { status: 500 });
  }
}
