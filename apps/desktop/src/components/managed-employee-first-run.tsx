import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { employeeIdFromGatewayUrl } from '@/app/settings/gateway-remote-url'
import { SETTINGS_ROUTE } from '@/app/routes'
import { IS_VANYUE_MANAGED_RELEASE } from '@/lib/managed-release'

/**
 * Send a fresh managed install straight to its in-app employee-ID form.
 *
 * The external configurator used to write connection.json before launch. The
 * managed desktop now owns that first-run step, while the main process remains
 * the trust boundary that validates and canonicalizes the employee gateway.
 */
export function ManagedEmployeeFirstRun() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!IS_VANYUE_MANAGED_RELEASE || location.pathname === SETTINGS_ROUTE) {
      return
    }

    const desktop = window.hermesDesktop

    if (!desktop?.getConnectionConfig) {
      return
    }

    let cancelled = false

    void desktop
      .getConnectionConfig()
      .then(config => {
        if (!cancelled && !employeeIdFromGatewayUrl(config.remoteUrl)) {
          navigate(`${SETTINGS_ROUTE}?tab=gateway`, { replace: true })
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [location.pathname, navigate])

  return null
}
