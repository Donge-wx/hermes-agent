import { describe, expect, it } from 'vitest'

import {
  acceptedMyKingDeepLinkSchemes,
  extractMyKingDeepLink,
  parseMyKingEnrollmentLink,
  selectMyKingDeepLinkProtocol,
  takeMyKingEnrollmentDeepLink
} from './deep-link-protocols'

describe('selectMyKingDeepLinkProtocol', () => {
  it('keeps Electron defaultApp runs off the public production scheme', () => {
    expect(selectMyKingDeepLinkProtocol(false, true)).toBe('myking-dev')
    expect(selectMyKingDeepLinkProtocol(true, false)).toBe('myking-dev')
    expect(selectMyKingDeepLinkProtocol(false, false)).toBe('myking')
  })
})

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

describe('takeMyKingEnrollmentDeepLink', () => {
  it('removes a cold-start enrollment code from relaunch and crash-report argv', () => {
    const argv = ['My King.exe', '--started-from-installer', 'myking://enroll?code=ABCD-2345-EFGH']

    expect(takeMyKingEnrollmentDeepLink(argv, ['myking'])).toBe('myking://enroll?code=ABCD-2345-EFGH')
    expect(argv).toEqual(['My King.exe', '--started-from-installer'])
    expect(JSON.stringify(argv)).not.toContain('ABCD-2345-EFGH')
  })

  it('leaves non-enrollment My King links available to the existing deep-link router', () => {
    const argv = ['My King.exe', 'myking://open/session/current']

    expect(takeMyKingEnrollmentDeepLink(argv, ['myking'])).toBeNull()
    expect(argv).toEqual(['My King.exe', 'myking://open/session/current'])
  })
})

describe('parseMyKingEnrollmentLink', () => {
  it('accepts the My King employee enrollment invitation shape', () => {
    expect(parseMyKingEnrollmentLink('myking://enroll?code=ABCD-2345-EFGH', ['myking'])).toEqual({
      code: 'ABCD-2345-EFGH'
    })
  })

  it.each([
    'myking://enroll?code=',
    'myking://enroll?code=too_short',
    'myking://enroll?code=ABC%20DEF',
    'myking://enroll?code=ABC.DEF.1234',
    'myking://open/enroll?code=ABCD-2345-EFGH',
    'https://third-party.test/enroll?code=ABCD-2345-EFGH'
  ])('rejects an invalid invitation before any request: %s', url => {
    expect(parseMyKingEnrollmentLink(url, ['myking'])).toBeNull()
  })
})
