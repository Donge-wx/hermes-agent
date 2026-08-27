import fs from 'node:fs'
import path from 'node:path'

function requireFile(candidate, label) {
  if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing ${label}: ${candidate}`)
  }
}

/** Copy the already-built managed dashboard into the sealed Python payload. */
export function stageManagedDashboardAssets({ repoRoot, backendRoot }) {
  const sourceWebDist = path.join(repoRoot, 'hermes_cli', 'web_dist')
  const sourceAuthAssets = path.join(repoRoot, 'web', 'public', 'assets')
  const bundledHermesCli = path.join(backendRoot, 'hermes_cli')

  requireFile(path.join(sourceWebDist, 'index.html'), 'built dashboard entry point')
  requireFile(
    path.join(sourceWebDist, 'assets', 'my-king-lockup.png'),
    'built dashboard brand asset'
  )
  requireFile(path.join(sourceAuthAssets, 'my-king-lockup.png'), 'My King login brand asset')

  fs.cpSync(sourceWebDist, path.join(bundledHermesCli, 'web_dist'), {
    recursive: true,
    dereference: false
  })
  fs.cpSync(sourceAuthAssets, path.join(bundledHermesCli, 'dashboard_auth', 'assets'), {
    recursive: true,
    dereference: false
  })
}
