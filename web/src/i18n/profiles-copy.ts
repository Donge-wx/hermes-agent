const ENGLISH_PROFILES_COPY = {
  modelSaveFailed:
    "The profile was created, but its model could not be saved. Set the model in the profile editor.",
} as const;

const CHINESE_PROFILES_COPY = {
  modelSaveFailed: "配置已创建，但模型未能保存。请在配置编辑器中重新设置模型。",
} as const;

export function getProfilesCopy(locale: string) {
  return locale === "zh" ? CHINESE_PROFILES_COPY : ENGLISH_PROFILES_COPY;
}
