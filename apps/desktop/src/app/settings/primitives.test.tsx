import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CircleIcon } from '@/lib/icons'

import { ListRow, SectionHeading, SettingsContent } from './primitives'

describe('settings primitives', () => {
  it('name the shared settings regions for theme-scoped presentation', () => {
    // Given: a representative settings section and row.
    const { container } = render(
      <SettingsContent>
        <SectionHeading icon={CircleIcon} title="Appearance" />
        <ListRow description="Choose a visual style" title="Theme" />
      </SettingsContent>
    )

    // When: a theme inspects the reusable DOM contract.
    const content = container.querySelector('[data-slot="settings-content"]')
    const heading = container.querySelector('[data-slot="settings-section-heading"]')
    const row = container.querySelector('[data-slot="settings-row"]')

    // Then: it can style the primitives without relying on utility-class text.
    expect(content).not.toBeNull()
    expect(heading).not.toBeNull()
    expect(row?.querySelector('[data-slot="settings-row-title"]')?.textContent).toBe('Theme')
    expect(row?.querySelector('[data-slot="settings-row-description"]')?.textContent).toBe('Choose a visual style')
  })
})
