import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, downloadSubmissionDocument } from "@/lib/docuseal/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStorageKey, uploadPrivateObject } from "@/lib/storage/r2";

/**
 * POST /api/webhooks/docuseal
 *
 * Handles DocuSeal webhook events.
 * Protected by HMAC-SHA256 (X-DocuSeal-Signature header).
 * Processing failures return non-2xx so DocuSeal retries delivery.
 *
 * Events handled:
 *   form.completed     — all submitters finished → update contracts + advance order
 *   submission.completed — completion event used by some DocuSeal builds
 *   submission.expired — signing link expired before completion
 */
export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-docuseal-signature") ?? "";

  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    console.warn("Invalid DocuSeal webhook signature — rejecting");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event_type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await handleEvent(event.event_type, event.data ?? {});
  } catch (err: unknown) {
    console.error(`DocuSeal webhook error (${event.event_type}):`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(eventType: string, data: Record<string, unknown>) {
  // Submission ID is in data.submission.id (form events) or data.id
  const submissionId: number | undefined =
    (data?.submission as { id?: number } | undefined)?.id ??
    (typeof data?.id === "number" ? data.id : undefined);

  if (!submissionId) {
    console.warn(`No submission ID in DocuSeal event ${eventType}`);
    return;
  }

  switch (eventType) {
    case "form.completed":
    case "submission.completed":
      await handleFormCompleted(submissionId);
      break;
    case "submission.expired":
      await handleSubmissionExpired(submissionId);
      break;
    default:
      console.log(`Unhandled DocuSeal event: ${eventType}`);
  }
}

/**
 * form.completed — all submitters signed.
 * Steps:
 *  1. Find contracts row by docuseal_id
 *  2. Download signed PDF, upload to R2
 *  3. Update contracts: signed_at, document_url
 *  4. Advance warranty_orders.status → 'signed'
 */
async function handleFormCompleted(submissionId: number) {
  const admin = createAdminClient();

  const { data: contract, error } = await admin
    .from("contracts")
    .select("id, warranty_order_id, signer_id, signed_at")
    .eq("docuseal_id", String(submissionId))
    .maybeSingle();

  if (error || !contract) {
    console.warn(`form.completed: no contracts row for DocuSeal submission ${submissionId}`);
    return;
  }

  if (contract.signed_at) {
    console.log(`Submission ${submissionId} already signed — skipping`);
    return;
  }

  // Download + upload signed PDF to R2
  const pdfBuffer = await downloadSubmissionDocument(submissionId);
  const documentUrl = await uploadSignedPdf(
    pdfBuffer,
    contract.signer_id,
    contract.warranty_order_id,
    submissionId,
  );

  const { error: completionError } = await admin.rpc("complete_warranty_signature", {
    p_contract_id: contract.id,
    p_order_id: contract.warranty_order_id,
    p_signed_at: new Date().toISOString(),
    p_document_url: documentUrl,
  });
  if (completionError) throw completionError;

  console.log(`DocuSeal submission ${submissionId} completed → contract ${contract.id} signed`);
}

async function handleSubmissionExpired(submissionId: number) {
  const admin = createAdminClient();

  // Log but don't block — user can request a new signing URL
  console.log(`DocuSeal submission ${submissionId} expired`);

  // Optionally: mark contract docuseal_id as null so a new one can be created
  const { error } = await admin
    .from("contracts")
    .update({ docuseal_id: null, docuseal_submitter_slug: null })
    .eq("docuseal_id", String(submissionId));
  if (error) throw error;
}

async function uploadSignedPdf(
  buffer: Buffer,
  signerId: string,
  orderId: string,
  submissionId: number,
): Promise<string> {
  const { storageReference } = await uploadPrivateObject({
    key: buildStorageKey({
      entity: "contracts",
      ownerId: signerId,
      recordId: orderId,
      filename: `${submissionId}.pdf`,
    }),
    body: buffer,
    contentType: "application/pdf",
  });
  return storageReference;
}
