import { describe, expect, it } from 'vitest'

import {
  employeeGatewayUrl,
  employeeIdFromGatewayUrl,
  normalizePastedGatewayUrl,
  oauthStatusMatchesInput
} from './gateway-remote-url'

describe('managed employee gateway helpers', () => {
  it('turns one employee id into its isolated company gateway', () => {
    expect(employeeGatewayUrl(' WangXuDong ')).toBe('https://wangxudong.wanyushudong.xyz')
    expect(employeeIdFromGatewayUrl('https://wangxudong.wanyushudong.xyz')).toBe('wangxudong')
  })

  it('rejects invalid DNS labels and unrelated hosts', () => {
    expect(employeeGatewayUrl('wang_xudong')).toBe('')
    expect(employeeGatewayUrl('-wangxudong')).toBe('')
    expect(employeeIdFromGatewayUrl('https://wangxudong.example.com')).toBe('')
  })
})

describe('normalizePastedGatewayUrl', () => {
  it('turns a pasted employee login page into its gateway base URL', () => {
    expect(normalizePastedGatewayUrl('https://weijia.example.com/login?next=%2F')).toBe('https://weijia.example.com')
    expect(normalizePastedGatewayUrl(' https://host.example.com/hermes/login/?next=%2Fhermes#form ')).toBe(
      'https://host.example.com/hermes'
    )
  })

  it('leaves non-login, partial, and non-http values untouched', () => {
    expect(normalizePastedGatewayUrl('https://host.example.com/login-help')).toBe('https://host.example.com/login-help')
    expect(normalizePastedGatewayUrl('https://host.example.com/log')).toBe('https://host.example.com/log')
    expect(normalizePastedGatewayUrl('not-yet-a-url')).toBe('not-yet-a-url')
    expect(normalizePastedGatewayUrl('file:///tmp/login')).toBe('file:///tmp/login')
  })
})

describe('oauthStatusMatchesInput', () => {
  it('does not reuse Wang login state for another employee URL', () => {
    const wangStatus = { checkedInput: 'https://wangxudong.example.com', connected: true }

    expect(oauthStatusMatchesInput(wangStatus, 'https://wangxudong.example.com')).toBe(true)
    expect(oauthStatusMatchesInput(wangStatus, 'https://weijia.example.com')).toBe(false)
  })

  it('matches the same trimmed input and rejects disconnected results', () => {
    expect(
      oauthStatusMatchesInput(
        { checkedInput: 'https://weijia.example.com', connected: true },
        '  https://weijia.example.com  '
      )
    ).toBe(true)
    expect(
      oauthStatusMatchesInput(
        { checkedInput: 'https://weijia.example.com', connected: false },
        'https://weijia.example.com'
      )
    ).toBe(false)
  })
})
