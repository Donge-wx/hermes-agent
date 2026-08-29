/**
 * Tests for electron/desktop-uninstall.ts.
 *
 * Run with: node --test electron/desktop-uninstall.test.ts
 * (Wired into npm test:desktop:platforms in package.json.)
 *
 * These are the pure helpers behind the desktop Chat GUI uninstaller: the
 * mode → CLI-flag mapping, the running-app-bundle resolution per OS, and the
 * cleanup-script builders (POSIX + Windows).
 */

import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  buildPosixCleanupScript,
  buildWindowsCleanupScript,
  modeRemovesAgent,
  modeRemovesUserData,
  resolveRemovableAppPath,
  shouldRemoveAppBundle,
  UNINSTALL_MODES,
  uninstallArgsForMode
} from './desktop-uninstall'

// --- uninstallArgsForMode ---

test('uninstallArgsForMode maps each mode to the module-runner argv', () => {
  assert.deepEqual(uninstallArgsForMode('gui'), ['-m', 'hermes_cli.uninstall', '--mode', 'gui'])
  assert.deepEqual(uninstallArgsForMode('lite'), ['-m', 'hermes_cli.uninstall', '--mode', 'lite'])
  assert.deepEqual(uninstallArgsForMode('full'), ['-m', 'hermes_cli.uninstall', '--mode', 'full'])
})

test('uninstallArgsForMode throws on an unknown mode (no silent full wipe)', () => {
  assert.throws(() => uninstallArgsForMode('nuke'), /Unknown uninstall mode/)
  assert.throws(() => uninstallArgsForMode(''), /Unknown uninstall mode/)
})

test('UNINSTALL_MODES lists exactly the three supported modes', () => {
  assert.deepEqual([...UNINSTALL_MODES].sort(), ['full', 'gui', 'lite'])
})

// --- modeRemovesAgent / modeRemovesUserData ---

test('mode predicates classify what each mode removes', () => {
  assert.equal(modeRemovesAgent('gui'), false)
  assert.equal(modeRemovesAgent('lite'), true)
  assert.equal(modeRemovesAgent('full'), true)

  assert.equal(modeRemovesUserData('gui'), false)
  assert.equal(modeRemovesUserData('lite'), false)
  assert.equal(modeRemovesUserData('full'), true)
})

// --- resolveRemovableAppPath ---

test('resolveRemovableAppPath finds only the My King .app bundle on macOS', () => {
  assert.equal(
    resolveRemovableAppPath('/Applications/My King.app/Contents/MacOS/My King', 'darwin'),
    '/Applications/My King.app'
  )
  assert.equal(
    resolveRemovableAppPath('/Users/x/Applications/My King.app/Contents/MacOS/My King', 'darwin'),
    '/Users/x/Applications/My King.app'
  )
})

test('resolveRemovableAppPath refuses Hermes, other apps, and a mismatched executable on macOS', () => {
  assert.equal(resolveRemovableAppPath('/Applications/Hermes.app/Contents/MacOS/Hermes', 'darwin'), null)
  assert.equal(resolveRemovableAppPath('/Applications/Other.app/Contents/MacOS/Other', 'darwin'), null)
  assert.equal(resolveRemovableAppPath('/Applications/My King.app/Contents/MacOS/Hermes', 'darwin'), null)
  assert.equal(resolveRemovableAppPath('/Applications/My King.app/Contents/Helpers/My King', 'darwin'), null)
})

test('resolveRemovableAppPath refuses Electron.app development runs', () => {
  // A generic Electron.app has no My King identity and must not become an
  // uninstall target even before the packaged-app safety gate runs.
  assert.equal(
    resolveRemovableAppPath('/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron', 'darwin'),
    null
  )
  assert.equal(shouldRemoveAppBundle(false, null), false)
  // A bare path with no .app ancestor → null.
  assert.equal(resolveRemovableAppPath('/usr/bin/electron', 'darwin'), null)
})

test('resolveRemovableAppPath finds the My King install dir on Windows', () => {
  assert.equal(
    resolveRemovableAppPath('C:\\Users\\x\\AppData\\Local\\Programs\\My King\\My-King.exe', 'win32'),
    'C:\\Users\\x\\AppData\\Local\\Programs\\My King'
  )
  assert.equal(
    resolveRemovableAppPath('C:\\Users\\x\\AppData\\Local\\Programs\\My-King\\My-King.exe', 'win32'),
    'C:\\Users\\x\\AppData\\Local\\Programs\\My-King'
  )
})

test('resolveRemovableAppPath never treats a Hermes executable as a My King uninstall target', () => {
  assert.equal(
    resolveRemovableAppPath('C:\\Users\\x\\AppData\\Local\\Programs\\Hermes\\Hermes.exe', 'win32'),
    null
  )
  assert.equal(
    resolveRemovableAppPath('C:\\Users\\x\\AppData\\Local\\hermes-desktop\\Hermes.exe', 'win32'),
    null
  )
  assert.equal(
    resolveRemovableAppPath('C:\\Users\\x\\AppData\\Local\\Programs\\My King\\Hermes.exe', 'win32'),
    null
  )
})

test('resolveRemovableAppPath returns null for an unrecognized Windows dir', () => {
  assert.equal(resolveRemovableAppPath('C:\\Temp\\foo\\Hermes.exe', 'win32'), null)
})

test('resolveRemovableAppPath uses APPIMAGE on Linux when set', () => {
  assert.equal(
    resolveRemovableAppPath('/tmp/.mount_MyKingXXXX/my-king', 'linux', { APPIMAGE: '/home/x/Apps/My-King-0.17.0-linux-x64.AppImage' }),
    '/home/x/Apps/My-King-0.17.0-linux-x64.AppImage'
  )
})

test('resolveRemovableAppPath finds the unpacked dir on Linux', () => {
  assert.equal(resolveRemovableAppPath('/opt/my-king/linux-unpacked/my-king', 'linux', {}), '/opt/my-king/linux-unpacked')
  // A system-package install (/usr/bin) → null, left to apt/dnf.
  assert.equal(resolveRemovableAppPath('/usr/bin/my-king', 'linux', {}), null)
})

test('resolveRemovableAppPath refuses Hermes-shaped Linux paths', () => {
  assert.equal(
    resolveRemovableAppPath('/tmp/.mount_HermesXXXX/hermes', 'linux', { APPIMAGE: '/home/x/Apps/Hermes.AppImage' }),
    null
  )
  assert.equal(resolveRemovableAppPath('/opt/hermes/linux-unpacked/hermes', 'linux', {}), null)
})

test('resolveRemovableAppPath returns null for an empty exe path', () => {
  assert.equal(resolveRemovableAppPath('', 'darwin'), null)
  assert.equal(resolveRemovableAppPath(null, 'win32'), null)
})

// --- shouldRemoveAppBundle ---

test('shouldRemoveAppBundle requires packaged AND a resolved path', () => {
  assert.equal(shouldRemoveAppBundle(true, '/Applications/Hermes.app'), true)
  assert.equal(shouldRemoveAppBundle(false, '/Applications/Hermes.app'), false)
  assert.equal(shouldRemoveAppBundle(true, null), false)
  assert.equal(shouldRemoveAppBundle(false, null), false)
})

// --- buildPosixCleanupScript ---

test('buildPosixCleanupScript waits for the PID, runs the uninstall module, removes only the My King bundle', () => {
  const script = buildPosixCleanupScript({
    desktopPid: 4321,
    pythonExe: '/home/x/.hermes/hermes-agent/venv/bin/python',
    pythonPath: null,
    agentRoot: '/home/x/.hermes/hermes-agent',
    uninstallArgs: ['-m', 'hermes_cli.uninstall', '--mode', 'gui'],
    appPath: '/Applications/My King.app',
    hermesHome: '/home/x/.hermes'
  })

  assert.match(script, /^#!\/bin\/bash/)
  assert.match(script, /pid=4321/)
  assert.match(script, /kill -0 "\$pid"/)
  // bounded wait (~30s), not unbounded
  assert.match(script, /seq 1 60/)
  assert.match(script, /'-m' 'hermes_cli\.uninstall' '--mode' 'gui'/)
  assert.match(script, /rm -rf '\/Applications\/My King\.app'/)
  assert.doesNotMatch(script, /Hermes\.app/)
  assert.match(script, /export HERMES_HOME='\/home\/x\/\.hermes'/)
})

test('buildPosixCleanupScript exports PYTHONPATH when pythonPath is set (lite/full)', () => {
  const script = buildPosixCleanupScript({
    desktopPid: 1,
    pythonExe: '/usr/bin/python3',
    pythonPath: '/home/x/.hermes/hermes-agent',
    agentRoot: '/home/x/.hermes/hermes-agent',
    uninstallArgs: ['-m', 'hermes_cli.uninstall', '--mode', 'full'],
    appPath: null,
    hermesHome: '/home/x/.hermes'
  })

  // System python + source on PYTHONPATH so import hermes_cli works while the
  // venv is torn down.
  assert.match(script, /export PYTHONPATH='\/home\/x\/\.hermes\/hermes-agent'/)
  assert.match(script, /'\/usr\/bin\/python3' '-m' 'hermes_cli\.uninstall' '--mode' 'full'/)
})

test('buildPosixCleanupScript omits PYTHONPATH when pythonPath is null (gui)', () => {
  const script = buildPosixCleanupScript({
    desktopPid: 1,
    pythonExe: '/p/python',
    pythonPath: null,
    agentRoot: '/a',
    uninstallArgs: ['-m', 'hermes_cli.uninstall', '--mode', 'gui'],
    appPath: null,
    hermesHome: '/h'
  })

  assert.doesNotMatch(script, /export PYTHONPATH/)
})

test('buildPosixCleanupScript omits the bundle rm when appPath is null', () => {
  const script = buildPosixCleanupScript({
    desktopPid: 1,
    pythonExe: '/p/python',
    pythonPath: null,
    agentRoot: '/a',
    uninstallArgs: ['-m', 'hermes_cli.uninstall', '--mode', 'lite'],
    appPath: null,
    hermesHome: '/h'
  })

  assert.doesNotMatch(script, /rm -rf '\//)
  // Still runs the uninstall.
  assert.match(script, /'-m' 'hermes_cli\.uninstall' '--mode' 'lite'/)
})

test('buildPosixCleanupScript single-quote-escapes paths with apostrophes', () => {
  const script = buildPosixCleanupScript({
    desktopPid: 1,
    pythonExe: "/home/o'brien/python",
    pythonPath: null,
    agentRoot: '/a',
    uninstallArgs: ['-m', 'hermes_cli.uninstall', '--mode', 'gui'],
    appPath: null,
    hermesHome: '/h'
  })

  // The apostrophe is closed-escaped-reopened so the shell sees the literal.
  assert.match(script, /'\/home\/o'\\''brien\/python'/)
})

// --- buildWindowsCleanupScript ---

test('buildWindowsCleanupScript waits (bounded) for PID, runs uninstall, rmdir bundle', () => {
  const script = buildWindowsCleanupScript({
    desktopPid: 9988,
    pythonExe: 'C:\\Python313\\python.exe',
    pythonPath: 'C:\\hermes',
    agentRoot: 'C:\\hermes',
    uninstallArgs: ['-m', 'hermes_cli.uninstall', '--mode', 'full'],
    appPath: 'C:\\Users\\x\\AppData\\Local\\Programs\\My King',
    hermesHome: 'C:\\Users\\x\\AppData\\Local\\my-king'
  })

  assert.match(script, /@echo off/)
  assert.match(script, /set "PID=9988"/)
  // PYTHONPATH set so a system python can import hermes_cli from source.
  assert.match(script, /set "PYTHONPATH=C:\\hermes;%PYTHONPATH%"/)
  assert.match(script, /"C:\\Python313\\python.exe" "-m" "hermes_cli\.uninstall" "--mode" "full"/)
  // Bounded wait-loop (no infinite loop), whole-token PID match (no substring).
  assert.match(script, /if %waited% geq 60 goto waited_done/)
  assert.match(script, /findstr \/r \/c:" %PID% "/)
  assert.doesNotMatch(script, /find "%PID%"/) // the old substring-prone form is gone
  // Removal is a retry loop (Windows releases dir handles lazily).
  assert.match(script, /:rmloop/)
  assert.match(script, /rmdir \/s \/q "C:\\Users\\x\\AppData\\Local\\Programs\\My King" >nul 2>&1/)
  assert.doesNotMatch(script, /Programs\\Hermes/)
  assert.match(script, /if %tries% geq 10 goto rmdone/)
  assert.match(script, /del "%~f0"/)
})

test('buildWindowsCleanupScript omits PYTHONPATH + rmdir when not needed (gui, no bundle)', () => {
  const script = buildWindowsCleanupScript({
    desktopPid: 2,
    pythonExe: 'C:\\h\\venv\\Scripts\\python.exe',
    pythonPath: null,
    agentRoot: 'C:\\h',
    uninstallArgs: ['-m', 'hermes_cli.uninstall', '--mode', 'gui'],
    appPath: null,
    hermesHome: 'C:\\h'
  })

  assert.doesNotMatch(script, /rmdir/)
  assert.doesNotMatch(script, /set "PYTHONPATH=/)
})
