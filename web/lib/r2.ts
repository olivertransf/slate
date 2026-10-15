import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

let client: S3Client | null = null;

export function bucketName(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET is not set.");
  return bucket;
}

function r2(): S3Client {
  if (!client) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("R2 credentials are not set.");
    }
    client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export async function bucketReady(): Promise<void> {
  await r2().send(new HeadBucketCommand({ Bucket: bucketName() }));
}

export async function getText(key: string): Promise<string | null> {
  try {
    const result = await r2().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
    return (await result.Body?.transformToString()) ?? null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function getBytes(key: string): Promise<{ body: Uint8Array; type: string } | null> {
  try {
    const result = await r2().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    return { body: bytes, type: result.ContentType ?? "application/octet-stream" };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function putText(key: string, body: string): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
}

export async function putBytes(key: string, body: Uint8Array, type: string): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: body,
      ContentType: type,
    }),
  );
}

export async function deleteKey(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

export async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await r2().send(
      new ListObjectsV2Command({
        Bucket: bucketName(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const item of page.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const status = "$metadata" in error ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode : 0;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}
