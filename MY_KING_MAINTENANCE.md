# My King maintenance boundary

My King is a branded desktop distribution of Hermes Agent. The distribution
changes presentation, public identity, installation paths, and launch surfaces;
it does not fork the backend protocol, IPC contract, session model, or agent
kernel.

## Isolated paths

| Concern | My King | Original Hermes |
| --- | --- | --- |
| Installed app | `/Applications/My King.app` | `/Applications/Hermes.app` |
| Runtime and user data | `~/.myking` | `~/.hermes` |
| Runtime checkout | `~/.myking/hermes-agent` | `~/.hermes/hermes-agent` |
| Maintainer source mirror | `~/.myking/my-king-work-os` | not used |
| Electron user data | `~/Library/Application Support/My King` | `~/Library/Application Support/Hermes` |
| Public CLI | `myking`, `myking-agent`, `myking-acp` | `hermes`, `hermes-agent`, `hermes-acp` |
| Bundle ID | `com.myking.workos.desktop` | upstream Hermes ID |
| Deep link | `myking://` | `hermes://` |

The hidden executable name `Hermes`, the `hermes-media` scheme, and internal
`hermes:*` IPC names remain unchanged because they are compatibility contracts,
not public branding.

## Upgrade contract

The My King runtime checkout stays on `my-king/liquid-glass`. Its configuration
sets `updates.parked_branch_strategy: update_in_place`, so the normal in-app
updater and `myking update` merge `origin/main` into the My King branch instead
of switching to upstream `main` and discarding the UI distribution commit.

The updater creates a `pre-update-<timestamp>` safety tag before a non-fast-
forward merge. If upstream and the My King layer conflict, the merge aborts and
the installed app remains unchanged; resolve the conflict in the maintainer
source mirror, run the regression suite, then copy the resulting commit to the
runtime checkout.

## Required release gates

1. `npm ci` at the repository root.
2. Desktop typecheck and full Vitest suite.
3. Install and path-isolation tests.
4. Production renderer build and packaged Electron build.
5. macOS code-sign verification.
6. Serial visual scenarios at 640, 768, and 1280 widths, including boot,
   failure, conversation, sidebar resize, titlebar states, and CJK wrapping.
7. Install only `/Applications/My King.app`; never replace or modify
   `/Applications/Hermes.app`.

