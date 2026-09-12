import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { deleteSavedSearch } from "@/features/marketplace/saved-searches";

// DELETE /api/marketplace/saved-searches/<id>
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const deleted = await deleteSavedSearch(id);
  if (!deleted) return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
  return NextResponse.json({ data: { id, deleted: true } });
}
