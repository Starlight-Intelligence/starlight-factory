import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { requireEnv } from "./constants.js";
import { DocumentExistsError } from "./document-errors.js";

/**
 * The document store on Railway: a private, S3-compatible Railway Bucket.
 *
 * @remarks
 * Mirrors the three helpers `./blob.ts` exposes, with the same contract: a missing document is
 * `found: false`, API failures propagate, and write-once saves refuse to replace an existing key.
 * Unlike the Vercel store, the bucket is private: nothing in it has a public URL, and access goes
 * through the bucket's own keys. Railway exposes those keys as service variable references; the
 * template maps them onto the `S3_*` names read here.
 *
 * Write-once uses a conditional put (`If-None-Match: *`), so two concurrent saves to the same key
 * can't both win. A store that ignores the condition still gets the artifact ids' random suffix
 * as a second line of defence.
 */

let client: S3Client | undefined;

const s3 = (): S3Client => {
  client ??= new S3Client({
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID", "the bucket's ACCESS_KEY_ID"),
      secretAccessKey: requireEnv(
        "S3_SECRET_ACCESS_KEY",
        "the bucket's SECRET_ACCESS_KEY"
      ),
    },
    endpoint: requireEnv("S3_ENDPOINT", "the bucket's ENDPOINT"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    region: process.env.S3_REGION ?? "auto",
  });
  return client;
};

const bucket = (): string => requireEnv("S3_BUCKET", "the bucket's BUCKET");

const HTTP_NOT_FOUND = 404;
const HTTP_PRECONDITION_FAILED = 412;

const statusOf = (error: unknown): number | undefined =>
  error instanceof S3ServiceException
    ? error.$metadata.httpStatusCode
    : undefined;

/**
 * A 404 means "no such document" only when the bucket itself exists. A deleted or misnamed
 * bucket also answers 404, and reporting that as a missing document would hide a broken store
 * behind an empty brain.
 */
const isMissingObject = (error: unknown): boolean =>
  statusOf(error) === HTTP_NOT_FOUND &&
  !(error instanceof S3ServiceException && error.name === "NoSuchBucket");

export const s3ReadDocument = async (
  key: string
): Promise<
  { found: false } | { content: string; found: true; uploadedAt: string }
> => {
  try {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    );
    if (!result.Body) {
      return { found: false };
    }
    return {
      content: await result.Body.transformToString("utf-8"),
      found: true,
      uploadedAt: (result.LastModified ?? new Date()).toISOString(),
    };
  } catch (error) {
    if (isMissingObject(error)) {
      return { found: false };
    }
    throw error;
  }
};

export const s3WriteDocument = async (
  key: string,
  contents: string,
  options: { allowOverwrite: boolean }
): Promise<{ pathname: string }> => {
  try {
    await s3().send(
      new PutObjectCommand({
        Body: contents,
        Bucket: bucket(),
        ContentType: "text/markdown; charset=utf-8",
        IfNoneMatch: options.allowOverwrite ? undefined : "*",
        Key: key,
      })
    );
  } catch (error) {
    if (statusOf(error) === HTTP_PRECONDITION_FAILED) {
      throw new DocumentExistsError(key, { cause: error });
    }
    throw error;
  }
  return { pathname: key };
};

export const s3DeleteDocument = async (
  key: string
): Promise<{ existed: boolean }> => {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (error) {
    if (statusOf(error) !== HTTP_NOT_FOUND) {
      throw error;
    }
    // A HEAD 404 has no body to name the cause, so confirm the bucket before calling it missing.
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
    return { existed: false };
  }
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  return { existed: true };
};
