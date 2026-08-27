const ENGLISH_SESSIONS_COPY = {
  cancelRename: "Cancel rename",
  exportFailed: "Failed to export session",
  exportSession: "Export session",
  exportSessionJson: "Export session JSON",
  local: "local",
  pruneFailed: "Failed to prune sessions",
  renameFailed: "Failed to rename session",
  renamed: "Session renamed",
  renameSession: "Rename session",
  saveTitle: "Save title",
  sessionTitle: "Session title",
  validDays: "Enter a valid number of days",
} as const;

const CHINESE_SESSIONS_COPY = {
  cancelRename: "取消重命名",
  exportFailed: "导出会话失败",
  exportSession: "导出会话",
  exportSessionJson: "导出会话 JSON",
  local: "本地",
  pruneFailed: "清理会话失败",
  renameFailed: "重命名会话失败",
  renamed: "会话已重命名",
  renameSession: "重命名会话",
  saveTitle: "保存标题",
  sessionTitle: "会话标题",
  validDays: "请输入有效的天数",
} as const;

export function getSessionsCopy(locale: string) {
  return locale === "zh" ? CHINESE_SESSIONS_COPY : ENGLISH_SESSIONS_COPY;
}
