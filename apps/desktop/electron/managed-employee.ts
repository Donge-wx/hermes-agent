const MANAGED_EMPLOYEE_DOMAIN = 'wanyushudong.xyz'
const EMPLOYEE_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const RESERVED_EMPLOYEE_IDS = new Set(['admin'])

export interface ManagedEmployeeBinding {
  baseUrl: string
  employeeId: string
}

export interface ManagedEmployeeIdentity {
  user_id?: unknown
}

export interface ManagedEmployeeProfiles {
  profiles?: unknown
}

export interface ManagedEmployeeApiRequest {
  body?: unknown
  method?: unknown
  path?: unknown
  profile?: unknown
  [key: string]: unknown
}

export interface ManagedEmployeeSwitchState {
  identityChanged: boolean
  originEmployeeId: string | null
  targetEmployeeId: string
}

/**
 * Recognize a company employee gateway and return its canonical binding.
 *
 * A hostname below the managed domain is security-sensitive: malformed
 * variants are rejected instead of falling back to the unrestricted remote
 * gateway path. Non-company hosts return null and retain upstream behavior.
 */
export function managedEmployeeBindingFromGatewayUrl(rawUrl: unknown): ManagedEmployeeBinding | null {
  const value = String(rawUrl ?? '').trim()

  if (!value) {
    return null
  }

  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  const hostname = parsed.hostname.toLowerCase()
  const suffix = `.${MANAGED_EMPLOYEE_DOMAIN}`

  if (!hostname.endsWith(suffix)) {
    return null
  }

  const employeeId = hostname.slice(0, -suffix.length)

  if (!EMPLOYEE_ID_RE.test(employeeId) || employeeId.includes('.') || RESERVED_EMPLOYEE_IDS.has(employeeId)) {
    throw new Error('员工网关地址中的员工 ID 无效。')
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/')
  ) {
    throw new Error('员工网关必须使用 https://<员工ID>.wanyushudong.xyz 根地址。')
  }

  return {
    baseUrl: `https://${employeeId}.${MANAGED_EMPLOYEE_DOMAIN}`,
    employeeId
  }
}

/** Remove every stale per-profile route and bind the app to one employee. */
export function bindManagedEmployeeConnection(config: any, binding: ManagedEmployeeBinding) {
  return {
    ...(config && typeof config === 'object' ? config : {}),
    mode: 'remote',
    remote: {
      authMode: 'oauth',
      url: binding.baseUrl
    },
    profiles: {}
  }
}

/** Track save→login→apply as one switch without treating a same-employee save as a change. */
export function trackManagedEmployeeSwitch(
  current: ManagedEmployeeSwitchState | null,
  previous: ManagedEmployeeBinding | null,
  next: ManagedEmployeeBinding
): ManagedEmployeeSwitchState {
  const originEmployeeId = current ? current.originEmployeeId : (previous?.employeeId ?? null)

  return {
    identityChanged: Boolean(originEmployeeId && originEmployeeId !== next.employeeId),
    originEmployeeId,
    targetEmployeeId: next.employeeId
  }
}

export function enforceManagedEmployeeProfile(rawProfile: unknown, source = 'profile'): 'default' {
  if (rawProfile == null || (typeof rawProfile === 'string' && rawProfile.trim() === 'default')) {
    return 'default'
  }

  throw new Error(`员工版已拒绝访问其他员工 profile（${source}）。`)
}

/**
 * Validate both the authenticated principal and the server-visible profile
 * list. This prevents a wrong/shared cookie or a misrouted backend from being
 * accepted merely because its WebSocket is reachable.
 */
export function assertManagedEmployeeIdentity(
  binding: ManagedEmployeeBinding,
  identity: ManagedEmployeeIdentity,
  profilesBody: ManagedEmployeeProfiles
): string {
  const actualUser = typeof identity?.user_id === 'string' ? identity.user_id.trim() : ''

  if (actualUser !== binding.employeeId) {
    throw new Error(`员工身份不匹配：当前登录账号不是 ${binding.employeeId}，已拒绝连接。`)
  }

  const rawProfiles = Array.isArray(profilesBody?.profiles) ? profilesBody.profiles : []
  const visibleProfiles = rawProfiles
    .map(profile => {
      if (typeof profile === 'string') {
        return { isDefault: false, name: profile.trim() }
      }

      if (profile && typeof profile === 'object' && typeof (profile as any).name === 'string') {
        return {
          isDefault: (profile as any).is_default === true,
          name: (profile as any).name.trim()
        }
      }

      return null
    })
    .filter((profile): profile is { isDefault: boolean; name: string } => Boolean(profile?.name))

  if (visibleProfiles.length !== 1 || visibleProfiles[0].name !== 'default' || !visibleProfiles[0].isDefault) {
    throw new Error(`员工数据范围校验失败：网关未严格限定为 ${binding.employeeId}。`)
  }

  // The employee ID identifies the gateway principal, not a Desktop profile.
  // Every managed gateway must expose exactly one canonical `default` profile;
  // accepting an employee slug here would hide a legacy or misrouted backend.
  return 'default'
}

/**
 * Clamp every renderer REST request to the authenticated employee's sole
 * profile. This is the main-process trust boundary: renderer UI hiding alone
 * must not make cross-profile reads or profile mutations possible.
 */
export function enforceManagedEmployeeApiRequest(
  request: ManagedEmployeeApiRequest,
  _binding: ManagedEmployeeBinding,
  _canonicalProfile: unknown = 'default'
): ManagedEmployeeApiRequest {
  if (!request || typeof request !== 'object' || typeof request.path !== 'string' || !request.path.startsWith('/')) {
    throw new Error('员工版 API 请求地址无效。')
  }

  let parsed: URL

  try {
    parsed = new URL(request.path, 'https://employee.invalid')
  } catch {
    throw new Error('员工版 API 请求地址无效。')
  }

  if (parsed.origin !== 'https://employee.invalid' || !parsed.pathname.startsWith('/api/')) {
    throw new Error('员工版只允许访问当前员工网关的 API。')
  }

  const method = typeof request.method === 'string' ? request.method.trim().toUpperCase() || 'GET' : 'GET'
  const targetProfile = 'default'

  // The employee edition may inspect the sole server profile, but it cannot
  // create, rename, delete, activate, or address arbitrary profile resources.
  if (parsed.pathname === '/api/profiles') {
    if (method !== 'GET') {
      throw new Error('员工版不允许创建或修改 profile。')
    }
  } else if (parsed.pathname === '/api/profiles/active') {
    if (method !== 'GET') {
      throw new Error('员工版不允许切换 active profile。')
    }
  } else if (parsed.pathname === '/api/profiles/sessions') {
    if (method !== 'GET') {
      throw new Error('员工版 profile 会话接口只允许读取。')
    }
  } else if (parsed.pathname.startsWith('/api/profiles/')) {
    throw new Error('员工版不允许直接访问或修改 profile 资源。')
  }

  enforceManagedEmployeeProfile(request.profile, 'request.profile')
  enforceManagedEmployeeProfile(parsed.searchParams.get('profile'), 'query.profile')

  let body = request.body

  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.prototype.hasOwnProperty.call(body, 'profile')
  ) {
    const bodyRecord = body as Record<string, unknown>

    enforceManagedEmployeeProfile(bodyRecord.profile, 'body.profile')
    body = { ...bodyRecord, profile: targetProfile }
  }

  // All session endpoints are explicitly scoped, including list/search calls
  // that historically defaulted to `profile=all`.
  if (parsed.pathname === '/api/profiles/sessions' || parsed.pathname.startsWith('/api/sessions')) {
    parsed.searchParams.set('profile', targetProfile)
  } else if (parsed.searchParams.has('profile')) {
    parsed.searchParams.set('profile', targetProfile)
  }

  return {
    ...request,
    body,
    method,
    path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    profile: targetProfile
  }
}

export { EMPLOYEE_ID_RE, MANAGED_EMPLOYEE_DOMAIN }
