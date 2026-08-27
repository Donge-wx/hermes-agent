// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CapRow, DetailColumn, ListColumn, ListStrip } from './master-detail'

afterEach(cleanup)

describe('master-detail Liquid Glass presentation hooks', () => {
  it('exposes stable slots for list controls, detail content, and capability row hierarchy', () => {
    const { container } = render(
      <div>
        <ListColumn header={<ListStrip left="排序" right="更多" />}>列表</ListColumn>
        <DetailColumn actionBar="保存" footer="更改应用于新会话">
          详情
        </DetailColumn>
        <CapRow
          active
          enabled
          meta="12"
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          subtitle="办公效率"
          title="文件处理"
          toggleLabel="启用文件处理"
        />
      </div>
    )

    expect(container.querySelector('[data-slot="master-list-strip"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="detail-column-content"]')?.textContent).toContain('详情')
    expect(container.querySelector('[data-slot="detail-column-footer"]')?.textContent).toContain('更改应用于新会话')
    expect(container.querySelector('[data-slot="detail-column-action-bar"]')?.textContent).toContain('保存')
    expect(container.querySelector('[data-slot="cap-row-title"]')?.textContent).toBe('文件处理')
    expect(container.querySelector('[data-slot="cap-row-subtitle"]')?.textContent).toBe('办公效率')
    expect(container.querySelector('[data-slot="cap-row-meta"]')?.textContent).toBe('12')
  })
})
