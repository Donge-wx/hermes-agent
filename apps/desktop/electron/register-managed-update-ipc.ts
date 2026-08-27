import {
  managedUpdateBranch,
  managedUpdateBranchChangeDenied,
  managedUpdateCheckDenied,
  type ManagedUpdateConfig,
  managedUpdateDenied
} from './managed-update-ipc'

export type ManagedUpdateIpcHandler = (_event: unknown, ...args: readonly unknown[]) => unknown

type IpcMainRegistrar = {
  readonly handle: (channel: string, handler: ManagedUpdateIpcHandler) => void
}

type ManagedUpdateIpcDependencies = {
  readonly ipcMain: IpcMainRegistrar
  readonly now: () => number
  readonly readConfig: () => ManagedUpdateConfig
}

/** Registers the employee-build update policy at Electron's IPC trust boundary. */
export function registerManagedUpdateIpc({
  ipcMain,
  now,
  readConfig
}: ManagedUpdateIpcDependencies): void {
  ipcMain.handle('hermes:updates:check', () => managedUpdateCheckDenied(readConfig(), now()))
  ipcMain.handle('hermes:updates:apply', () => managedUpdateDenied())
  ipcMain.handle('hermes:updates:branch:get', () => managedUpdateBranch(readConfig()))
  ipcMain.handle('hermes:updates:branch:set', () => managedUpdateBranchChangeDenied(readConfig()))
}
