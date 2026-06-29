import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getMessageRecipientsDirectory } from "@/features/messages/queries";

export async function GET() {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const data = await getMessageRecipientsDirectory();
  return NextResponse.json({ data });
}
