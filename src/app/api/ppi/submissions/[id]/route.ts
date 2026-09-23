import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getSubmission } from "@/features/ppi/queries";
import { APP_UPDATE_REQUIRED, clientSupportsCatalog } from "@/features/ppi/client-capability";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "admin", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const data = await getSubmission(id);

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await clientSupportsCatalog(data.catalog_version ?? 1))) {
    return NextResponse.json(APP_UPDATE_REQUIRED, { status: 426 });
  }

  return NextResponse.json({ data });
}

/**
 * Status changes go through the guarded actions only: starting an inspection,
 * the certified submit, and revisions. A generic status PATCH could move a
 * submission to submitted/completed without certification (and the database
 * now refuses that), so the endpoint is retired.
 */
export async function PATCH() {
  return NextResponse.json(
    { error: "Submission status is managed by the inspection workflow.", code: "method_retired" },
    { status: 405 },
  );
}
