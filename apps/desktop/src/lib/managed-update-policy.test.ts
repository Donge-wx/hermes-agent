import { describe, expect, it } from 'vitest'

import { managedUpdatesDisabledResult } from './managed-update-policy'

describe('managedUpdatesDisabledResult', () => {
  it('returns the stable fail-closed response for renderer update requests', () => {
    // Given a renderer update path denied by the managed deployment policy.
    // When the policy constructs its response.
    const result = managedUpdatesDisabledResult()

    // Then callers receive the shared, user-readable denial contract.
    expect(result).toEqual({
      error: 'updates-disabled',
      message: 'Updates are managed by your administrator.',
      ok: false
    })
  })
})
