import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import {
  getMyTechnicianCredentials,
  submitTechnicianCredential,
} from "@/features/technicians/credentials";

export async function GET() {
  const auth = await requireApiRole(["technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: await getMyTechnicianCredentials() });
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const result = await submitTechnicianCredential(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ data: result.credential }, { status: 201 });
}
