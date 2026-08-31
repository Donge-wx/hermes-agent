import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { test } from 'vitest'

import { HttpSessionUploadError, uploadSessionAttachmentHttp, WEIJIA_HTTP_CHUNK_BYTES } from './http-session-upload'
import type { HttpJsonOptions } from './http-session-upload'

const FILE_BYTES = 49 * 1024 * 1024
const TOKEN = 'wang-http-test-token'

function readBody(request: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('error', reject)
    request.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function json(response: http.ServerResponse, body: unknown, statusCode = 200) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function jsonRequestBody(body: HttpJsonOptions['body']): Record<string, unknown> {
  assert.ok(body && !Buffer.isBuffer(body))

  return Object.fromEntries(Object.entries(body))
}

test('streams a 49 MiB file as thirteen authenticated raw HTTP chunks', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-test-'))
  const filePath = path.join(tempDir, 'large-video.mp4')
  const source = Buffer.alloc(FILE_BYTES)

  for (let offset = 0; offset < source.length; offset += 1024 * 1024) {
    source.fill((offset / (1024 * 1024)) % 251, offset, Math.min(offset + 1024 * 1024, source.length))
  }

  await fs.promises.writeFile(filePath, source)
  t.onTestFinished(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

  const receivedHash = crypto.createHash('sha256')
  let received = 0
  let chunks = 0
  const progress: Array<{ totalBytes: number; uploadedBytes: number }> = []

  const server = http.createServer(async (request, response) => {
    assert.equal(request.headers['x-hermes-session-token'], TOKEN)
    const url = new URL(request.url || '/', 'http://127.0.0.1')

    if (url.pathname.endsWith('/upload-capabilities')) {
      json(response, { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES })
      return
    }

    if (url.pathname.endsWith('/upload-begin')) {
      const body = JSON.parse((await readBody(request)).toString('utf8'))
      assert.equal(body.session_id, 'session-wang')
      assert.equal(body.size, FILE_BYTES)
      assert.match(body.request_id, /^[0-9a-f-]{36}$/i)
      json(response, { upload_id: 'upload-wang', max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES })
      return
    }

    if (url.pathname.endsWith('/upload-chunk')) {
      assert.equal(url.searchParams.get('session_id'), 'session-wang')
      assert.equal(url.searchParams.get('upload_id'), 'upload-wang')
      assert.equal(Number(url.searchParams.get('offset')), received)
      assert.equal(request.headers['content-type'], 'application/octet-stream')
      const body = await readBody(request)
      assert.ok(body.length > 0 && body.length <= WEIJIA_HTTP_CHUNK_BYTES)
      receivedHash.update(body)
      received += body.length
      chunks += 1
      json(response, { received, upload_id: 'upload-wang' })
      return
    }

    if (url.pathname.endsWith('/upload-finish')) {
      assert.deepEqual(JSON.parse((await readBody(request)).toString('utf8')), {
        session_id: 'session-wang',
        upload_id: 'upload-wang'
      })
      json(response, { attached: true, ref_text: '@file:49m.bin', uploaded: true })
      return
    }

    json(response, { detail: 'not found' }, 404)
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.onTestFinished(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const result = await uploadSessionAttachmentHttp({
    baseUrl: `http://127.0.0.1:${address.port}`,
    filePath,
    name: 'large-video.mp4',
    onProgress: value => progress.push(value),
    sessionId: 'session-wang',
    token: TOKEN
  })

  assert.equal(result?.attached, true)
  assert.equal(received, FILE_BYTES)
  assert.equal(chunks, 13)
  assert.deepEqual(progress.at(0), { totalBytes: FILE_BYTES, uploadedBytes: 0 })
  assert.deepEqual(progress.at(-1), { totalBytes: FILE_BYTES, uploadedBytes: FILE_BYTES })
  assert.ok(progress.every((value, index) => index === 0 || value.uploadedBytes >= progress[index - 1]!.uploadedBytes))
  assert.equal(receivedHash.digest('hex'), crypto.createHash('sha256').update(source).digest('hex'))
})

test('uses a bounded parallel worker pool when the managed backend opts in', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-parallel-'))
  const filePath = path.join(tempDir, 'parallel.bin')
  const source = Buffer.alloc(WEIJIA_HTTP_CHUNK_BYTES * 4 + 17, 0x5a)
  await fs.promises.writeFile(filePath, source)
  t.onTestFinished(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

  const receivedChunks = new Map<number, Buffer>()
  let activeChunks = 0
  let maximumActiveChunks = 0

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    assert.equal(request.headers['x-hermes-session-token'], TOKEN)

    if (url.pathname.endsWith('/upload-capabilities')) {
      json(response, {
        enabled: true,
        max_bytes: 1024 ** 3,
        max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES,
        max_inflight_chunks: 4,
        parallel_chunks: true
      })
      return
    }
    if (url.pathname.endsWith('/upload-begin')) {
      json(response, { upload_id: 'parallel-upload', max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES, parallel_chunks: true })
      return
    }
    if (url.pathname.endsWith('/upload-chunk')) {
      activeChunks += 1
      maximumActiveChunks = Math.max(maximumActiveChunks, activeChunks)
      try {
        await new Promise(resolve => setTimeout(resolve, 25))
        const offset = Number(url.searchParams.get('offset'))
        receivedChunks.set(offset, await readBody(request))
        const received = [...receivedChunks.values()].reduce((total, chunk) => total + chunk.length, 0)
        json(response, { received })
      } finally {
        activeChunks -= 1
      }
      return
    }
    if (url.pathname.endsWith('/upload-finish')) {
      const assembled = Buffer.concat(
        [...receivedChunks.entries()].sort(([left], [right]) => left - right).map(([, chunk]) => chunk)
      )
      assert.deepEqual(assembled, source)
      json(response, { attached: true, bytes: source.length, uploaded: true })
      return
    }
    if (url.pathname.endsWith('/upload-cancel')) {
      json(response, { cancelled: true })
      return
    }
    json(response, { detail: 'not found' }, 404)
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.onTestFinished(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const result = await uploadSessionAttachmentHttp({
    baseUrl: `http://127.0.0.1:${address.port}`,
    filePath,
    name: 'parallel.bin',
    sessionId: 'session-wang',
    token: TOKEN
  })
  assert.equal(result?.attached, true)
  assert.equal(receivedChunks.size, 5)
  assert.ok(maximumActiveChunks >= 2)
  assert.ok(maximumActiveChunks <= 4)
})

test('retries a transient chunk response without cancelling the upload', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-retry-'))
  const filePath = path.join(tempDir, 'retry.bin')
  const source = Buffer.from('retry-this-attachment')
  await fs.promises.writeFile(filePath, source)
  t.onTestFinished(() => fs.promises.rm(tempDir, { force: true, recursive: true }))
  let chunkAttempts = 0
  let cancelCalls = 0
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (url.pathname.endsWith('/upload-capabilities')) {
      json(response, { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES })
      return
    }
    if (url.pathname.endsWith('/upload-begin')) {
      json(response, { upload_id: 'retry-upload', max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES })
      return
    }
    if (url.pathname.endsWith('/upload-chunk')) {
      chunkAttempts += 1
      if (chunkAttempts === 1) {
        json(response, { detail: 'temporary upstream issue' }, 503)
        return
      }
      assert.deepEqual(await readBody(request), source)
      json(response, { received: source.length })
      return
    }
    if (url.pathname.endsWith('/upload-finish')) {
      json(response, { attached: true, bytes: source.length, uploaded: true })
      return
    }
    if (url.pathname.endsWith('/upload-cancel')) {
      cancelCalls += 1
      json(response, { cancelled: true })
      return
    }
    json(response, { detail: 'not found' }, 404)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.onTestFinished(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const result = await uploadSessionAttachmentHttp({
    baseUrl: `http://127.0.0.1:${address.port}`,
    filePath,
    name: 'retry.bin',
    sessionId: 'session-wang',
    token: TOKEN
  })
  assert.equal(result?.attached, true)
  assert.equal(chunkAttempts, 2)
  assert.equal(cancelCalls, 0)
})

test('retries an Electron network-reset error without cancelling the upload', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-electron-retry-'))
  const filePath = path.join(tempDir, 'electron-retry.bin')
  const source = Buffer.from('retry-through-electron-net')
  await fs.promises.writeFile(filePath, source)
  t.onTestFinished(() => fs.promises.rm(tempDir, { force: true, recursive: true }))
  let chunkAttempts = 0
  let cancelCalls = 0
  const result = await uploadSessionAttachmentHttp({
    baseUrl: 'https://wangxudong.wanyushudong.xyz',
    filePath,
    name: 'electron-retry.bin',
    sessionId: 'session-wang',
    requestJson: async (url, options) => {
      if (url.endsWith('/upload-capabilities'))
        return { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
      if (url.endsWith('/upload-begin'))
        return { upload_id: 'electron-retry-upload', max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
      if (url.includes('/upload-chunk?')) {
        chunkAttempts += 1
        if (chunkAttempts === 1) throw new Error('net::ERR_CONNECTION_RESET')
        assert.deepEqual(options?.body, source)
        return { received: source.length }
      }
      if (url.endsWith('/upload-finish')) return { attached: true, bytes: source.length, uploaded: true }
      if (url.endsWith('/upload-cancel')) {
        cancelCalls += 1
        return { cancelled: true }
      }
      throw new Error(`Unexpected request: ${url}`)
    }
  })
  assert.equal(result?.attached, true)
  assert.equal(chunkAttempts, 2)
  assert.equal(cancelCalls, 0)
})

test('falls back to the existing transport when the connected backend disables HTTP upload', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-disabled-'))
  const filePath = path.join(tempDir, 'disabled.bin')
  await fs.promises.writeFile(filePath, Buffer.from('x'))
  t.onTestFinished(() => fs.promises.rm(tempDir, { force: true, recursive: true }))
  await assert.doesNotReject(async () => {
    const result = await uploadSessionAttachmentHttp({
      baseUrl: 'https://wangxudong.wanyushudong.xyz',
      filePath,
      name: 'disabled.bin',
      sessionId: 'session-wang',
      requestJson: async url => {
        if (url.endsWith('/upload-capabilities')) return { enabled: false }
        throw new Error(`Unexpected request: ${url}`)
      }
    })

    assert.equal(result, null)
  })
})

test('cancels instead of publishing when the selected file changes during upload', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-changing-'))
  const filePath = path.join(tempDir, 'changing.bin')
  await fs.promises.writeFile(filePath, Buffer.alloc(WEIJIA_HTTP_CHUNK_BYTES + 1, 1))
  t.onTestFinished(() => fs.promises.rm(tempDir, { force: true, recursive: true }))
  let cancelled = false
  let finished = false

  await assert.rejects(
    uploadSessionAttachmentHttp({
      baseUrl: 'https://wangxudong.wanyushudong.xyz',
      filePath,
      name: 'changing.bin',
      sessionId: 'session-wang',
      requestJson: async (url, options) => {
        if (url.endsWith('/upload-capabilities')) {
          return { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
        }
        if (url.endsWith('/upload-begin')) {
          return { upload_id: 'changing-upload', max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
        }
        if (url.includes('/upload-chunk?')) {
          await fs.promises.appendFile(filePath, Buffer.from([2]))
          const offset = Number(new URL(url).searchParams.get('offset') || 0)
          return { received: offset + (Buffer.isBuffer(options?.body) ? options.body.length : 0) }
        }
        if (url.endsWith('/upload-cancel')) {
          cancelled = true
          return { cancelled: true }
        }
        if (url.endsWith('/upload-finish')) {
          finished = true
          return { attached: true }
        }
        throw new Error(`Unexpected request: ${url}`)
      }
    }),
    (error: unknown) => error instanceof HttpSessionUploadError && error.code === 'invalid-file'
  )

  assert.equal(cancelled, true)
  assert.equal(finished, false)
})

test.each([404, 501])('returns null only for an unsupported capability endpoint (%s)', async statusCode => {
  const result = await uploadSessionAttachmentHttp({
    baseUrl: 'https://wangxudong.wanyushudong.xyz',
    filePath: '/not-read-when-unsupported',
    name: 'unsupported.bin',
    sessionId: 'session-wang',
    requestJson: async () => {
      throw new HttpSessionUploadError('http-error', `${statusCode}: unsupported`, statusCode)
    }
  })

  assert.equal(result, null)
})

test('surfaces a typed transport failure for a capability authorization error', async () => {
  await assert.rejects(
    uploadSessionAttachmentHttp({
      baseUrl: 'https://wangxudong.wanyushudong.xyz',
      filePath: '/not-read-on-auth-failure',
      name: 'forbidden.bin',
      sessionId: 'session-wang',
      requestJson: async () => {
        throw new HttpSessionUploadError('http-error', '403: forbidden', 403)
      }
    }),
    (error: unknown) =>
      error instanceof HttpSessionUploadError && error.code === 'transport-unavailable' && error.statusCode === 403
  )
})

test('reuses the request ID when a transient begin request is retried', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-idempotent-begin-'))
  const filePath = path.join(tempDir, 'idempotent.bin')
  const source = Buffer.from('idempotent-upload')
  await fs.promises.writeFile(filePath, source)
  t.onTestFinished(() => fs.promises.rm(tempDir, { force: true, recursive: true }))
  const requestIds: string[] = []

  const result = await uploadSessionAttachmentHttp({
    baseUrl: 'https://wangxudong.wanyushudong.xyz',
    filePath,
    name: 'idempotent.bin',
    sessionId: 'session-wang',
    requestJson: async (url, options) => {
      if (url.endsWith('/upload-capabilities')) {
        return { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
      }
      if (url.endsWith('/upload-begin')) {
        requestIds.push(String(jsonRequestBody(options?.body).request_id))
        if (requestIds.length === 1) throw new Error('net::ERR_CONNECTION_RESET')
        return { upload_id: 'idempotent-upload', max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
      }
      if (url.includes('/upload-chunk?')) {
        assert.deepEqual(options?.body, source)
        return { received: source.length }
      }
      if (url.endsWith('/upload-finish')) return { attached: true }
      throw new Error(`Unexpected request: ${url}`)
    }
  })

  assert.equal(result?.attached, true)
  assert.equal(requestIds.length, 2)
  assert.equal(requestIds[0], requestIds[1])
})

test('cancels by request ID when the begin reply is lost', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-lost-begin-'))
  const filePath = path.join(tempDir, 'lost-begin.bin')
  await fs.promises.writeFile(filePath, Buffer.from('abc'))
  t.onTestFinished(() => fs.promises.rm(tempDir, { force: true, recursive: true }))
  let beginBody: Record<string, unknown> | undefined
  let cancelBody: Record<string, unknown> | undefined
  await assert.rejects(
    uploadSessionAttachmentHttp({
      baseUrl: 'https://wangxudong.wanyushudong.xyz',
      filePath,
      name: 'lost-begin.bin',
      sessionId: 'session-wang',
      requestJson: async (url, options) => {
        if (url.endsWith('/upload-capabilities'))
          return { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
        if (url.endsWith('/upload-begin')) {
          beginBody = jsonRequestBody(options?.body)
          throw new Error('simulated lost begin response')
        }
        if (url.endsWith('/upload-cancel')) {
          cancelBody = jsonRequestBody(options?.body)
          return { cancelled: true }
        }
        throw new Error(`Unexpected request: ${url}`)
      }
    }),
    /simulated lost begin response/
  )
  assert.ok(beginBody)
  assert.match(String(beginBody.request_id), /^[0-9a-f-]{36}$/i)
  assert.deepEqual(cancelBody, { request_id: beginBody.request_id, session_id: 'session-wang' })
})
