const ENGLISH_PAIRING_COPY = {
  approve: "Approve",
  approved: "Approved",
  approvedUsers: "Approved users",
  clearAllConfirm: "Clear all pending pairing requests?",
  clearPending: "Clear pending",
  cleared: "Cleared pending requests",
  error: "Error",
  loadFailed: "Failed to load pairing requests",
  minutesAgo: "min ago",
  missingRequest: "Missing pairing request",
  noApproved: "No approved users",
  noPending: "No pending pairing requests",
  pendingRequests: "Pending requests",
  revoke: "Revoke",
  revokeAccess: "Revoke access",
  revokeDescription: "This user will lose access. This cannot be undone.",
  revoked: "Revoked",
} as const;

const CHINESE_PAIRING_COPY = {
  approve: "批准",
  approved: "已批准",
  approvedUsers: "已批准用户",
  clearAllConfirm: "清除全部待处理的配对请求？",
  clearPending: "清除待处理请求",
  cleared: "已清除待处理请求",
  error: "错误",
  loadFailed: "载入配对请求失败",
  minutesAgo: "分钟前",
  missingRequest: "配对请求信息不完整",
  noApproved: "暂无已批准用户",
  noPending: "暂无待处理的配对请求",
  pendingRequests: "待处理请求",
  revoke: "撤销",
  revokeAccess: "撤销访问权限",
  revokeDescription: "该用户将失去访问权限，此操作无法撤销。",
  revoked: "已撤销",
} as const;

export function getPairingCopy(locale: string) {
  return locale === "zh" ? CHINESE_PAIRING_COPY : ENGLISH_PAIRING_COPY;
}
