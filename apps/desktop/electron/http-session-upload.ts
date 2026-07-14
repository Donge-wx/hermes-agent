import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'

const CAPABILITIES_PATH = '/api/session-attachments/upload-capabilities'
const BEGIN_PATH = '/api/session-attachments/upload-begin'
const CHUNK_PATH = '/api/session-attachments/upload-chunk'
const FINISH_PATH = '/api/session-attachments/upload-finish'
const CANCEL_PATH = '/api/session-attachments/upload-cancel'

// Keep the client at the exact Weijia transport size. The backend may advertise
// a smaller value, in which case the smaller value always wins.
export const WEIJIA_HTTP_CHUNK_BYTES = 4 * 1024 * 1024
const MAX_PARALLEL_HTTP_CHUNKS = 4
const REQUEST_TIMEOUT_MS = 120_000
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024
const TRANSIENT_RETRY_ATTEMPTS = 5
const TRANSIENT_RETRY_BASE_MS = 250

// Upload chunks are deliberately sent by at most four workers.  Use the same
// bound for persistent sockets so each worker can retain a direct HTTPS path
// through Cloudflare instead of paying a new TCP/TLS setup for every 4 MiB
// chunk.  A remote peer may still close an idle socket; the existing retry
// policy treats that as a recoverable transport error.
const HTTP_UPLOAD_AGENT_OPTIONS = {
  keepAlive: true,
  maxFreeSockets: MAX_PARALLEL_HTTP_CHUNKS,
  maxSockets: MAX_PARALLEL_HTTP_CHUNKS
}

const httpUploadAgent = new http.Agent(HTTP_UPLOAD_AGENT_OPTIONS)
const httpsUploadAgent = new https.Agent(HTTP_UPLOAD_AGENT_OPTIONS)

export interface HttpJsonOptions {
  body?: Buffer | Record<string, unknown>
  contentType?: string
  method?: string
  timeoutMs?: number
}

export type HttpJsonRequester = (url: string, options?: HttpJsonOptions) => Promise<any>

export interface HttpSessionUploadOptions {
  baseUrl: string
  filePath: string
  name: string
  requestJson?: HttpJsonRequester
  sessionId: string
  token?: string
}

function isTransientTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return (
    /^(408|425|429|500|502|503|504):/.test(message) ||
    /\b(ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|EOF|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_ABORTED|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED)\b/i.test(
      message
    ) ||
    /(?:socket hang up|network error|timed out)/i.test(message)
  )
}

async function retryTransientRequest<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (!isTransientTransportError(error) || attempt + 1 >= TRANSIENT_RETRY_ATTEMPTS) {
        throw error
      }

      const delay = TRANSIENT_RETRY_BASE_MS * 2 ** attempt
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new Error(`${label} failed after retry: ${String(lastError)}`)
}

function endpoint(baseUrl: string, pathname: string): string {
  const base = new URL(baseUrl)

  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error(`Unsupported Hermes backend URL protocol: ${base.protocol}`)
  }

  // Endpoint paths are fixed locally. A remote capabilities response cannot
  // redirect the desktop into uploading file bytes to an arbitrary origin.
  // Preserve a configured reverse-proxy prefix, matching the desktop's other
  // REST calls (`connection.baseUrl + request.path`).
  const prefix = base.pathname.replace(/\/+$/, '')

  return new URL(`${prefix}${pathname}`, `${base.origin}/`).toString()
}

export function requestHttpJson(url: string, token: string, options: HttpJsonOptions = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    let parsed: URL

    try {
      parsed = new URL(url)
    } catch (error) {
      reject(new Error(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`))

      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error(`Unsupported Hermes backend URL protocol: ${parsed.protocol}`))

      return
    }

    const rawBody = Buffer.isBuffer(options.body)
      ? options.body
      : options.body === undefined
        ? undefined
        : Buffer.from(JSON.stringify(options.body))

    const client = parsed.protocol === 'https:' ? https : http
    const agent = parsed.protocol === 'https:' ? httpsUploadAgent : httpUploadAgent

    const request = client.request(
      parsed,
      {
        agent,
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
            request.destroy(new Error(`Hermes upload endpoint returned more than ${MAX_JSON_RESPONSE_BYTES} bytes`))

            return
          }

          chunks.push(buffer)
        })
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const statusCode = response.statusCode || 500

          if (statusCode >= 400) {
            reject(new Error(`${statusCode}: ${text || response.statusMessage || 'HTTP upload failed'}`))

            return
          }

          if (!text) {
            resolve(null)

            return
          }

          if (/^\s*<(?:!doctype|html)/i.test(text)) {
            reject(new Error(`Expected JSON from ${url} but got HTML (status ${statusCode})`))

            return
          }

          try {
            resolve(JSON.parse(text))
          } catch {
            reject(new Error(`Invalid JSON from ${url} (status ${statusCode}): ${text.slice(0, 200)}`))
          }
        })
      }
    )

    request.on('error', reject)
    request.setTimeout(options.timeoutMs || REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Hermes HTTP upload timed out after ${options.timeoutMs || REQUEST_TIMEOUT_MS}ms`))
    })

    if (rawBody) {
      request.write(rawBody)
    }

    request.end()
  })
}

/**
 * Weijia-compatible HTTP upload state machine: capability probe, begin, raw
 * octet-stream chunks, finish, and best-effort cancel. Returns null only when
 * an older backend does not implement the HTTP transport (404/501); a reachable
 * backend that disables it is surfaced as an actionable error rather than
 * silently falling back to the slow WebSocket/base64 transport.
 */
export async function uploadSessionAttachmentHttp(options: HttpSessionUploadOptions): Promise<any | null> {
  const { baseUrl, filePath, name, sessionId, token = '' } = options

  const requestJson: HttpJsonRequester =
    options.requestJson || ((url, requestOptions) => requestHttpJson(url, token, requestOptions))

  let capabilities: any

  try {
    capabilities = await retryTransientRequest('capability probe', () =>
      requestJson(endpoint(baseUrl, CAPABILITIES_PATH), {
        timeoutMs: REQUEST_TIMEOUT_MS
      })
    )
  } catch (error) {
    // An older backend simply lacks this optional transport.  Authentication,
    // tenant-scope, and server errors must be visible instead of silently
    // falling back to the slow WebSocket/base64 path.
    const message = error instanceof Error ? error.message : String(error)

    if (/^(404|501):/.test(message)) {
      return null
    }

    throw new Error(`Hermes HTTP attachment transport is unavailable: ${message}`)
  }

  if (capabilities?.enabled !== true) {
    throw new Error('Hermes HTTP attachment transport is disabled by the connected backend')
  }

  const stat = await fs.promises.stat(filePath)

  if (!stat.isFile()) {
    throw new Error(`${name} is not a regular file`)
  }

  const advertisedMax = Number(capabilities.max_bytes)

  if (Number.isFinite(advertisedMax) && advertisedMax > 0 && stat.size > advertisedMax) {
    throw new Error(
      `${name} is too large to upload to the remote gateway (max ${Math.floor(advertisedMax / (1024 * 1024))} MB).`
    )
  }

  const requestId = randomUUID()
  let uploadId = ''
  let file: fs.promises.FileHandle | null = null

  try {
    const begin = await retryTransientRequest('upload begin', () =>
      requestJson(endpoint(baseUrl, BEGIN_PATH), {
        body: { name, path: name, request_id: requestId, session_id: sessionId, size: stat.size },
        method: 'POST',
        timeoutMs: REQUEST_TIMEOUT_MS
      })
    )

    uploadId = typeof begin?.upload_id === 'string' ? begin.upload_id : ''

    if (!uploadId) {
      throw new Error(`Could not start HTTP upload for ${name}`)
    }

    const advertisedChunk = Number(begin?.max_chunk_bytes || capabilities.max_chunk_bytes)

    const chunkBytes =
      Number.isSafeInteger(advertisedChunk) && advertisedChunk > 0
        ? Math.min(advertisedChunk, WEIJIA_HTTP_CHUNK_BYTES)
        : WEIJIA_HTTP_CHUNK_BYTES

    const fileHandle = await fs.promises.open(filePath, 'r')
    file = fileHandle

    const uploadChunk = async (offset: number) => {
      const requested = Math.min(chunkBytes, stat.size - offset)
      const buffer = Buffer.allocUnsafe(requested)
      const { bytesRead } = await fileHandle.read(buffer, 0, requested, offset)

      if (bytesRead <= 0) {
        throw new Error(`Could not read ${name} at byte ${offset}`)
      }

      const query = new URLSearchParams({
        offset: String(offset),
        session_id: sessionId,
        upload_id: uploadId
      })

      const progress = await retryTransientRequest(`upload chunk at ${offset}`, () =>
        requestJson(endpoint(baseUrl, `${CHUNK_PATH}?${query}`), {
          body: buffer.subarray(0, bytesRead),
          contentType: 'application/octet-stream',
          method: 'POST',
          timeoutMs: REQUEST_TIMEOUT_MS
        })
      )

      const received = Number(progress?.received)
      const expected = offset + bytesRead

      return { bytesRead, received, expected }
    }

    const advertisedInflight = Number(capabilities.max_inflight_chunks)

    const maxInflight =
      Number.isSafeInteger(advertisedInflight) && advertisedInflight > 0
        ? Math.min(MAX_PARALLEL_HTTP_CHUNKS, advertisedInflight)
        : 1

    const useParallelChunks = begin?.parallel_chunks === true && maxInflight > 1 && stat.size > chunkBytes

    if (useParallelChunks) {
      let nextOffset = 0
      let firstError: Error | null = null

      const worker = async () => {
        while (!firstError) {
          const offset = nextOffset

          if (offset >= stat.size) {
            return
          }

          nextOffset += Math.min(chunkBytes, stat.size - offset)

          try {
            const progress = await uploadChunk(offset)

            if (!Number.isSafeInteger(progress.received) || progress.received <= 0 || progress.received > stat.size) {
              throw new Error(`Remote gateway returned invalid HTTP upload progress for ${name}`)
            }
          } catch (error) {
            firstError = error instanceof Error ? error : new Error(String(error))

            return
          }
        }
      }

      await Promise.all(Array.from({ length: maxInflight }, () => worker()))

      if (firstError) {
        throw firstError
      }
    } else {
      let offset = 0

      while (offset < stat.size) {
        const progress = await uploadChunk(offset)

        if (!Number.isSafeInteger(progress.received) || progress.received !== progress.expected) {
          throw new Error(`Remote gateway returned invalid HTTP upload progress for ${name}`)
        }

        offset = progress.expected
      }
    }

    return await retryTransientRequest('upload finish', () =>
      requestJson(endpoint(baseUrl, FINISH_PATH), {
        body: { session_id: sessionId, upload_id: uploadId },
        method: 'POST',
        timeoutMs: REQUEST_TIMEOUT_MS
      })
    )
  } catch (error) {
    await requestJson(endpoint(baseUrl, CANCEL_PATH), {
      body: {
        request_id: requestId,
        session_id: sessionId,
        ...(uploadId ? { upload_id: uploadId } : {})
      },
      method: 'POST',
      timeoutMs: REQUEST_TIMEOUT_MS
    }).catch(() => undefined)
    throw error
  } finally {
    await file?.close().catch(() => undefined)
  }
}
