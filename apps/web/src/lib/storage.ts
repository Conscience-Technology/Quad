/**
 * S3-compatible storage adapter. Backed by Railway Storage Buckets in
 * production, MinIO in docker-compose, AWS S3 / R2 / B2 elsewhere.
 *
 * Follows the `internal` project pattern: presigned URLs only, server never
 * proxies large bytes.
 */
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let cached: S3Client | undefined;
function client(): S3Client {
  if (cached) return cached;
  const e = env();
  cached = new S3Client({
    region: e.BUCKET_REGION,
    endpoint: e.BUCKET_ENDPOINT,
    credentials: {
      accessKeyId: e.BUCKET_ACCESS_KEY_ID,
      secretAccessKey: e.BUCKET_SECRET_KEY,
    },
    forcePathStyle: true, // MinIO + R2 require this
  });
  return cached;
}

export type PresignUploadInput = {
  key: string;
  contentType: string;
  maxSizeBytes: number;
  expiresInSeconds?: number;
};

export type PresignUploadOutput = {
  url: string;
  fields: Record<string, string>;
  key: string;
};

export async function presignUpload(
  input: PresignUploadInput,
): Promise<PresignUploadOutput> {
  const e = env();
  const post = await createPresignedPost(client(), {
    Bucket: e.BUCKET_NAME,
    Key: input.key,
    Conditions: [
      ["content-length-range", 1, input.maxSizeBytes],
      ["eq", "$Content-Type", input.contentType],
    ],
    Fields: { "Content-Type": input.contentType },
    Expires: input.expiresInSeconds ?? 60 * 15, // 15 min
  });
  return { url: post.url, fields: post.fields, key: input.key };
}

export async function presignDownload(
  key: string,
  expiresInSeconds = 300,
): Promise<string> {
  const e = env();
  const cmd = new GetObjectCommand({ Bucket: e.BUCKET_NAME, Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSeconds });
}

/** Server-side direct put. Used by the preprocessing pipeline for derived
 * artifacts (keyframes, timeline.json, brief.md) without going through
 * presigned uploads. */
export async function putBytes(
  key: string,
  bytes: Uint8Array | Buffer | string,
  contentType: string,
): Promise<void> {
  const e = env();
  const body = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  await client().send(
    new PutObjectCommand({
      Bucket: e.BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** For frames/screenshots that need to be embedded as MCP image content. */
export async function getBytes(key: string): Promise<Uint8Array> {
  const e = env();
  const r = await client().send(
    new GetObjectCommand({ Bucket: e.BUCKET_NAME, Key: key }),
  );
  if (!r.Body) throw new Error(`empty body for ${key}`);
  // Node stream -> bytes
  const stream = r.Body as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}
