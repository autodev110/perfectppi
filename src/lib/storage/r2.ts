import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 presigned URL generation
// Client PUTs file directly to R2 using the signed URL
// Key path: {entity}/{ownerId}/{recordId}/{timestamp}.{ext}

let s3Client: S3Client | null = null;

export function isR2Configured() {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL,
  );
}

function getS3Client() {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

export async function generatePresignedUrl(params: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME!;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: params.expiresIn ?? 600, // 10 minutes
  });

  const publicUrl = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${params.key}`;

  return { uploadUrl, publicUrl };
}

export async function uploadObject(params: {
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
}): Promise<{ publicUrl: string }> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME!;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );

  return { publicUrl: `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${params.key}` };
}

/**
 * Extract the storage key from a URL we previously generated.
 * Falls back to the URL pathname if R2_PUBLIC_URL doesn't match (e.g. it changed).
 */
export function extractKeyFromStoredUrl(storedPublicUrl: string): string {
  const publicUrlBase = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  let key: string;
  if (publicUrlBase && storedPublicUrl.startsWith(publicUrlBase + "/")) {
    key = storedPublicUrl.slice(publicUrlBase.length + 1);
  } else {
    try {
      key = new URL(storedPublicUrl).pathname;
    } catch {
      key = storedPublicUrl;
    }
  }
  // Strip any leading slashes — historical URLs were built with `${R2_PUBLIC_URL}/${key}`
  // which produced `r2.dev//ppi_media/...` if the env var had a trailing slash, leaving
  // a leading "/" on the key after extraction. R2 keys don't start with "/".
  return key.replace(/^\/+/, "");
}

/**
 * Generate a presigned GET URL for a stored object.
 * Use this instead of serving raw R2 public URLs — works regardless of bucket public access settings.
 */
export async function generatePresignedGetUrl(
  storedPublicUrl: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const key = extractKeyFromStoredUrl(storedPublicUrl);

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Fetch an object's bytes + content-type via the S3 API.
 * Use this when the browser cannot reach R2 directly (private bucket, no custom domain,
 * Cloudflare WAF in front, etc.) — we proxy the file through our server.
 *
 * Returns a Uint8Array (buffered) rather than a stream — simpler, works on every
 * runtime/SDK version, and image responses are small enough that streaming isn't worth
 * the version-compatibility risk.
 */
export async function getObjectFromStoredUrl(storedPublicUrl: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
  etag?: string;
}> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const key = extractKeyFromStoredUrl(storedPublicUrl);

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  const body = response.Body;
  if (!body) {
    throw new Error("Empty response body from R2");
  }

  let bytes: Uint8Array;
  // AWS SDK v3: Body has transformToByteArray() in Node 18+.
  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  } else {
    // Fallback: collect chunks from a Node Readable stream.
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
  }

  return {
    bytes,
    contentType: response.ContentType ?? "application/octet-stream",
    etag: response.ETag,
  };
}

export function buildStorageKey(params: {
  entity: string;
  ownerId: string;
  recordId: string;
  filename: string;
}): string {
  const ext = params.filename.split(".").pop() || "bin";
  const timestamp = Date.now();
  return `${params.entity}/${params.ownerId}/${params.recordId}/${timestamp}.${ext}`;
}
