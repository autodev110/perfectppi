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

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${params.key}`;

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

  return { publicUrl: `${process.env.R2_PUBLIC_URL}/${params.key}` };
}

/**
 * Extract the storage key from a URL we previously generated.
 * Falls back to the URL pathname if R2_PUBLIC_URL doesn't match (e.g. it changed).
 */
export function extractKeyFromStoredUrl(storedPublicUrl: string): string {
  const publicUrlBase = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (publicUrlBase && storedPublicUrl.startsWith(publicUrlBase + "/")) {
    return storedPublicUrl.slice(publicUrlBase.length + 1);
  }
  try {
    return new URL(storedPublicUrl).pathname.replace(/^\//, "");
  } catch {
    return storedPublicUrl;
  }
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
 */
export async function getObjectFromStoredUrl(storedPublicUrl: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
  etag?: string;
}> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const key = extractKeyFromStoredUrl(storedPublicUrl);

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!response.Body) {
    throw new Error("Empty response body from R2");
  }

  // The AWS SDK v3 returns a Web ReadableStream (or compatible) in Node 18+.
  return {
    body: response.Body.transformToWebStream(),
    contentType: response.ContentType ?? "application/octet-stream",
    contentLength: response.ContentLength,
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
