interface GatewayHealthCopy {
  readonly connected: string
  readonly connecting: string
  readonly needsSetup: string
  readonly offline: string
  readonly ready: string
}

export function gatewayHealthDetail(
  gatewayState: string,
  inferenceReady: boolean | null,
  copy: GatewayHealthCopy
): string {
  if (gatewayState === 'open') {
    if (inferenceReady === true) {
      return copy.ready
    }

    return inferenceReady === false ? copy.needsSetup : copy.connected
  }

  return gatewayState === 'connecting' ? copy.connecting : copy.offline
}
