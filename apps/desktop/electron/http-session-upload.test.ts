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

test('streams a 49 MiB file as thirteen authenticated raw HTTP chunks', async t => {
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
  assert.equal(chunks, 13)
  assert.equal(receivedHash.digest('hex'), crypto.createHash('sha256').update(source).digest('hex'))
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
