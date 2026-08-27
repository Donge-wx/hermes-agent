//! Filesystem paths + logging setup.
//!
//! My King keeps a dedicated home and passes it to the compatible backend via
//! `HERMES_HOME`:
//!   Windows: %LOCALAPPDATA%\myking
//!   macOS:   ~/.myking
//!   Linux:   ~/.myking
//!
//! The Python runtime and install scripts still consume the `HERMES_HOME`
//! compatibility variable. Keeping the My King default here aligned with the
//! Electron launcher prevents a standalone installer from falling back to the
//! upstream Hermes directory.
//!
//! IMPORTANT: this must match exactly. Drift here means install.ps1
//! writes to one place and the installer reads from another, breaking
//! the bootstrap-complete check.

use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;
use tracing_appender::non_blocking::WorkerGuard;

/// Returns the fixed My King home directory.
///
/// The compatible backend still consumes an environment variable named
/// `HERMES_HOME`, but the branded installer must never inherit that variable:
/// it could otherwise install into an ordinary Hermes deployment. Callers pass
/// this fixed result to child processes explicitly.
pub fn hermes_home() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        // Dedicated My King root; the child installer receives it as HERMES_HOME.
        if let Some(local_app_data) = dirs::data_local_dir() {
            return local_app_data.join("myking");
        }
    }

    // macOS + Linux + fallback: dedicated My King root.
    if let Some(home) = dirs::home_dir() {
        return home.join(".myking");
    }

    // Last resort — current dir, almost certainly wrong but at least
    // doesn't panic.
    PathBuf::from(".myking")
}

/// Resolve a UI-provided home without allowing it to redirect the managed
/// installer. The optional field remains in the Tauri protocol for backward
/// compatibility, but only the exact fixed My King root is accepted.
pub fn resolve_managed_home(requested: Option<&str>) -> Result<PathBuf, String> {
    let managed = hermes_home();
    let Some(raw) = requested.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(managed);
    };
    let candidate = PathBuf::from(raw);
    if candidate == managed {
        Ok(managed)
    } else {
        Err(format!(
            "refusing to redirect the My King installer from {} to {}",
            managed.display(),
            candidate.display()
        ))
    }
}

pub fn log_dir() -> PathBuf {
    hermes_home().join("logs")
}

pub fn log_path() -> PathBuf {
    log_dir().join("bootstrap-installer.log")
}

pub fn bootstrap_cache_dir() -> PathBuf {
    hermes_home().join("bootstrap-cache")
}

/// Stable location the installer copies itself to after a successful install.
/// The desktop app re-invokes this with `--update`, and the start-menu /
/// desktop shortcuts can point users back to it. Lives directly under
/// HERMES_HOME so it survives repo checkout deletion (unlike anything under
/// hermes-agent/).
///
/// On Windows this is `%LOCALAPPDATA%\hermes\hermes-setup.exe`; on other
/// platforms the extension differs but the directory is the same.
pub fn installer_dest() -> PathBuf {
    let name = if cfg!(target_os = "windows") {
        "hermes-setup.exe"
    } else {
        "hermes-setup"
    };
    hermes_home().join(name)
}

/// Marker the updater writes for the duration of an in-app update and removes
/// when it finishes (see update.rs `UpdateMarkerGuard`). A freshly-launched
/// desktop checks this before spawning its own local backend: spawning one
/// mid-update re-locks the venv shim and triggers `force_kill_other_hermes`,
/// which then kills that legitimate backend in a respawn loop (#50238).
///
/// Lives directly under HERMES_HOME (same rationale as `installer_dest`) so the
/// Electron desktop — which resolves HERMES_HOME identically and pins it into
/// the updater's env — agrees on the exact path.
pub fn update_in_progress_marker() -> PathBuf {
    hermes_home().join(".hermes-update-in-progress")
}

/// Copy the currently-running installer binary to `installer_dest()` so it's
/// available for future `--update` runs and shortcut launches.
///
/// No-ops (returns Ok) when the running exe is ALREADY the destination — which
/// is exactly the case during an `--update` run (the desktop launched us FROM
/// that path), where copying onto ourselves would be a Windows sharing
/// violation. Best-effort: a failure here must not fail the install, so the
/// caller logs and continues.
///
/// NOTE: because of that no-op, a user's staged installer is only ever written
/// by a full install/repair. Every later `--update` runs the ORIGINAL binary,
/// so an installer-protocol change can strand the whole installed base on a
/// binary that predates it (see `restage_from_checkout`, which repairs this
/// from the freshly-updated checkout).
pub fn copy_self_to_hermes_home() -> std::io::Result<()> {
    let src = std::env::current_exe()?;
    let dest = installer_dest();

    // Skip if we're already running from the destination (update re-invocation
    // or a prior copy). canonicalize both so symlinks / 8.3 short paths / case
    // differences don't trick us into a self-copy.
    let same = match (src.canonicalize(), dest.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => src == dest,
    };
    if same {
        tracing::info!(
            ?dest,
            "installer already at destination; skipping self-copy"
        );
        return Ok(());
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(&src, &dest)?;
    repair_macos_installer_helper(&dest);
    tracing::info!(?src, ?dest, "copied installer to HERMES_HOME");
    Ok(())
}

#[cfg(target_os = "macos")]
fn repair_macos_installer_helper(path: &Path) {
    // The staged helper may inherit quarantine from the downloaded installer.
    // Desktop later launches this exact file for in-app updates, so make it
    // executable before the update handoff reaches LaunchServices/Gatekeeper.
    let _ = Command::new("/usr/bin/xattr")
        .args(["-cr"])
        .arg(path)
        .status();

    let verify = Command::new("/usr/bin/codesign")
        .arg("--verify")
        .arg(path)
        .status();

    if !matches!(verify, Ok(status) if status.success()) {
        let _ = Command::new("/usr/bin/codesign")
            .args(["--force", "--sign", "-"])
            .arg(path)
            .status();
    }
}

#[cfg(not(target_os = "macos"))]
fn repair_macos_installer_helper(_path: &Path) {}

/// Where the bootstrap-complete marker lives (existence-only for the Rust
/// installer fast path; JSON schema-checked by the Electron app). Per main.ts:
///   const BOOTSTRAP_COMPLETE_MARKER = path.join(ACTIVE_HERMES_ROOT, '.hermes-bootstrap-complete')
/// We don't always know ACTIVE_HERMES_ROOT until install.ps1 reports it, so
/// this is a probe helper, not a definitive path.
pub fn likely_bootstrap_marker(install_root: &Path) -> PathBuf {
    install_root.join(".hermes-bootstrap-complete")
}

/// Initializes tracing to bootstrap-installer.log under HERMES_HOME/logs/.
/// Returns a guard that flushes the appender on drop — keep it alive for
/// the lifetime of the process.
pub fn init_logging() -> Option<WorkerGuard> {
    let dir = log_dir();
    if let Err(err) = std::fs::create_dir_all(&dir) {
        // No log dir → log to stderr only. Don't panic; the installer
        // should still be usable on an exotic filesystem.
        eprintln!("[hermes-setup] could not create log dir {dir:?}: {err}");
        return None;
    }

    let file_appender = tracing_appender::rolling::never(&dir, "bootstrap-installer.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = tracing_subscriber::EnvFilter::try_from_env("HERMES_BOOTSTRAP_LOG")
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(true)
        .init();

    Some(guard)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_log_path() -> String {
    log_path().to_string_lossy().into_owned()
}

#[tauri::command]
pub fn get_hermes_home() -> String {
    hermes_home().to_string_lossy().into_owned()
}

#[tauri::command]
pub fn open_log_dir(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = log_dir();
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inherited_hermes_home_cannot_redirect_managed_root() {
        const PROBE_OUTPUT: &str = "MYKING_BOOTSTRAP_HOME_PROBE_OUTPUT";
        if let Some(output) = std::env::var_os(PROBE_OUTPUT) {
            std::fs::write(output, hermes_home().to_string_lossy().as_bytes()).unwrap();
            return;
        }

        // Given a separate ordinary Hermes directory and an isolated child
        // process inheriting HERMES_HOME pointing at it.
        let base = std::env::temp_dir().join(format!(
            "myking-home-env-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let hermes = base.join(".hermes");
        std::fs::create_dir_all(&hermes).unwrap();
        let output = base.join("resolved-home.txt");
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "paths::tests::inherited_hermes_home_cannot_redirect_managed_root",
                "--nocapture",
            ])
            .env("HERMES_HOME", &hermes)
            .env(PROBE_OUTPUT, &output)
            .status()
            .unwrap();

        // When the public production resolver runs, then it returns the My
        // King root and performs no write inside ordinary Hermes.
        assert!(status.success());
        let resolved = PathBuf::from(std::fs::read_to_string(&output).unwrap());
        assert_ne!(resolved, hermes);
        assert_eq!(
            resolved.file_name().and_then(|name| name.to_str()),
            Some(".myking")
        );
        assert_eq!(std::fs::read_dir(&hermes).unwrap().count(), 0);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn explicit_ordinary_hermes_home_is_rejected() {
        let ordinary = dirs::home_dir().unwrap().join(".hermes");
        let error = resolve_managed_home(Some(ordinary.to_string_lossy().as_ref())).unwrap_err();
        assert!(error.contains("refusing to redirect"));
        assert!(error.contains(".myking"));
        assert!(error.contains(".hermes"));
    }

    #[test]
    fn exact_managed_home_is_accepted() {
        let managed = hermes_home();
        assert_eq!(
            resolve_managed_home(Some(managed.to_string_lossy().as_ref())).unwrap(),
            managed
        );
    }
}
