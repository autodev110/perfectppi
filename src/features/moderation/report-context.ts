import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const REPORT_CONTEXT_TTL_SECONDS = 15 * 60;

const payloadSchema = z.object({
  version: z.literal(1),
  viewerId: z.string().uuid(),
  entityType: z.enum(["community_post", "community_comment"]),
  entityId: z.string().uuid(),
  revisionId: z.string().uuid(),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
});

type ReportContextPayload = z.infer<typeof payloadSchema>;

function signingSecret() {
  const secret = process.env.REPORT_CONTEXT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error("Report context signing is not configured");
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", signingSecret())
    .update("perfectppi-report-context-v1\0")
    .update(payload)
    .digest("base64url");
}

export function createReportContext(input: Omit<ReportContextPayload, "version" | "issuedAt" | "expiresAt">) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: ReportContextPayload = {
    ...input,
    version: 1,
    issuedAt,
    expiresAt: issuedAt + REPORT_CONTEXT_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyReportContext(
  token: string,
  expected: Pick<ReportContextPayload, "viewerId" | "entityType" | "entityId">,
) {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  const expectedSignature = signature(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) return null;

  try {
    const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    const now = Math.floor(Date.now() / 1000);
    if (parsed.data.expiresAt < now || parsed.data.issuedAt > now + 30) return null;
    if (parsed.data.expiresAt - parsed.data.issuedAt > REPORT_CONTEXT_TTL_SECONDS) return null;
    if (parsed.data.viewerId !== expected.viewerId
      || parsed.data.entityType !== expected.entityType
      || parsed.data.entityId !== expected.entityId) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
