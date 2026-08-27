import { describe, expect, it } from 'vitest'

import { installerCopy } from './i18n'

describe('My King bootstrap installer copy', () => {
  it('defaults to Simplified Chinese without consulting the host locale', () => {
    expect(installerCopy().welcome.install).toBe('开始安装')
    expect(installerCopy().progress.installing).toBe('正在准备 My King')
  })

  it('keeps an explicit English locale available for upstream compatibility', () => {
    expect(installerCopy('en-US').welcome.install).toBe('Install')
  })
})
