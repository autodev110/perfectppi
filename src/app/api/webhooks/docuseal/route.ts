import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, downloadSubmissionDocument } from "@/lib/docuseal/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * POST /api/webhooks/docuseal
 *
 * Handles DocuSeal webhook events.
 * Protected by HMAC-SHA256 (X-DocuSeal-Signature header).
 * Always return 200 — DocuSeal retries on non-2xx.
 *
 * Events handled:
 *   form.completed     — all submitters finished → update contracts + advance order
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
  let documentUrl: string | null = null;
  try {
    const pdfBuffer = await downloadSubmissionDocument(submissionId);
    documentUrl = await uploadSignedPdf(
      pdfBuffer,
      contract.signer_id,
      contract.warranty_order_id,
      submissionId,
    );
  } catch (err) {
    console.error(`Failed to download/upload signed PDF for submission ${submissionId}:`, err);
  }

  // Update contract
  await admin
    .from("contracts")
    .update({
      signed_at: new Date().toISOString(),
      ...(documentUrl && { document_url: documentUrl }),
    })
    .eq("id", contract.id);

  // Advance order status to signed
  await admin
    .from("warranty_orders")
    .update({ status: "signed" })
    .eq("id", contract.warranty_order_id);

  console.log(`DocuSeal submission ${submissionId} completed → contract ${contract.id} signed`);
}

async function handleSubmissionExpired(submissionId: number) {
  const admin = createAdminClient();

  // Log but don't block — user can request a new signing URL
  console.log(`DocuSeal submission ${submissionId} expired`);

  // Optionally: mark contract docuseal_id as null so a new one can be created
  await admin
    .from("contracts")
    .update({ docuseal_id: null, docuseal_submitter_slug: null })
    .eq("docuseal_id", String(submissionId));
}

async function uploadSignedPdf(
  buffer: Buffer,
  signerId: string,
  orderId: string,
  submissionId: number,
): Promise<string | null> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET_NAME;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !bucketName || !accessKey || !secretKey) {
    console.warn("R2 not configured — signed PDF not uploaded");
    return null;
  }

  const key = `contracts/${signerId}/${orderId}/${submissionId}.pdf`;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    }),
  );

  const base = publicUrl?.replace(/\/$/, "") ?? "";
  return base ? `${base}/${key}` : null;
}
