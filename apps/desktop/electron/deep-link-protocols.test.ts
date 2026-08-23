import { describe, expect, it } from 'vitest'

import { acceptedMyKingDeepLinkSchemes, extractMyKingDeepLink } from './deep-link-protocols'

describe('acceptedMyKingDeepLinkSchemes', () => {
  it('accepts only the public My King scheme in production', () => {
    expect(acceptedMyKingDeepLinkSchemes(false)).toEqual(['myking'])
  })

  it('adds only the isolated My King development scheme in development', () => {
    expect(acceptedMyKingDeepLinkSchemes(true)).toEqual(['myking-dev', 'myking'])
  })
})

describe('extractMyKingDeepLink', () => {
  it('rejects original Hermes links while preserving My King links', () => {
    const schemes = acceptedMyKingDeepLinkSchemes(false)

    expect(extractMyKingDeepLink(['Hermes', 'hermes://open/session/original'], schemes)).toBeNull()
    expect(extractMyKingDeepLink(['My King', 'myking://open/session/current'], schemes)).toBe(
      'myking://open/session/current'
    )
  })
})
