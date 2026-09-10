import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

// Cloudflare R2 presigned URL generation
// Client PUTs file directly to R2 using the signed URL
// Key path: {entity}/{ownerId}/{recordId}/{timestamp}.{ext}

let s3Client: S3Client | null = null;
const PRIVATE_STORAGE_PREFIX = "r2-private:///";
const OWNER_STORAGE_ENTITIES = [
  "ppi_media",
  "vehicle_media",
  "media_package",
  "community_post",
  "message_attachment",
  "contracts",
] as const;

function isR2ClientConfigured() {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

export function isR2Configured() {
  return Boolean(
    isR2ClientConfigured() &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL,
  );
}

export function isPrivateR2Configured() {
  return Boolean(isR2ClientConfigured() && process.env.R2_PRIVATE_BUCKET_NAME);
}

function getS3Client() {
  if (!isR2ClientConfigured()) {
    throw new Error("R2 client credentials are not configured");
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
  contentLength?: number;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME!;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: params.expiresIn ?? 600, // 10 minutes
  });

  const publicUrl = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${params.key}`;

  return { uploadUrl, publicUrl };
}

/** Presigns a write into the private bucket and returns only an opaque reference. */
export async function generateQuarantinePresignedUrl(params: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; storageReference: string }> {
  if (!isPrivateR2Configured()) {
    throw new Error("Private R2 quarantine storage is not configured");
  }
  const key = params.key.replace(/^\/+/, "");
  const command = new PutObjectCommand({
    Bucket: process.env.R2_PRIVATE_BUCKET_NAME!,
    Key: key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: params.expiresIn ?? 600,
  });
  return { uploadUrl, storageReference: privateStorageReference(key) };
}

/** Presigns a write into private storage without exposing a public object URL. */
export async function generatePrivatePresignedUrl(params: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; storageReference: string }> {
  if (!isPrivateR2Configured()) {
    throw new Error("Private R2 storage is not configured");
  }
  const key = params.key.replace(/^\/+/, "");
  const command = new PutObjectCommand({
    Bucket: process.env.R2_PRIVATE_BUCKET_NAME!,
    Key: key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: params.expiresIn ?? 600,
  });
  return { uploadUrl, storageReference: privateStorageReference(key) };
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

/** Uploads partner deliverables to a bucket with no public domain. */
export async function uploadPrivateObject(params: {
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
}): Promise<{ storageReference: string }> {
  if (!isPrivateR2Configured()) {
    throw new Error("Private R2 artifact storage is not configured");
  }
  const client = getS3Client();
  const key = params.key.replace(/^\/+/, "");

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_PRIVATE_BUCKET_NAME!,
      Key: key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );

  return { storageReference: privateStorageReference(key) };
}

/** Copies an approved object into the public bucket. The caller deletes the source after its DB commit. */
export async function promoteQuarantinedObject(params: {
  storageReference: string;
  destinationKey: string;
}): Promise<{ publicUrl: string }> {
  if (!isPrivateStorageReference(params.storageReference)) {
    throw new Error("Expected a quarantined storage reference");
  }
  if (!isPrivateR2Configured() || !isR2Configured()) {
    throw new Error("R2 quarantine and public storage must both be configured");
  }

  const sourceKey = params.storageReference
    .slice(PRIVATE_STORAGE_PREFIX.length)
    .replace(/^\/+/, "");
  const destinationKey = params.destinationKey.replace(/^\/+/, "");
  const source = [process.env.R2_PRIVATE_BUCKET_NAME!, ...sourceKey.split("/")]
    .map(encodeURIComponent)
    .join("/");

  await getS3Client().send(new CopyObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: destinationKey,
    CopySource: source,
    MetadataDirective: "COPY",
  }));
  return {
    publicUrl: `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${destinationKey}`,
  };
}

/**
 * Copies a private object to another private key (plan 19.2: approved
 * Community media moves from the expiring quarantine keyspace to an immutable
 * hash-keyed location in the same private bucket). The caller deletes the
 * source after its database commit.
 */
export async function copyPrivateObject(params: {
  sourceReference: string;
  destinationKey: string;
}): Promise<{ storageReference: string }> {
  if (!isPrivateStorageReference(params.sourceReference)) {
    throw new Error("Expected a private storage reference");
  }
  if (!isPrivateR2Configured()) {
    throw new Error("Private R2 storage is not configured");
  }
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME!;
  const sourceKey = params.sourceReference
    .slice(PRIVATE_STORAGE_PREFIX.length)
    .replace(/^\/+/, "");
  const destinationKey = params.destinationKey.replace(/^\/+/, "");
  const source = [bucket, ...sourceKey.split("/")].map(encodeURIComponent).join("/");

  await getS3Client().send(new CopyObjectCommand({
    Bucket: bucket,
    Key: destinationKey,
    CopySource: source,
    MetadataDirective: "COPY",
  }));
  return { storageReference: privateStorageReference(destinationKey) };
}

/**
 * Verifies from the outside that a retired public URL no longer resolves
 * (plan 19.2: "prove the old URL no longer resolves"). Uses a plain HTTP
 * request, not the S3 API, so a CDN or bucket-policy cache is caught too.
 */
export async function publicUrlStillResolves(url: string): Promise<boolean> {
  const response = await fetch(url, { method: "HEAD", cache: "no-store", redirect: "manual" });
  return response.status >= 200 && response.status < 400;
}

/**
 * Reads all or part of a stored object for status-aware delivery. A Range
 * request is forwarded to R2 so video players can seek; the response shape
 * mirrors what an HTTP handler needs to answer with 200 or 206.
 */
export async function getStoredObjectRange(
  storedValue: string,
  rangeHeader: string | null,
  limits: { maxBytes?: number } = {},
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  etag?: string;
  totalSize?: number;
  contentRange?: string;
  partial: boolean;
}> {
  const client = getS3Client();
  const { bucket, key } = resolveStoredObject(storedValue);
  const range = rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader.trim()) ? rangeHeader.trim() : undefined;

  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
  const body = response.Body;
  if (!body) throw new Error("Empty response body from R2");

  const contentRange = response.ContentRange;
  const totalSize = contentRange
    ? Number(contentRange.split("/")[1])
    : response.ContentLength;
  if (limits.maxBytes !== undefined && totalSize !== undefined && totalSize > limits.maxBytes) {
    throw new Error("Stored object exceeds the allowed size");
  }

  const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  return {
    bytes,
    contentType: response.ContentType ?? "application/octet-stream",
    etag: response.ETag,
    totalSize: Number.isFinite(totalSize) ? totalSize : undefined,
    contentRange,
    partial: Boolean(range && contentRange),
  };
}

/** Deletes a public URL or private storage reference created by this module. */
export async function deleteStoredObject(storedValue: string): Promise<void> {
  const { bucket, key } = resolveStoredObject(storedValue);
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function deleteBucketPrefix(bucket: string, prefix: string): Promise<number> {
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const listed = await getS3Client().send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    const keys = (listed.Contents ?? []).flatMap((object) => object.Key ? [object.Key] : []);
    if (keys.length > 0) {
      const result = await getS3Client().send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }));
      if (result.Errors?.length) {
        throw new Error(`R2 rejected ${result.Errors.length} account-deletion objects`);
      }
      deleted += keys.length;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

/** Removes every object created through an owner-scoped upload path. */
export async function deleteOwnerStoredObjects(
  ownerId: string,
  additionalReferences: string[] = [],
): Promise<number> {
  let deleted = 0;
  if (isR2Configured()) {
    for (const entity of OWNER_STORAGE_ENTITIES) {
      deleted += await deleteBucketPrefix(process.env.R2_BUCKET_NAME!, `${entity}/${ownerId}/`);
    }
  }
  if (isPrivateR2Configured()) {
    for (const entity of OWNER_STORAGE_ENTITIES) {
      deleted += await deleteBucketPrefix(
        process.env.R2_PRIVATE_BUCKET_NAME!,
        `${entity}/${ownerId}/`,
      );
      deleted += await deleteBucketPrefix(
        process.env.R2_PRIVATE_BUCKET_NAME!,
        `quarantine/${entity}/${ownerId}/`,
      );
    }
    deleted += await deleteBucketPrefix(
      process.env.R2_PRIVATE_BUCKET_NAME!,
      `integration_artifacts/${ownerId}/`,
    );
  }

  for (const reference of new Set(additionalReferences)) {
    if (isPrivateStorageReference(reference) && !isPrivateR2Configured()) {
      throw new Error("Private R2 is not configured for account deletion");
    }
    if (!isPrivateStorageReference(reference) && !isR2Configured()) {
      throw new Error("Public R2 is not configured for account deletion");
    }
    await deleteStoredObject(reference);
    deleted += 1;
  }
  return deleted;
}

export function privateStorageReference(key: string): string {
  return `${PRIVATE_STORAGE_PREFIX}${key.replace(/^\/+/, "")}`;
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
  const { bucket, key } = resolveStoredObject(storedPublicUrl);

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
export async function getObjectFromStoredUrl(
  storedPublicUrl: string,
  limits: { maxBytes?: number; expectedBytes?: number } = {},
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  etag?: string;
}> {
  const client = getS3Client();
  const { bucket, key } = resolveStoredObject(storedPublicUrl);

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  const declaredSize = response.ContentLength;
  if (declaredSize !== undefined && limits.maxBytes !== undefined && declaredSize > limits.maxBytes) {
    throw new Error("Stored object exceeds the allowed size");
  }
  if (declaredSize !== undefined && limits.expectedBytes !== undefined && declaredSize !== limits.expectedBytes) {
    throw new Error("Stored object size does not match its upload reservation");
  }

  const body = response.Body;
  if (!body) {
    throw new Error("Empty response body from R2");
  }

  let bytes: Uint8Array;
  // AWS SDK v3: Body has transformToByteArray() in Node 18+.
  if (
    limits.maxBytes === undefined
    && limits.expectedBytes === undefined
    && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function"
  ) {
    bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  } else {
    // Fallback: collect chunks from a Node Readable stream.
    const chunks: Uint8Array[] = [];
    let buffered = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
      buffered += chunk.length;
      if (limits.maxBytes !== undefined && buffered > limits.maxBytes) {
        throw new Error("Stored object exceeds the allowed size");
      }
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
  }

  if (limits.maxBytes !== undefined && bytes.byteLength > limits.maxBytes) {
    throw new Error("Stored object exceeds the allowed size");
  }
  if (limits.expectedBytes !== undefined && bytes.byteLength !== limits.expectedBytes) {
    throw new Error("Stored object size does not match its upload reservation");
  }

  return {
    bytes,
    contentType: response.ContentType ?? "application/octet-stream",
    etag: response.ETag,
  };
}

/**
 * Fetch an object by its storage key.
 *
 * Partner artifacts are addressed by key, not by public URL: the bytes are
 * streamed back through an authenticated route, so the bucket never needs to be
 * public and no expiring link becomes a permanent record on the partner's side.
 */
export async function getPrivateObjectByKey(key: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  if (!isPrivateR2Configured()) {
    throw new Error("Private R2 artifact storage is not configured");
  }
  const client = getS3Client();
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME!;

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key.replace(/^\/+/, "") }),
  );

  const body = response.Body;
  if (!body) {
    throw new Error("Empty response body from R2");
  }

  let bytes: Uint8Array;
  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  } else {
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
  };
}

export function isStoredObjectConfigured(storedValue: string): boolean {
  return isPrivateStorageReference(storedValue)
    ? isPrivateR2Configured()
    : isR2Configured();
}

export function isPrivateStorageReference(storedValue: string): boolean {
  return storedValue.startsWith(PRIVATE_STORAGE_PREFIX);
}

function resolveStoredObject(storedValue: string): { bucket: string; key: string } {
  if (storedValue.startsWith(PRIVATE_STORAGE_PREFIX)) {
    if (!isPrivateR2Configured()) {
      throw new Error("Private R2 artifact storage is not configured");
    }
    return {
      bucket: process.env.R2_PRIVATE_BUCKET_NAME!,
      key: storedValue.slice(PRIVATE_STORAGE_PREFIX.length).replace(/^\/+/, ""),
    };
  }

  if (!isR2Configured()) throw new Error("R2 is not configured");
  return {
    bucket: process.env.R2_BUCKET_NAME!,
    key: extractKeyFromStoredUrl(storedValue),
  };
}

export function buildStorageKey(params: {
  entity: string;
  ownerId: string;
  recordId: string;
  filename: string;
}): string {
  const candidate = params.filename.split(".").pop()?.toLowerCase() ?? "";
  const ext = /^[a-z0-9]{1,10}$/.test(candidate) ? candidate : "bin";
  return `${params.entity}/${params.ownerId}/${params.recordId}/${Date.now()}-${randomUUID()}.${ext}`;
}

export function buildQuarantineKey(params: {
  entity: string;
  ownerId: string;
  recordId: string;
  filename: string;
}): string {
  return `quarantine/${buildStorageKey(params)}`;
}
