// DocuSeal e-signature client
// Translated from DMS NestJS service — same API, plain module pattern for Next.js
// IMPORTANT: DocuSeal signature URLs (embed_src) expire — always generate on page open

export interface DocuSealTemplate {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DocuSealSubmitter {
  id: number;
  submission_id?: number;
  slug: string;
  email: string;
  name: string;
  role: string;
  status: string;
  embed_src: string | null;
  completed_at: string | null;
}

export interface DocuSealSubmission {
  id: number;
  template_id: number;
  status: string;
  created_at: string;
  submitters: DocuSealSubmitter[];
  documents?: { url?: string; name?: string }[];
}

function getBaseUrl(): string {
  return process.env.DOCUSEAL_API_URL ?? "https://api.docuseal.com";
}

function getPublicBaseUrl(): string {
  const explicit = process.env.DOCUSEAL_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return getBaseUrl().replace(/\/api\/?$/, "");
}

function isConfigured(): boolean {
  return !!process.env.DOCUSEAL_API_KEY;
}

function getHeaders(): Record<string, string> {
  return {
    "X-Auth-Token": process.env.DOCUSEAL_API_KEY!,
    "Content-Type": "application/json",
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!isConfigured()) {
    throw new Error("DocuSeal is not configured — set DOCUSEAL_API_KEY");
  }

  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: getHeaders(),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`DocuSeal API error: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

export function docusealIsConfigured(): boolean {
  return isConfigured();
}

export async function listTemplates(): Promise<DocuSealTemplate[]> {
  const result = await request<{ data: DocuSealTemplate[] } | DocuSealTemplate[]>(
    "GET",
    "/templates?limit=100",
  );
  return Array.isArray(result) ? result : (result as { data: DocuSealTemplate[] }).data ?? [];
}

/**
 * Create a submission with one or two submitters.
 * Pass staffEmail to require staff co-signing.
 * Returns the submitters array (each has slug + embed_src).
 */
export async function createSubmission(params: {
  templateId: number;
  customerEmail: string;
  customerName: string;
  customerRole?: string;
  staffEmail?: string;
  staffName?: string;
  /** Pre-fill template fields */
  values?: Record<string, string>;
}): Promise<DocuSealSubmitter[]> {
  const submitters: Record<string, unknown>[] = [
    {
      role: params.customerRole ?? "Customer",
      email: params.customerEmail,
      name: params.customerName,
      send_email: true,
      ...(params.values && { values: params.values }),
    },
  ];

  if (params.staffEmail) {
    submitters.push({
      role: "Staff",
      email: params.staffEmail,
      name: params.staffName ?? "",
      send_email: true,
    });
  }

  return request<DocuSealSubmitter[]>("POST", "/submissions", {
    template_id: params.templateId,
    send_email: true,
    submitters,
  });
}

/**
 * Fetch a submitter by slug — returns a fresh embed_src.
 * Call this on page load, not when creating the submission.
 */
export async function getSubmitter(slug: string): Promise<DocuSealSubmitter> {
  try {
    return await request<DocuSealSubmitter>("GET", `/submitters/${slug}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Older/self-hosted DocuSeal builds may not expose /submitters/:slug.
    // Fall back to the direct signing URL format.
    if (message.includes("404")) {
      return {
        id: 0,
        slug,
        email: "",
        name: "",
        role: "",
        status: "sent",
        embed_src: `${getPublicBaseUrl()}/s/${slug}`,
        completed_at: null,
      };
    }
    throw error;
  }
}

export async function getSubmission(submissionId: number): Promise<DocuSealSubmission> {
  return request<DocuSealSubmission>("GET", `/submissions/${submissionId}`);
}

/**
 * Download the signed PDF as a Buffer.
 * Checks documents[] at submission level, then per-submitter as fallback.
 */
export async function downloadSubmissionDocument(submissionId: number): Promise<Buffer> {
  const submission = await getSubmission(submissionId);

  const docs: { url?: string }[] = submission.documents ?? [];

  if (docs.length === 0 && Array.isArray(submission.submitters)) {
    for (const sub of submission.submitters) {
      const withDocs = sub as DocuSealSubmitter & { documents?: { url?: string }[] };
      if (Array.isArray(withDocs.documents) && withDocs.documents.length > 0) {
        docs.push(...withDocs.documents);
        break;
      }
    }
  }

  if (!docs.length || !docs[0].url) {
    throw new Error(`No documents found for DocuSeal submission ${submissionId}`);
  }

  const pdfRes = await fetch(docs[0].url, {
    headers: { "X-Auth-Token": process.env.DOCUSEAL_API_KEY! },
  });

  if (!pdfRes.ok) {
    throw new Error(`Failed to download signed PDF: ${pdfRes.status}`);
  }

  const arrayBuffer = await pdfRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function archiveSubmission(submissionId: number): Promise<void> {
  await request<unknown>("DELETE", `/submissions/${submissionId}`);
}

/**
 * Verify HMAC-SHA256 webhook signature.
 * DocuSeal sends it in the X-DocuSeal-Signature header.
 * Returns true if no secret configured (dev).
 */
export async function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
): Promise<boolean> {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  if (!secret) return true;

  const { createHmac } = await import("crypto");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signature === expected;
}
