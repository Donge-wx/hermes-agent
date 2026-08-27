const ENGLISH_CONFIG_FIELD_COPY = {
  commaSeparatedValues: "Separate multiple values with commas",
  item: (index: number) => `Item ${index}`,
  none: "None",
} as const;

const CHINESE_CONFIG_FIELD_COPY = {
  commaSeparatedValues: "多个值请用英文逗号分隔",
  item: (index: number) => `第 ${index} 项`,
  none: "无",
} as const;

export function getConfigFieldCopy(locale: string) {
  return locale === "zh" ? CHINESE_CONFIG_FIELD_COPY : ENGLISH_CONFIG_FIELD_COPY;
}
