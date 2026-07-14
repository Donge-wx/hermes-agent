import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { uploadSessionAttachmentHttp, WEIJIA_HTTP_CHUNK_BYTES } from './http-session-upload'

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

test('streams a 49 MiB file as authenticated raw HTTP chunks', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-test-'))
  const filePath = path.join(tempDir, '49m.bin')
  const source = Buffer.alloc(FILE_BYTES)

  for (let offset = 0; offset < source.length; offset += 1024 * 1024) {
    source.fill((offset / (1024 * 1024)) % 251, offset, Math.min(offset + 1024 * 1024, source.length))
  }

  await fs.promises.writeFile(filePath, source)
  t.after(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

  const receivedHash = crypto.createHash('sha256')
  let received = 0
  let chunks = 0
  let connections = 0

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

  server.on('connection', () => {
    connections += 1
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const result = await uploadSessionAttachmentHttp({
    baseUrl: `http://127.0.0.1:${address.port}`,
    filePath,
    name: '49m.bin',
    sessionId: 'session-wang',
    token: TOKEN
  })

  assert.equal(result?.attached, true)
  assert.equal(received, FILE_BYTES)
  assert.equal(chunks, Math.ceil(FILE_BYTES / WEIJIA_HTTP_CHUNK_BYTES))
  assert.ok(connections <= 2, `expected persistent upload sockets, saw ${connections} connections`)
  assert.equal(receivedHash.digest('hex'), crypto.createHash('sha256').update(source).digest('hex'))
})

test('honors a smaller 256 KiB chunk cap advertised by an older managed backend', async t => {
  const legacyChunkBytes = 256 * 1024
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-legacy-cap-'))
  const filePath = path.join(tempDir, 'legacy-cap.bin')
  const source = Buffer.alloc(legacyChunkBytes + 17, 0x4b)
  await fs.promises.writeFile(filePath, source)
  t.after(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

  const receivedChunks: Buffer[] = []

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    assert.equal(request.headers['x-hermes-session-token'], TOKEN)

    if (url.pathname.endsWith('/upload-capabilities')) {
      json(response, { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: legacyChunkBytes })

      return
    }

    if (url.pathname.endsWith('/upload-begin')) {
      json(response, { upload_id: 'legacy-cap-upload', max_chunk_bytes: legacyChunkBytes })

      return
    }

    if (url.pathname.endsWith('/upload-chunk')) {
      const body = await readBody(request)
      assert.ok(body.length > 0 && body.length <= legacyChunkBytes)
      receivedChunks.push(body)
      json(response, { received: receivedChunks.reduce((total, chunk) => total + chunk.length, 0) })

      return
    }

    if (url.pathname.endsWith('/upload-finish')) {
      assert.deepEqual(Buffer.concat(receivedChunks), source)
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
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const result = await uploadSessionAttachmentHttp({
    baseUrl: `http://127.0.0.1:${address.port}`,
    filePath,
    name: 'legacy-cap.bin',
    sessionId: 'session-wang',
    token: TOKEN
  })

  assert.equal(result?.attached, true)
  assert.equal(receivedChunks.length, 2)
})

test('uses a bounded parallel worker pool when the managed backend opts in', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-parallel-'))
  const filePath = path.join(tempDir, 'parallel.bin')
  const source = Buffer.alloc(WEIJIA_HTTP_CHUNK_BYTES * 4 + 17, 0x5a)
  await fs.promises.writeFile(filePath, source)
  t.after(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

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
      json(response, {
        upload_id: 'parallel-upload',
        max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES,
        parallel_chunks: true
      })

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
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
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
  t.after(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

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
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
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
  t.after(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

  let chunkAttempts = 0
  let cancelCalls = 0

  const result = await uploadSessionAttachmentHttp({
    baseUrl: 'https://wangxudong.wanyushudong.xyz',
    filePath,
    name: 'electron-retry.bin',
    sessionId: 'session-wang',
    requestJson: async (url, options) => {
      if (url.endsWith('/upload-capabilities')) {
        return { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
      }

      if (url.endsWith('/upload-begin')) {
        return { upload_id: 'electron-retry-upload', max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
      }

      if (url.includes('/upload-chunk?')) {
        chunkAttempts += 1

        if (chunkAttempts === 1) {
          throw new Error('net::ERR_CONNECTION_RESET')
        }

        assert.deepEqual(options?.body, source)

        return { received: source.length }
      }

      if (url.endsWith('/upload-finish')) {
        return { attached: true, bytes: source.length, uploaded: true }
      }

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

test('surfaces an enabled:false managed transport instead of falling back silently', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-disabled-'))
  const filePath = path.join(tempDir, 'disabled.bin')
  await fs.promises.writeFile(filePath, Buffer.from('x'))
  t.after(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

  await assert.rejects(
    uploadSessionAttachmentHttp({
      baseUrl: 'https://wangxudong.wanyushudong.xyz',
      filePath,
      name: 'disabled.bin',
      sessionId: 'session-wang',
      requestJson: async url => {
        if (url.endsWith('/upload-capabilities')) {
          return { enabled: false }
        }

        throw new Error(`Unexpected request: ${url}`)
      }
    }),
    /transport is disabled/
  )
})

test('cancels by request ID when the begin reply is lost', async t => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-http-upload-lost-begin-'))
  const filePath = path.join(tempDir, 'lost-begin.bin')
  await fs.promises.writeFile(filePath, Buffer.from('abc'))
  t.after(() => fs.promises.rm(tempDir, { force: true, recursive: true }))

  let beginBody: Record<string, unknown> | undefined
  let cancelBody: Record<string, unknown> | undefined

  await assert.rejects(
    uploadSessionAttachmentHttp({
      baseUrl: 'https://wangxudong.wanyushudong.xyz',
      filePath,
      name: 'lost-begin.bin',
      sessionId: 'session-wang',
      requestJson: async (url, options) => {
        if (url.endsWith('/upload-capabilities')) {
          return { enabled: true, max_bytes: 1024 ** 3, max_chunk_bytes: WEIJIA_HTTP_CHUNK_BYTES }
        }

        if (url.endsWith('/upload-begin')) {
          beginBody = options?.body as Record<string, unknown>
          throw new Error('simulated lost begin response')
        }

        if (url.endsWith('/upload-cancel')) {
          cancelBody = options?.body as Record<string, unknown>

          return { cancelled: true }
        }

        throw new Error(`Unexpected request: ${url}`)
      }
    }),
    /simulated lost begin response/
  )

  assert.ok(beginBody)
  assert.match(String(beginBody.request_id), /^[0-9a-f-]{36}$/i)
  assert.deepEqual(cancelBody, {
    request_id: beginBody.request_id,
    session_id: 'session-wang'
  })
})
