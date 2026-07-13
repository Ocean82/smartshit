import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from './config.js'

/**
 * S3 client for workbook storage.
 * Only initializes if AWS credentials are configured.
 */
let client: S3Client | null = null

function getClient(): S3Client {
  if (!client) {
    if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
      throw new Error('AWS credentials are not configured. Cloud storage is unavailable.')
    }

    client = new S3Client({
      region: config.s3Region,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
    })
  }

  return client
}

/**
 * Build the full S3 key with the configured prefix.
 * Example: smartsht/workbooks/user_123/abc-def/latest.json
 */
function buildKey(relativePath: string): string {
  return `${config.s3Prefix}/${relativePath}`
}

// ─── Upload ──────────────────────────────────────────────────────────────────

/**
 * Upload a JSON workbook to S3.
 */
export async function uploadWorkbook(
  userId: string,
  workbookId: string,
  filename: string,
  data: string | Buffer,
): Promise<{ key: string; sizeBytes: number }> {
  const key = buildKey(`workbooks/${userId}/${workbookId}/${filename}`)
  const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data

  await getClient().send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }),
  )

  return { key, sizeBytes: body.byteLength }
}

/**
 * Upload a community template package to S3.
 */
export async function uploadTemplate(
  templateId: string,
  data: string | Buffer,
): Promise<{ key: string; sizeBytes: number }> {
  const key = buildKey(`templates/${templateId}.json`)
  const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data

  await getClient().send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }),
  )

  return { key, sizeBytes: body.byteLength }
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Download a workbook (or any object) from S3 by key.
 */
export async function downloadObject(key: string): Promise<string> {
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    }),
  )

  if (!response.Body) {
    throw new Error(`S3 object is empty: ${key}`)
  }

  return response.Body.transformToString('utf-8')
}

/**
 * Get the size of an S3 object without downloading it.
 */
export async function getObjectSize(key: string): Promise<number> {
  const response = await getClient().send(
    new HeadObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    }),
  )

  return response.ContentLength ?? 0
}

// ─── Delete ──────────────────────────────────────────────────────────────────

/**
 * Delete an object from S3.
 */
export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    }),
  )
}

// ─── Presigned URLs ──────────────────────────────────────────────────────────

/**
 * Generate a presigned download URL (useful for large workbooks / direct client download).
 * Expires in 15 minutes by default.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 900,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
  })

  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds })
}

// ─── Health ──────────────────────────────────────────────────────────────────

/**
 * Check if S3 is configured and accessible.
 */
export async function s3HealthCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
    return { ok: false, error: 'AWS credentials not configured' }
  }

  try {
    // Try to head a known prefix to verify access
    await getClient().send(
      new HeadObjectCommand({
        Bucket: config.s3Bucket,
        Key: buildKey('.healthcheck'),
      }),
    )
    return { ok: true }
  } catch (err) {
    // NotFound is actually fine — it means we have access but the object doesn't exist
    if (err instanceof Error && err.name === 'NotFound') {
      return { ok: true }
    }
    // AccessDenied or other errors mean real problems
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: message }
  }
}
