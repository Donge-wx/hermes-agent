import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HermesGateway } from '@/hermes'
import { $gateway } from '@/store/gateway'
import { registerGatewayReconnect } from '@/store/gateway-reconnect'

import { useGatewayRequest } from './use-gateway-request'

const fakeGateway = { connectionState: 'open' } as unknown as HermesGateway
const reconnectDisposers: Array<() => void> = []

afterEach(() => {
  while (reconnectDisposers.length > 0) {
    reconnectDisposers.pop()?.()
  }

  $gateway.set(null)
  vi.restoreAllMocks()
})

describe('useGatewayRequest', () => {
  // The composer's `/` completions only exist when ChatBar receives a non-null
  // gateway PROP. `gatewayRef` is populated by a subscription effect, so it is
  // still null on the first render — a surface that read the ref while
  // rendering (session tiles / ⌘T tabs) shipped `gateway={null}` and silently
  // lost slash completions. The returned `gateway` value must be live
  // immediately so that never happens again.
  it('exposes the live gateway on the first render, before effects run', () => {
    $gateway.set(fakeGateway)

    const { result } = renderHook(() => useGatewayRequest())

    expect(result.current.gateway).toBe(fakeGateway)
  })

  it('tracks the gateway when the active socket changes', () => {
    const { result } = renderHook(() => useGatewayRequest())

    expect(result.current.gateway).toBeNull()

    act(() => $gateway.set(fakeGateway))

    expect(result.current.gateway).toBe(fakeGateway)
  })

  it('coalesces concurrent primary request recovery into one ticket mint and connect', async () => {
    let connected = false
    const mintTicket = vi.fn(async () => 'wss://gateway.example.com/api/ws?ticket=fresh')
    const connect = vi.fn(async (_wsUrl: string) => {
      connected = true
    })
    const request = vi.fn(async () => {
      if (!connected) {
        throw new Error('My King gateway connection closed')
      }

      return 'ok'
    })
    const gateway = {
      connect,
      get connectionState() {
        return connected ? 'open' : 'closed'
      },
      request
    } as unknown as HermesGateway
    $gateway.set(gateway)

    const reconnect = vi.fn(async () => {
      const wsUrl = await mintTicket()
      await connect(wsUrl)
    })
    reconnectDisposers.push(registerGatewayReconnect(reconnect))

    const first = renderHook(() => useGatewayRequest())
    const second = renderHook(() => useGatewayRequest())

    await expect(
      Promise.all([
        first.result.current.requestGateway('ping'),
        second.result.current.requestGateway('ping')
      ])
    ).resolves.toEqual(['ok', 'ok'])
    expect(reconnect).toHaveBeenCalledOnce()
    expect(mintTicket).toHaveBeenCalledOnce()
    expect(connect).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('propagates reauthentication required by the shared primary reconnect', async () => {
    const reauthError = Object.assign(new Error('Gateway session expired'), { needsOauthLogin: true })
    const gateway = {
      connectionState: 'closed',
      request: vi.fn(async () => {
        throw new Error('My King gateway connection closed')
      })
    } as unknown as HermesGateway
    reconnectDisposers.push(
      registerGatewayReconnect(async () => {
        throw reauthError
      })
    )
    $gateway.set(gateway)

    const { result } = renderHook(() => useGatewayRequest())

    await expect(result.current.requestGateway('ping')).rejects.toBe(reauthError)
  })
})
