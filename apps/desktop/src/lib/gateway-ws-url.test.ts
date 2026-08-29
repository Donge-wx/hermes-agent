import {
  GatewayReauthRequiredError,
  isGatewayReauthRequired,
  JsonRpcGatewayClient,
  resolveGatewayWsUrl
} from '@hermes/shared'
import { describe, expect, it, vi } from 'vitest'

const oauthConn = { authMode: 'oauth' as const, wsUrl: 'ws://host/api/ws?ticket=stale' }
const tokenConn = { authMode: 'token' as const, wsUrl: 'ws://host/api/ws?token=abc' }

describe('resolveGatewayWsUrl', () => {
  describe('oauth mode', () => {
    it('uses the freshly minted URL', async () => {
      const getGatewayWsUrl = vi.fn().mockResolvedValue('ws://host/api/ws?ticket=fresh')
      await expect(resolveGatewayWsUrl({ getGatewayWsUrl }, oauthConn)).resolves.toBe('ws://host/api/ws?ticket=fresh')
      expect(getGatewayWsUrl).toHaveBeenCalledOnce()
    })

    it('uses the structured URL returned across the Electron IPC boundary', async () => {
      const getGatewayWsUrl = vi.fn().mockResolvedValue({ ok: true, wsUrl: 'ws://host/api/ws?ticket=fresh' })

      await expect(resolveGatewayWsUrl({ getGatewayWsUrl }, oauthConn)).resolves.toBe('ws://host/api/ws?ticket=fresh')
    })

    it('throws a reauth error when the main process reports an auth rejection', async () => {
      const getGatewayWsUrl = vi.fn().mockResolvedValue({
        error: '401 cookie expired',
        needsOauthLogin: true,
        ok: false
      })

      await expect(resolveGatewayWsUrl({ getGatewayWsUrl }, oauthConn)).rejects.toBeInstanceOf(
        GatewayReauthRequiredError
      )
    })

    it('preserves the main-process auth failure as the cause', async () => {
      const getGatewayWsUrl = vi.fn().mockResolvedValue({
        error: '401 cookie expired',
        needsOauthLogin: true,
        ok: false
      })

      const error = await resolveGatewayWsUrl({ getGatewayWsUrl }, oauthConn).catch(e => e)
      expect(error).toBeInstanceOf(GatewayReauthRequiredError)
      expect((error as GatewayReauthRequiredError).cause).toMatchObject({ message: '401 cookie expired' })
    })

    it('keeps a transport failure retryable instead of demanding sign-in', async () => {
      const getGatewayWsUrl = vi.fn().mockResolvedValue({ error: 'gateway timed out', ok: false })
      const error = await resolveGatewayWsUrl({ getGatewayWsUrl }, oauthConn).catch(e => e)

      expect(error).toMatchObject({ message: 'gateway timed out' })
      expect(isGatewayReauthRequired(error)).toBe(false)
    })

    it('rethrows an unexpected transport rejection unchanged', async () => {
      const cause = new Error('socket closed')
      const getGatewayWsUrl = vi.fn().mockRejectedValue(cause)

      await expect(resolveGatewayWsUrl({ getGatewayWsUrl }, oauthConn)).rejects.toBe(cause)
    })

    it('reports a missing preload method as an app capability error, not reauth', async () => {
      const error = await resolveGatewayWsUrl({}, oauthConn).catch(e => e)

      expect(error).toMatchObject({ message: expect.stringMatching(/cannot refresh OAuth WebSocket tickets/i) })
      expect(isGatewayReauthRequired(error)).toBe(false)
    })

    it('never returns the stale cached ticket on failure', async () => {
      const getGatewayWsUrl = vi.fn().mockRejectedValue(new Error('boom'))
      const result = await resolveGatewayWsUrl({ getGatewayWsUrl }, oauthConn).catch(() => 'threw')
      expect(result).toBe('threw')
      expect(result).not.toBe(oauthConn.wsUrl)
    })
  })

  describe('token / local mode', () => {
    it('uses the minted URL when available', async () => {
      const getGatewayWsUrl = vi.fn().mockResolvedValue('ws://host/api/ws?token=fresh')
      await expect(resolveGatewayWsUrl({ getGatewayWsUrl }, tokenConn)).resolves.toBe('ws://host/api/ws?token=fresh')
    })

    it('uses a structured refreshed token URL when available', async () => {
      const getGatewayWsUrl = vi.fn().mockResolvedValue({ ok: true, wsUrl: 'ws://host/api/ws?token=fresh' })

      await expect(resolveGatewayWsUrl({ getGatewayWsUrl }, tokenConn)).resolves.toBe('ws://host/api/ws?token=fresh')
    })

    it('falls back to the cached URL when minting fails (token is long-lived)', async () => {
      const getGatewayWsUrl = vi.fn().mockRejectedValue(new Error('transient'))
      await expect(resolveGatewayWsUrl({ getGatewayWsUrl }, tokenConn)).resolves.toBe(tokenConn.wsUrl)
    })

    it('falls back to the cached URL when the preload method is absent', async () => {
      await expect(resolveGatewayWsUrl({}, tokenConn)).resolves.toBe(tokenConn.wsUrl)
    })

    it('treats a missing authMode as non-oauth (falls back safely)', async () => {
      await expect(resolveGatewayWsUrl({}, { wsUrl: tokenConn.wsUrl })).resolves.toBe(tokenConn.wsUrl)
    })
  })
})

describe('isGatewayReauthRequired', () => {
  it('detects the dedicated error class', () => {
    expect(isGatewayReauthRequired(new GatewayReauthRequiredError('x'))).toBe(true)
  })

  it('detects plain objects tagged with needsOauthLogin (from the main process)', () => {
    expect(isGatewayReauthRequired({ needsOauthLogin: true })).toBe(true)
  })

  it('rejects generic errors', () => {
    expect(isGatewayReauthRequired(new Error('connection closed'))).toBe(false)
    expect(isGatewayReauthRequired(null)).toBe(false)
    expect(isGatewayReauthRequired('string')).toBe(false)
  })
})

describe('JsonRpcGatewayClient concurrent connect', () => {
  class DeferredSocket extends EventTarget {
    readyState: number = WebSocket.CONNECTING

    close() {
      this.readyState = WebSocket.CLOSED
      this.dispatchEvent(new Event('close'))
    }

    open() {
      this.readyState = WebSocket.OPEN
      this.dispatchEvent(new Event('open'))
    }
  }

  it('waits for the in-flight handshake instead of reporting a second connect as successful', async () => {
    const sockets: DeferredSocket[] = []
    const client = new JsonRpcGatewayClient({
      connectTimeoutMs: 1_000,
      socketFactory: () => {
        const socket = new DeferredSocket()
        sockets.push(socket)

        return socket as unknown as WebSocket
      }
    })

    const first = client.connect('wss://gateway.example.com/api/ws?ticket=first')
    const second = client.connect('wss://gateway.example.com/api/ws?ticket=second')
    let secondSettled = false
    void second.finally(() => {
      secondSettled = true
    })

    await Promise.resolve()
    expect(sockets).toHaveLength(1)
    expect(secondSettled).toBe(false)

    sockets[0].open()
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
  })

  it('rejects every waiter when a connecting socket closes and permits a real retry', async () => {
    const sockets: DeferredSocket[] = []
    const client = new JsonRpcGatewayClient({
      connectTimeoutMs: 1_000,
      socketFactory: () => {
        const socket = new DeferredSocket()
        sockets.push(socket)

        return socket as unknown as WebSocket
      }
    })

    const first = client.connect('wss://gateway.example.com/api/ws?ticket=first')
    const second = client.connect('wss://gateway.example.com/api/ws?ticket=second')
    client.close()

    const closed = await Promise.allSettled([first, second])
    expect(closed.map(result => result.status)).toEqual(['rejected', 'rejected'])

    const retry = client.connect('wss://gateway.example.com/api/ws?ticket=retry')
    expect(sockets).toHaveLength(2)
    sockets[1].open()
    await expect(retry).resolves.toBeUndefined()
  })
})
