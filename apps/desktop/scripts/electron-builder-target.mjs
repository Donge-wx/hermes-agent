const TARGET_FLAGS = [
  { flag: '--mac', platform: 'darwin' },
  { flag: '--win', platform: 'win32' },
  { flag: '--linux', platform: 'linux' }
]

export function shouldUseLocalElectronDist(hostPlatform, cliArgs) {
  const requested = TARGET_FLAGS.find(({ flag }) => cliArgs.some(arg => arg === flag || arg.startsWith(`${flag}=`)))

  return requested ? requested.platform === hostPlatform : true
}

export function myKingEmployeeArtifactName(env = process.env) {
  const employeeBuild = Boolean(
    String(env.MYKING_EMPLOYEE_ENROLLMENT_BASE_URL || '').trim() ||
      String(env.MYKING_MANAGED_EMPLOYEE_GATEWAY_URL || '').trim()
  )

  return employeeBuild ? 'My-King-Employee-Setup-${arch}.${ext}' : null
}
