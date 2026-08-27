export function visibleManagedMessagingPlatforms<T extends { readonly id: string }>(
  platforms: readonly T[],
): T[] {
  const visibleIds = new Set([
    "dingtalk",
    "feishu",
    "wecom",
    "wecom_callback",
    "weixin",
  ]);
  return platforms.filter(({ id }) => visibleIds.has(id));
}

export function visibleManagedDashboardPlugins<
  T extends { readonly name: string },
>(plugins: readonly T[]): T[] {
  return plugins.filter(({ name }) => name !== "hermes-achievements");
}
