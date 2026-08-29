const ENGLISH_CHANNELS_COPY = {
  cancel: "Cancel",
  changesSaved: "Changes are saved. Restart the gateway for them to take effect.",
  close: "Close",
  configure: "Configure",
  configuredPrefix: "Configured",
  configuredSuffix: "message connections. Credentials are stored in",
  error: "Error",
  failedToRestart: "Failed to restart",
  failedToSave: "Failed to save",
  fieldRequired: "is required",
  fixFields: "Fix the highlighted fields before saving.",
  gatewayNotRunning: "The gateway is not running. Configure message connections here, then start it with",
  gatewayNotRunningSuffix: "or use the Restart button above.",
  gatewayRestarting: "Gateway restarting…",
  keepExisting: "Set — leave blank to keep the current value",
  nothingToSave: "Nothing to save — fill in at least one field.",
  restartGateway: "Restart gateway",
  restartNow: "Restart now",
  restarting: "Restarting…",
  saveAndEnable: "Save and enable",
  saved: "saved",
  saving: "Saving…",
  setupGuide: "Setup guide",
  test: "Test",
  state: {
    connected: "Connected",
    pending_restart: "Restart to apply",
    gateway_stopped: "Gateway stopped",
    startup_failed: "Start failed",
    disconnected: "Disconnected",
    not_configured: "Not configured",
    disabled: "Disabled",
    fatal: "Error",
  },
  platforms: {
    dingtalk: {
      name: "DingTalk",
      description: "Connect My King to DingTalk groups.",
    },
    feishu: {
      name: "Feishu / Lark",
      description: "Use My King inside Feishu / Lark.",
    },
    wecom: {
      name: "WeCom group bot",
      description: "Send messages to a WeCom group through a webhook.",
    },
    wecom_callback: {
      name: "WeCom app",
      description: "Two-way WeCom integration through a callback app.",
    },
    weixin: {
      name: "WeChat",
      description: "Connect a personal WeChat account through Tencent iLink Bot API.",
    },
  },
} as const;

const CHINESE_CHANNELS_COPY = {
  cancel: "取消",
  changesSaved: "更改已保存。重启网关后生效。",
  close: "关闭",
  configure: "配置",
  configuredPrefix: "已配置",
  configuredSuffix: "个消息连接。凭据保存在",
  error: "错误",
  failedToRestart: "重启失败",
  failedToSave: "保存失败",
  fieldRequired: "为必填项",
  fixFields: "请先修正标出的字段。",
  gatewayNotRunning: "网关当前未运行。请先在此配置消息连接，然后执行",
  gatewayNotRunningSuffix: "，或使用上方的“重启网关”按钮。",
  gatewayRestarting: "网关正在重启…",
  keepExisting: "已设置；留空将保留当前值",
  nothingToSave: "没有可保存的内容，请至少填写一项。",
  restartGateway: "重启网关",
  restartNow: "立即重启",
  restarting: "正在重启…",
  saveAndEnable: "保存并启用",
  saved: "已保存",
  saving: "正在保存…",
  setupGuide: "配置说明",
  test: "测试",
  state: {
    connected: "已连接",
    pending_restart: "重启后生效",
    gateway_stopped: "网关已停止",
    startup_failed: "启动失败",
    disconnected: "连接已断开",
    not_configured: "未配置",
    disabled: "未启用",
    fatal: "错误",
  },
  platforms: {
    dingtalk: {
      name: "钉钉",
      description: "将 My King 接入钉钉群。",
    },
    feishu: {
      name: "飞书",
      description: "在飞书中使用 My King。",
    },
    wecom: {
      name: "企业微信群机器人",
      description: "通过 Webhook 向企业微信群发送消息。",
    },
    wecom_callback: {
      name: "企业微信应用",
      description: "通过回调应用实现企业微信双向连接。",
    },
    weixin: {
      name: "微信",
      description: "通过腾讯 iLink Bot API 连接个人微信。",
    },
  },
} as const;

export type ManagedChannelId = keyof typeof CHINESE_CHANNELS_COPY.platforms;

export function getChannelsCopy(locale: string) {
  return locale === "zh" ? CHINESE_CHANNELS_COPY : ENGLISH_CHANNELS_COPY;
}

export function getManagedChannelPresentation(
  copy: ReturnType<typeof getChannelsCopy>,
  id: string,
) {
  switch (id) {
    case "dingtalk":
      return copy.platforms.dingtalk;
    case "feishu":
      return copy.platforms.feishu;
    case "wecom":
      return copy.platforms.wecom;
    case "wecom_callback":
      return copy.platforms.wecom_callback;
    case "weixin":
      return copy.platforms.weixin;
    default:
      return null;
  }
}
