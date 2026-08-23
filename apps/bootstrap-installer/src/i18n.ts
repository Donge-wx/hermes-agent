export type InstallerCopy = typeof EN

const EN = {
  welcome: {
    description: 'My King grows with you. We will finish setup in the background in a few minutes.',
    install: 'Install'
  },
  progress: {
    done: 'Done',
    updating: 'Updating My King',
    installing: 'Setting up My King',
    updateDescription: 'My King is updating to the latest version. This only takes a moment.',
    installDescription:
      'One-time setup is downloading dependencies and configuring this Mac. Future launches skip this step.',
    steps: (done: number, total: number) => `${done} of ${total} steps complete`,
    liveOutput: 'Live output',
    lines: (count: number) => `${count} lines`,
    hideDetails: 'Hide details',
    showDetails: 'Show details',
    cancel: 'Cancel'
  },
  success: {
    title: 'My King is ready',
    description: 'Launch from here, or later with the compatible command',
    compatibility: 'Command-line compatibility entry',
    launching: 'Launching',
    launch: 'Launch',
    failed: 'Could not launch the desktop app'
  },
  failure: {
    updateTitle: 'Update did not finish',
    installTitle: 'Install did not finish',
    updateFallback: 'Something went wrong during the update.',
    installFallback: 'Something went wrong during installation.',
    retryUpdate: 'Retry update',
    retryInstall: 'Retry install',
    openLogs: 'Open logs',
    log: 'Log'
  },
  stages: {} as Record<string, string>
}

const ZH: InstallerCopy = {
  welcome: { description: 'My King 会与你一同成长。我们将在后台完成配置，通常只需几分钟。', install: '开始安装' },
  progress: {
    done: '已完成',
    updating: '正在更新 My King',
    installing: '正在设置 My King',
    updateDescription: '正在将 My King 更新到最新版本，通常只需片刻。',
    installDescription: '首次设置正在下载依赖并配置这台 Mac，之后启动会自动跳过此步骤。',
    steps: (done, total) => `已完成 ${done}/${total} 个步骤`,
    liveOutput: '实时输出',
    lines: count => `${count} 行`,
    hideDetails: '收起详情',
    showDetails: '查看详情',
    cancel: '取消'
  },
  success: {
    title: 'My King 已准备就绪',
    description: '你可以现在启动，也可以稍后通过兼容命令启动',
    compatibility: '命令行兼容入口',
    launching: '正在启动',
    launch: '启动 My King',
    failed: '无法启动桌面应用'
  },
  failure: {
    updateTitle: '更新未完成',
    installTitle: '安装未完成',
    updateFallback: '更新过程中发生了错误。',
    installFallback: '安装过程中发生了错误。',
    retryUpdate: '重试更新',
    retryInstall: '重试安装',
    openLogs: '打开日志',
    log: '日志'
  },
  stages: {
    'system-packages': '系统组件',
    uv: 'Python 包管理器',
    python: 'Python 环境',
    repo: 'My King 核心组件',
    dependencies: '运行依赖',
    node: 'Node 运行环境',
    desktop: '桌面应用',
    handoff: '准备更新',
    update: '下载最新版本',
    rebuild: '重建桌面应用',
    install: '安装更新'
  }
}

export function installerCopy(language = typeof navigator === 'undefined' ? 'en' : navigator.language): InstallerCopy {
  return language.toLowerCase().startsWith('zh') ? ZH : EN
}

export const copy = installerCopy()
