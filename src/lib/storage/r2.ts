import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 presigned URL generation
// Client PUTs file directly to R2 using the signed URL
// Key path: {entity}/{ownerId}/{recordId}/{timestamp}.{ext}

let s3Client: S3Client | null = null;

function getS3Client() {
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
