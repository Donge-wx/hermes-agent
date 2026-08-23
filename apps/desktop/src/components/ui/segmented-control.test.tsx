import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SegmentedControl } from './segmented-control'

describe('SegmentedControl', () => {
  it('exposes stable visual hooks without changing selection behavior', () => {
    // Given: a two-option appearance control.
    const onChange = vi.fn()

    const { container } = render(
      <SegmentedControl
        onChange={onChange}
        options={[
          { id: 'light', label: 'Light' },
          { id: 'dark', label: 'Dark' }
        ]}
        value="light"
      />
    )

    // When: the inactive option is selected.
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))

    // Then: the Liquid Glass theme can style the real control, and the same id
    // still flows through the existing callback.
    expect(container.querySelector('[data-slot="segmented-control"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-slot="segmented-control-option"]')).toHaveLength(2)
    expect(onChange).toHaveBeenCalledWith('dark')
  })
})
