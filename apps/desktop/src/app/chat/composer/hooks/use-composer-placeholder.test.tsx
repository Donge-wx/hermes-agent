import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const i18n = vi.hoisted(() => ({
  current: {
    locale: 'en',
    t: {
      composer: {
        followUpPlaceholders: ['Continue'],
        newSessionPlaceholders: ['What are we building?'],
        placeholderReconnecting: 'Reconnecting',
        placeholderStarting: 'Starting'
      }
    }
  }
}))

vi.mock('@/i18n', () => ({ useI18n: () => i18n.current }))

import { useComposerPlaceholder } from './use-composer-placeholder'

describe('useComposerPlaceholder', () => {
  beforeEach(() => {
    i18n.current = {
      locale: 'en',
      t: {
        composer: {
          followUpPlaceholders: ['Continue'],
          newSessionPlaceholders: ['What are we building?'],
          placeholderReconnecting: 'Reconnecting',
          placeholderStarting: 'Starting'
        }
      }
    }
  })

  it('replaces the resting placeholder when the interface locale changes', () => {
    const { result, rerender } = renderHook(() =>
      useComposerPlaceholder({ disabled: false, reconnecting: false, sessionId: null })
    )

    expect(result.current).toBe('What are we building?')

    act(() => {
      i18n.current = {
        locale: 'ar',
        t: {
          composer: {
            followUpPlaceholders: ['متابعة'],
            newSessionPlaceholders: ['ابدأ مهمة جديدة'],
            placeholderReconnecting: 'إعادة الاتصال',
            placeholderStarting: 'جار البدء'
          }
        }
      }
      rerender()
    })

    expect(result.current).toBe('ابدأ مهمة جديدة')
  })
})
