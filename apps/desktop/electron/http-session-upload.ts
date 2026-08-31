import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'

const CAPABILITIES_PATH = '/api/session-attachments/upload-capabilities'
const BEGIN_PATH = '/api/session-attachments/upload-begin'
const CHUNK_PATH = '/api/session-attachments/upload-chunk'
const FINISH_PATH = '/api/session-attachments/upload-finish'
const CANCEL_PATH = '/api/session-attachments/upload-cancel'

export const WEIJIA_HTTP_CHUNK_BYTES = 4 * 1024 * 1024
const MAX_PARALLEL_HTTP_CHUNKS = 4
const REQUEST_TIMEOUT_MS = 120_000
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024
const TRANSIENT_RETRY_ATTEMPTS = 5
const TRANSIENT_RETRY_BASE_MS = 250

export type HttpSessionUploadErrorCode =
  'disabled' | 'http-error' | 'invalid-file' | 'invalid-response' | 'invalid-url' | 'transport-unavailable'

export class HttpSessionUploadError extends Error {
  readonly code: HttpSessionUploadErrorCode
  readonly statusCode?: number

  constructor(code: HttpSessionUploadErrorCode, message: string, statusCode?: number) {
    super(message)
    this.name = 'HttpSessionUploadError'
    this.code = code
    this.statusCode = statusCode
  }
}

export interface HttpJsonOptions {
  readonly body?: Buffer | Readonly<Record<string, unknown>>
  readonly contentType?: string
  readonly method?: string
  readonly timeoutMs?: number
}

export type HttpJsonRequester = (url: string, options?: HttpJsonOptions) => Promise<unknown>

export interface HttpSessionUploadOptions {
  readonly baseUrl: string
  readonly filePath: string
  readonly name: string
  readonly onProgress?: (progress: { readonly totalBytes: number; readonly uploadedBytes: number }) => void
  readonly requestJson?: HttpJsonRequester
  readonly sessionId: string
  readonly token?: string
}

export type HttpSessionUploadResult = Readonly<Record<string, unknown>>

function responseRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpSessionUploadError('invalid-response', `Hermes ${label} returned an invalid response`)
  }

  return Object.fromEntries(Object.entries(value))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fileIdentity(stat: fs.Stats): string {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
}

function isTransientTransportError(error: unknown): boolean {
  const message = errorMessage(error)
  const statusCode = error instanceof HttpSessionUploadError ? error.statusCode : undefined

  return (
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    /^(408|425|429|500|502|503|504):/.test(message) ||
    /\b(ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|EOF|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_ABORTED|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED)\b/i.test(
      message
    ) ||
    /(?:socket hang up|network error|timed out)/i.test(message)
  )
}

async function retryTransientRequest<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isTransientTransportError(error) || attempt + 1 >= TRANSIENT_RETRY_ATTEMPTS) {
        throw error
      }

      await new Promise(resolve => setTimeout(resolve, TRANSIENT_RETRY_BASE_MS * 2 ** attempt))
    }
  }

  throw new HttpSessionUploadError('transport-unavailable', 'Hermes HTTP attachment retry budget was exhausted')
}

function endpoint(baseUrl: string, pathname: string): string {
  let base: URL

  try {
    base = new URL(baseUrl)
  } catch (error) {
    throw new HttpSessionUploadError('invalid-url', `Invalid Hermes backend URL: ${errorMessage(error)}`)
  }

  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new HttpSessionUploadError('invalid-url', `Unsupported Hermes backend URL protocol: ${base.protocol}`)
  }

  const prefix = base.pathname.replace(/\/+$/, '')

  return new URL(`${prefix}${pathname}`, `${base.origin}/`).toString()
}

export function requestHttpJson(url: string, token: string, options: HttpJsonOptions = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let parsed: URL

    try {
      parsed = new URL(url)
    } catch (error) {
      reject(new HttpSessionUploadError('invalid-url', `Invalid URL: ${errorMessage(error)}`))
      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new HttpSessionUploadError('invalid-url', `Unsupported Hermes backend URL protocol: ${parsed.protocol}`))
      return
    }

    const rawBody = Buffer.isBuffer(options.body)
      ? options.body
      : options.body === undefined
        ? undefined
        : Buffer.from(JSON.stringify(options.body))
    const client = parsed.protocol === 'https:' ? https : http
    const request = client.request(
      parsed,
      {
        headers: {
          'Content-Type': options.contentType || 'application/json',
          'X-Hermes-Session-Token': token,
          ...(rawBody ? { 'Content-Length': String(rawBody.length) } : {})
        },
        method: options.method || 'GET'
      },
      response => {
        const chunks: Buffer[] = []
        let received = 0

        response.on('error', reject)
        response.on('data', chunk => {
          const buffer = Buffer.from(chunk)
          received += buffer.length

          if (received > MAX_JSON_RESPONSE_BYTES) {
            request.destroy(
              new HttpSessionUploadError(
                'invalid-response',
                `Hermes upload endpoint returned more than ${MAX_JSON_RESPONSE_BYTES} bytes`
              )
            )
            return
          }

          chunks.push(buffer)
        })
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const statusCode = response.statusCode || 500

          if (statusCode >= 400) {
            reject(
              new HttpSessionUploadError(
                'http-error',
                `${statusCode}: ${text || response.statusMessage || 'HTTP upload failed'}`,
                statusCode
              )
            )
            return
          }

          if (!text) {
            resolve(null)
            return
          }

          if (/^\s*<(?:!doctype|html)/i.test(text)) {
            reject(
              new HttpSessionUploadError(
                'invalid-response',
                `Expected JSON from ${url} but got HTML (status ${statusCode})`
              )
            )
            return
          }

          try {
            resolve(JSON.parse(text))
          } catch (error) {
            reject(
              new HttpSessionUploadError(
                'invalid-response',
                `Invalid JSON from ${url} (status ${statusCode}): ${text.slice(0, 200)}`
              )
            )
          }
        })
      }
    )

    request.on('error', reject)
    const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS
    request.setTimeout(timeoutMs, () => {
      request.destroy(
        new HttpSessionUploadError('transport-unavailable', `Hermes HTTP upload timed out after ${timeoutMs}ms`)
      )
    })

    if (rawBody) {
      request.write(rawBody)
    }
    request.end()
  })
}

export async function uploadSessionAttachmentHttp(
  options: HttpSessionUploadOptions
): Promise<HttpSessionUploadResult | null> {
  const { baseUrl, filePath, name, sessionId, token = '' } = options
  const requestJson = options.requestJson || ((url, requestOptions) => requestHttpJson(url, token, requestOptions))

  let capabilities: Readonly<Record<string, unknown>>

  try {
    capabilities = responseRecord(
      await retryTransientRequest(() =>
        requestJson(endpoint(baseUrl, CAPABILITIES_PATH), { timeoutMs: REQUEST_TIMEOUT_MS })
      ),
      'upload capability probe'
    )
  } catch (error) {
    const statusCode = error instanceof HttpSessionUploadError ? error.statusCode : undefined
    const message = errorMessage(error)

    if (statusCode === 404 || statusCode === 501 || /^(404|501):/.test(message)) {
      return null
    }

    throw new HttpSessionUploadError(
      'transport-unavailable',
      `Hermes HTTP attachment transport is unavailable: ${message}`,
      statusCode
    )
  }

  if (capabilities.enabled !== true) {
    return null
  }

  const stat = await fs.promises.stat(filePath)
  if (!stat.isFile()) {
    throw new HttpSessionUploadError('invalid-file', `${name} is not a regular file`)
  }

  const advertisedMax = Number(capabilities.max_bytes)
  if (Number.isFinite(advertisedMax) && advertisedMax > 0 && stat.size > advertisedMax) {
    throw new HttpSessionUploadError(
      'invalid-file',
      `${name} is too large to upload to the remote gateway (max ${Math.floor(advertisedMax / (1024 * 1024))} MB).`
    )
  }

  const requestId = randomUUID()
  let uploadedBytes = 0
  let uploadId = ''
  let file: fs.promises.FileHandle | null = null

  try {
    const fileHandle = await fs.promises.open(filePath, 'r')
    file = fileHandle
    const openedStat = await fileHandle.stat()

    if (!openedStat.isFile() || fileIdentity(openedStat) !== fileIdentity(stat)) {
      throw new HttpSessionUploadError('invalid-file', `${name} changed before upload started`)
    }

    const begin = responseRecord(
      await retryTransientRequest(() =>
        requestJson(endpoint(baseUrl, BEGIN_PATH), {
          body: { name, path: name, request_id: requestId, session_id: sessionId, size: stat.size },
          method: 'POST',
          timeoutMs: REQUEST_TIMEOUT_MS
        })
      ),
      'upload begin'
    )
    uploadId = typeof begin.upload_id === 'string' ? begin.upload_id : ''

    if (!uploadId) {
      throw new HttpSessionUploadError('invalid-response', `Could not start HTTP upload for ${name}`)
    }

    options.onProgress?.({ totalBytes: stat.size, uploadedBytes: 0 })

    const advertisedChunk = Number(begin.max_chunk_bytes || capabilities.max_chunk_bytes)
    const chunkBytes =
      Number.isSafeInteger(advertisedChunk) && advertisedChunk > 0
        ? Math.min(advertisedChunk, WEIJIA_HTTP_CHUNK_BYTES)
        : WEIJIA_HTTP_CHUNK_BYTES
    const uploadChunk = async (offset: number) => {
      const requested = Math.min(chunkBytes, stat.size - offset)
      const buffer = Buffer.allocUnsafe(requested)
      const { bytesRead } = await fileHandle.read(buffer, 0, requested, offset)

      if (bytesRead !== requested) {
        throw new HttpSessionUploadError('invalid-file', `${name} changed while it was being uploaded`)
      }

      const query = new URLSearchParams({
        offset: String(offset),
        session_id: sessionId,
        upload_id: uploadId
      })
      const progress = responseRecord(
        await retryTransientRequest(() =>
          requestJson(endpoint(baseUrl, `${CHUNK_PATH}?${query}`), {
            body: buffer.subarray(0, bytesRead),
            contentType: 'application/octet-stream',
            method: 'POST',
            timeoutMs: REQUEST_TIMEOUT_MS
          })
        ),
        'upload chunk'
      )

      uploadedBytes += bytesRead
      options.onProgress?.({ totalBytes: stat.size, uploadedBytes })

      return { bytesRead, expected: offset + bytesRead, received: Number(progress.received) }
    }

    const advertisedInflight = Number(capabilities.max_inflight_chunks)
    const maxInflight =
      Number.isSafeInteger(advertisedInflight) && advertisedInflight > 0
        ? Math.min(MAX_PARALLEL_HTTP_CHUNKS, advertisedInflight)
        : 1
    const useParallelChunks = begin.parallel_chunks === true && maxInflight > 1 && stat.size > chunkBytes

    if (useParallelChunks) {
      let nextOffset = 0
      let firstError: Error | null = null
      const worker = async () => {
        while (!firstError) {
          const offset = nextOffset
          if (offset >= stat.size) return
          nextOffset += Math.min(chunkBytes, stat.size - offset)

          try {
            const progress = await uploadChunk(offset)
            if (!Number.isSafeInteger(progress.received) || progress.received <= 0 || progress.received > stat.size) {
              throw new HttpSessionUploadError(
                'invalid-response',
                `Remote gateway returned invalid HTTP upload progress for ${name}`
              )
            }
          } catch (error) {
            firstError = error instanceof Error ? error : new Error(String(error))
          }
        }
      }

      await Promise.all(Array.from({ length: maxInflight }, () => worker()))
      if (firstError) throw firstError
    } else {
      let offset = 0
      while (offset < stat.size) {
        const progress = await uploadChunk(offset)
        if (!Number.isSafeInteger(progress.received) || progress.received !== progress.expected) {
          throw new HttpSessionUploadError(
            'invalid-response',
            `Remote gateway returned invalid HTTP upload progress for ${name}`
          )
        }
        offset = progress.expected
      }
    }

    const finalStat = await fileHandle.stat()
    if (fileIdentity(finalStat) !== fileIdentity(openedStat)) {
      throw new HttpSessionUploadError('invalid-file', `${name} changed while it was being uploaded`)
    }

    return responseRecord(
      await retryTransientRequest(() =>
        requestJson(endpoint(baseUrl, FINISH_PATH), {
          body: { session_id: sessionId, upload_id: uploadId },
          method: 'POST',
          timeoutMs: REQUEST_TIMEOUT_MS
        })
      ),
      'upload finish'
    )
  } catch (error) {
    try {
      await requestJson(endpoint(baseUrl, CANCEL_PATH), {
        body: { request_id: requestId, session_id: sessionId, ...(uploadId ? { upload_id: uploadId } : {}) },
        method: 'POST',
        timeoutMs: REQUEST_TIMEOUT_MS
      })
    } catch (cleanupError) {
      if (!(cleanupError instanceof Error)) throw cleanupError
    }
    throw error
  } finally {
    if (file) {
      try {
        await file.close()
      } catch (cleanupError) {
        if (!(cleanupError instanceof Error)) throw cleanupError
      }
    }
  }
}
