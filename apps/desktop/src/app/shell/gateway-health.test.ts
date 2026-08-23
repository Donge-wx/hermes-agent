import { describe, expect, it } from 'vitest'

import { gatewayHealthDetail } from './gateway-health'

const copy = {
  connected: 'Connected',
  connecting: 'Connecting',
  needsSetup: 'Needs setup',
  offline: 'Offline',
  ready: 'Ready'
}

describe('gatewayHealthDetail', () => {
  it('reports an open gateway as connected while inference readiness is pending', () => {
    // Given: the live WebSocket is open but the optional inference check has not settled.
    // When: status-bar copy is resolved.
    // Then: gateway connectivity is not mislabeled as an endless check.
    expect(gatewayHealthDetail('open', null, copy)).toBe('Connected')
  })

  it('preserves ready, setup, connecting, and offline distinctions', () => {
    expect(gatewayHealthDetail('open', true, copy)).toBe('Ready')
    expect(gatewayHealthDetail('open', false, copy)).toBe('Needs setup')
    expect(gatewayHealthDetail('connecting', null, copy)).toBe('Connecting')
    expect(gatewayHealthDetail('closed', null, copy)).toBe('Offline')
  })
})
