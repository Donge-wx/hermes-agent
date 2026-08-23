import { describe, expect, it } from 'vitest'

import { INSTALLER_BRAND } from './brand'

describe('installer brand', () => {
  it('uses the approved public identity while compatibility stays outside the renderer contract', () => {
    expect(INSTALLER_BRAND).toEqual({
      accessibleName: 'My King — AI WROK OS',
      name: 'My King',
      tagline: 'AI WROK OS'
    })
  })
})
