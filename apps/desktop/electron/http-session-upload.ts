import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { randomUUID } from 'node:crypto'

const CAPABILITIES_PATH = '/api/session-attachments/upload-capabilities'
const BEGIN_PATH = '/api/session-attachments/upload-begin'
const CHUNK_PATH = '/api/session-attachments/upload-chunk'
const FINISH_PATH = '/api/session-attachments/upload-finish'
const CANCEL_PATH = '/api/session-attachments/upload-cancel'

// Keep the client at the exact Weijia transport size. The backend may advertise
// a smaller value, in which case the smaller value always wins.
export const WEIJIA_HTTP_CHUNK_BYTES = 4 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024

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
 * the backend does not advertise the HTTP transport, so callers can safely use
 * the resumable WebSocket contract as a compatibility fallback.
 */
export async function uploadSessionAttachmentHttp(options: HttpSessionUploadOptions): Promise<any | null> {
  const { baseUrl, filePath, name, sessionId, token = '' } = options

  const requestJson: HttpJsonRequester =
    options.requestJson || ((url, requestOptions) => requestHttpJson(url, token, requestOptions))

  let capabilities: any

  try {
    capabilities = await requestJson(endpoint(baseUrl, CAPABILITIES_PATH), {
      timeoutMs: REQUEST_TIMEOUT_MS
    })
  } catch {
    return null
  }

  if (capabilities?.enabled !== true) {
    return null
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
    const begin = await requestJson(endpoint(baseUrl, BEGIN_PATH), {
      body: { name, path: name, request_id: requestId, session_id: sessionId, size: stat.size },
      method: 'POST',
      timeoutMs: REQUEST_TIMEOUT_MS
    })

    uploadId = typeof begin?.upload_id === 'string' ? begin.upload_id : ''

    if (!uploadId) {
      throw new Error(`Could not start HTTP upload for ${name}`)
    }

    const advertisedChunk = Number(begin?.max_chunk_bytes || capabilities.max_chunk_bytes)
    const chunkBytes =
      Number.isSafeInteger(advertisedChunk) && advertisedChunk > 0
        ? Math.min(advertisedChunk, WEIJIA_HTTP_CHUNK_BYTES)
        : WEIJIA_HTTP_CHUNK_BYTES

    file = await fs.promises.open(filePath, 'r')
    const buffer = Buffer.allocUnsafe(chunkBytes)
    let offset = 0

    while (offset < stat.size) {
      const requested = Math.min(chunkBytes, stat.size - offset)
      const { bytesRead } = await file.read(buffer, 0, requested, offset)

      if (bytesRead <= 0) {
        throw new Error(`Could not read ${name} at byte ${offset}`)
      }

      const query = new URLSearchParams({
        offset: String(offset),
        session_id: sessionId,
        upload_id: uploadId
      })

      const progress = await requestJson(endpoint(baseUrl, `${CHUNK_PATH}?${query}`), {
        body: buffer.subarray(0, bytesRead),
        contentType: 'application/octet-stream',
        method: 'POST',
        timeoutMs: REQUEST_TIMEOUT_MS
      })

      const received = Number(progress?.received)
      const expected = offset + bytesRead

      if (!Number.isSafeInteger(received) || received !== expected) {
        throw new Error(`Remote gateway returned invalid HTTP upload progress for ${name}`)
      }

      offset = received
    }

    return await requestJson(endpoint(baseUrl, FINISH_PATH), {
      body: { session_id: sessionId, upload_id: uploadId },
      method: 'POST',
      timeoutMs: REQUEST_TIMEOUT_MS
    })
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
