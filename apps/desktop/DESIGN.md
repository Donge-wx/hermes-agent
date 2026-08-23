# Desktop Design System

Conventions for the Electron desktop app (`apps/desktop`). Read this before
adding a component, overlay, or style. The rule of thumb: **one source per
concern, tokens over literals, flat over boxed.** If you reach for a raw color,
a one-off shadow, a bespoke button, or a hardcoded `px-*` on a control — stop,
there's already a primitive for it.

This file owns the visual and interaction contract. Read
[`AGENTS.md`](./AGENTS.md) for architecture, state, resolver, transport, and
testing rules.

This doc contains two kinds of content, maintained differently:

- **Principles** (flatness, intent, feedback, motion, cancellation) are durable.
  They hold as components come and go.
- **Named contracts** (tokens, `Button` variants, primitive names) are the
  design system's current API. They are maintained _with_ the code: if you
  change a primitive, token, or variant, update its entry here **in the same
  change** — a stale name in this file is a bug, exactly like a stale type.

When a rule and the code disagree, fix whichever is wrong rather than forking a
one-off at the call site.

## Principles

1. **Flat, not boxed.** No card-in-card, no divider borders inside a panel.
   Group with whitespace and a single hairline, never nested rounded boxes.
2. **Borderless elevation for floating panels.** Overlays float on
   `shadow-nous` + a `--stroke-nous` hairline, not thick framed boxes. In-panel
   structure may use token hairlines sparingly.
3. **One primitive per concern.** One `Button`, one set of control variants,
   one `SearchField`, one `Loader`, one `ErrorState`. Migrate onto them; don't
   fork.
4. **Tokens, not literals.** Reference CSS vars (`--ui-*`, `--shadow-nous`,
   `--theme-*`), never raw hex / ad-hoc rgba in components.
5. **Style lives in the primitive.** Variants and sizes own padding, radius,
   color, chrome. Call sites pass a `variant`/`size`, not `className` overrides
   that re-specify those.
6. **Intent before automation.** Surface useful actions and previews, but do not
   open panes, move focus, or navigate because a tool happened to produce
   something.
7. **Immediate feedback.** Direct manipulation updates the view first. Network
   or disk persistence reconciles afterward and rolls back visibly on failure.

## Liquid Glass light-theme contract

`liquid-glass` is an additive desktop theme, not a replacement component tree.
It follows Apple's macOS 26 direction: Liquid Glass is a dynamic foreground
material for controls and navigation, with specular edge light, translucency,
refraction cues, and content that remains readable beneath and around it. The
work plane therefore stays comparatively solid; the strongest glass belongs to
chrome, navigation, controls, the Composer, menus, and overlays.

The following numbers are Hermes' desktop adaptation of that language, calibrated
against the real Electron shell at 90–200% UI scale. They are named design tokens,
not claims that Apple publishes identical CSS pixel measurements:

| Token / primitive                                                                                     | Liquid Glass target                                                     | Contract                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--lg-size-titlebar-control`                                                                          | `2rem` / 32px                                                           | titlebar and overlay chrome hit area; glyph 17–18px                                                                                                                                                                                                                          |
| `--lg-size-icon-control`                                                                              | `2rem` / 32px                                                           | ordinary circular icon actions                                                                                                                                                                                                                                               |
| `--lg-size-control`                                                                                   | `2.5rem` / 40px                                                         | inputs, selects, primary text buttons, and segmented controls                                                                                                                                                                                                                |
| `--lg-size-control-compact`                                                                           | `2.25rem` / 36px                                                        | menus, compact buttons, and secondary field controls                                                                                                                                                                                                                         |
| `--lg-size-nav-row`                                                                                   | `2.5rem` / 40px                                                         | primary sidebar and settings-navigation rows; icon 17–19px                                                                                                                                                                                                                   |
| `--lg-size-nav-row-compact`                                                                           | `2.25rem` / 36px                                                        | nested navigation and compact pane tabs                                                                                                                                                                                                                                      |
| `--lg-size-menu-row`                                                                                  | `2.25rem` / 36px                                                        | menu, select, command-palette, and popover choices                                                                                                                                                                                                                           |
| `--lg-size-statusbar`                                                                                 | `2rem` / 32px                                                           | bottom status chrome and its icon actions                                                                                                                                                                                                                                    |
| `--lg-size-composer`                                                                                  | `3.5rem` / 56px minimum                                                 | Composer surface at rest, excluding optional status/drawer rows                                                                                                                                                                                                              |
| `--lg-size-composer-action`                                                                           | `2rem` / 32px                                                           | Composer utility actions                                                                                                                                                                                                                                                     |
| `--lg-size-composer-primary`                                                                          | `2.25rem` / 36px                                                        | Composer send/stop/voice primary action                                                                                                                                                                                                                                      |
| `--lg-size-switch-*`                                                                                  | `3rem × 1.75rem` / 48×28px                                              | settings toggle with a 22px thumb and visible focus ring                                                                                                                                                                                                                     |
| `--lg-size-checkbox`                                                                                  | `1.25rem` / 20px                                                        | checkbox control; surrounding row remains the hit target                                                                                                                                                                                                                     |
| `--lg-type-control`                                                                                   | `0.875rem` / 14px                                                       | control, navigation, and menu labels                                                                                                                                                                                                                                         |
| `--lg-type-caption`                                                                                   | `0.8125rem` / 13px                                                      | descriptions and secondary settings copy                                                                                                                                                                                                                                     |
| `--lg-type-section-heading`, `--lg-type-intro-display`                                                | 15px / responsive 32–36px                                               | semantic settings and intro hierarchy; component styles do not own type literals                                                                                                                                                                                             |
| `--lg-space-3xs…3xl`                                                                                  | 3–18px                                                                  | shared Liquid Glass spacing ladder for component gaps, margins, and padding                                                                                                                                                                                                  |
| `--lg-size-settings-row`, `--lg-size-theme-*`, `--brand-size-intro-lockup` / `--lg-size-intro-lockup` | 76px / 144–156px / 96px / responsive 272–320px                          | settings, theme specimen, and centered branded-intro geometry; the global brand token remains valid before theme attributes settle                                                                                                                                           |
| `--boot-stage-*`, `--boot-atmosphere-*`, `--preboot-*`                                                | responsive 544px stage / 80px loader (72px compact) / 4px progress rail | branded cold-start geometry plus a translucent raised-glass stack: two visible environment fields behind the stage, upper-left specular light, inner/outer rim, blur, progress, and exit timing; the tiny pre-React token set mirrors this material before the bundle mounts |
| `--lg-size-sidebar-tab`, `--lg-size-toolbar-island`, `--lg-size-status-pill`                          | 40px / 32px / 26px                                                      | Sessions/Bots segmented lens, titlebar tool islands, and statusbar identity capsules                                                                                                                                                                                         |

The Sessions/Bots lens always fills its live pane width: pane resizing owns the
rail geometry, labels are equal-width and centered at caption scale, and the
trailing minimize affordance overlays the edge instead of becoming a third
layout column. Session section headings use semantic icons plus a quiet pill
hover; the legacy dither square is not part of Liquid Glass. The titlebar is one
continuous glass plane at rest: tool clusters add no second glass capsule, and
individual buttons add no resting surface or shadow. Only hover, pressed, and
keyboard-focus states may introduce a local interaction lens.
| `--lg-radius-control` | `0.75rem` / 12px | controls; inner radii stay smaller than their container |
| `--lg-radius-theme-card`, `--lg-radius-composer`, `--lg-radius-pill` | 14px / 22px / capsule | theme specimens, Composer, and My King brand capsule |
| `--lg-radius-island`, `--lg-shadow-island`, `--lg-shadow-navigation-well` | 16px / named layered elevation | toolbar/status islands and the single primary-navigation material well |
| `--lg-measure-*`, `--lg-size-*`, `--lg-space-*`, `--lg-stroke-*`, `--lg-radius-*` | named geometry primitives | Liquid Glass modules consume tokens for every length; only media-query thresholds remain literal because CSS custom properties are unavailable in media conditions |
| `--lg-shadow-*`, `--lg-backdrop-*`, `--lg-filter-*` | named optical recipes | component, shell, overlay, and state-specific depth/blur values live in `tokens.css`; consuming modules do not carry one-off shadow or blur measurements |
| `--brand-backdrop-*` | viewport-relative placement, rotation, opacity, saturation | reusable ambient My King symbol layer; component markup owns no geometry literals |
| `--lg-shadow-theme-card-selected`, `--lg-shadow-selection-badge`, `--lg-shadow-theme-preview` | named optical elevation recipes | theme selection and preview effects remain token-driven instead of call-site shadows |
| `--lg-radius-panel` | `1.125rem` / 18px | menus and floating panels |
| `--lg-radius-overlay` | `1.5rem` / 24px | route overlays and dialogs |

These targets deliberately do not inherit Hermes' compact 24–28px control
geometry. At narrower layouts they may reflow or reduce horizontal padding, but
their readable type, keyboard focus, and minimum hit area remain intact. At 200%
zoom, the existing single scroll owner and intrinsic settings grid must continue
to contain the interface without horizontal overflow.

Material and behavior rules:

- Use one upper-left light source: bright top/left specular edges, quieter
  bottom/right seams, then contact and ambient shadows.
- Selection is an internal tint/lens; keyboard focus is a separate external blue
  ring; hover and pressed states remain distinct.
- The editable Composer keeps its layered gradient, rim, and shadow but performs
  no live `backdrop-filter` blur while typing. Static menus and overlays may use
  stronger blur because they are short-lived and not continuous hot paths.
- `prefers-reduced-transparency`, `prefers-contrast`, and
  `prefers-reduced-motion` preserve hierarchy with opaque fills, stronger seams,
  and near-zero transition duration.
- Persistent links use a non-color affordance in addition to the Apple-blue hue;
  warning surfaces meet light-mode contrast without relying on dark-mode amber.

Upgrade and functionality boundary:

- The theme is registered only through `BUILTIN_THEMES` and imported CSS. It does
  not modify Electron IPC, backend/gateway code, updater/install code, theme
  persistence, or data flow.
- About identifies the desktop interface package and backend runtime as two
  separate versions. Backend-only updates must never be presented as a desktop
  UI replacement.
- Theme hooks are inert `data-*` attributes on existing DOM nodes. They expose
  presentation targets without adding handlers, state, navigation, or new
  component ownership.
- Every rule is scoped to
  `:root[data-hermes-theme='liquid-glass'][data-hermes-mode='light']`; existing
  themes and dark-mode behavior remain unchanged.

Shell chrome primitives:

- **Sidebar navigation track.** `Sessions / Bots` is one 40px segmented glass
  lens. The primary destinations below it share one navigation well rather than
  becoming five independent cards. Idle rows remain quiet; hover is a shallow
  lens; the active route adds an internal blue tint without changing geometry.
- **Sidebar empty-state stage.** The existing icon, message, and new-project
  action form one centered composition with a refractive icon plate and a
  readable action capsule. It adds no alternate onboarding or navigation path.
- **Profile dock.** The existing profile rail is one floating glass dock at the
  sidebar foot. Every existing profile, add, import, manage, and gateway action
  keeps its current button and handler inside that shared material.
- **Titlebar tool group.** Each existing left, pane, and system tool cluster is
  a frameless 32px-high action zone on the titlebar's single continuous glass
  plane. Individual buttons keep 32px hit areas and existing tooltip, keybind,
  haptic, pressed, disabled, and routing behavior; only direct interaction may
  raise a local lens.
- **Status identity capsule.** Gateway health and client/backend version entries
  use 26px inner capsules within the 32px statusbar. Version, commit, updating,
  restart, warning, and update-available content remain sourced from the existing
  status items; the theme changes only their hierarchy and material.

Conversation primitives:

- **Session row lens.** Session rows use a 44px minimum target in Liquid Glass.
  Resting rows stay transparent, hover adds a shallow refractive lens, and the
  selected row uses an internal blue tint plus upper-left specular edge. Running,
  unread, drag, branch, pin, menu, and density behavior remain owned by the
  existing row; inert `data-selected`, `data-unread`, and `data-working` hooks
  expose those states to the theme.
- **Human bubble.** Human messages are right-aligned blue-ice glass bubbles with
  a readable maximum measure, a stronger rim than assistant prose, and enough
  inset for edit/restore controls. Sticky, clamp, attachment, branch, reaction,
  edit, restore, and stop behavior is unchanged.
- **Assistant reading sheet.** Assistant output uses a quiet translucent reading
  sheet with a restrained My King blue edge cue. It is lighter than the human
  bubble and remains one continuous reading surface; paragraphs, tools, code,
  attachments, reactions, and footers do not become nested cards.
- **Cognition capsule.** Live response/loading rows and reasoning disclosures use
  a 24px optical cognition glyph and compact glass capsule. Active reasoning is
  visibly animated through the existing finite pulse mechanism and always names
  its fallback state as loading or thinking so the glyph is never an unlabeled
  timer. Settled reasoning uses a calm disclosure capsule and an inset body.
  `data-state` and `data-open` are presentation-only and do not alter timing,
  collapse, or streaming logic; fallback copy is display-only and does not change
  the busy signal, status timing, or message state machine.
- At narrow widths the message measures become fluid and horizontal padding
  compresses, while type size, status glyph size, keyboard focus, and all existing
  interaction targets remain intact.
- **CJK intro phrase groups.** Chinese and Japanese intro headlines and body copy preserve
  semantic clauses as unbreakable inline groups, with wrapping allowed only
  between punctuation-delimited phrases. This prevents orphan punctuation and
  split predicates at 640/768 widths without changing the localized copy,
  document reading order, or any application state.

## Information architecture

- **Chat is the home surface.** The transcript and composer stay primary; tools,
  previews, files, review, and terminal complement the conversation.
- **Pages are durable destinations.** Chat, Skills, Messaging, and Artifacts
  remain in shell chrome. Do not hide a distinct product noun inside an
  unrelated page.
- **Route overlays are short tasks.** Settings, Command Center, Cron, Profiles,
  Agents, and Starmap render as `OverlayView` cards and return to the previous
  route on close. Model/session pickers and dialogs layer above the current
  surface; they are not navigation stacks.
- **Panes are working context.** Preview, files, review, and terminal remain
  attached to the current task. Their state survives temporary hiding and chat
  switches where the underlying tool is meant to persist.
- **One action, one home.** A command may have keyboard, palette, and visible
  affordances, but they invoke the same action and state. Do not fork behavior
  per entry point.
- **Projects own workspace cwd.** Use Sidebar → Projects for local folders and
  worktrees; do not reintroduce a per-session/right-sidebar folder-picker flow.

Navigation must preserve context. A background session finishing, a tool result
arriving, or a project refresh may update badges and cached data; it must not
replace the foreground transcript or steal focus.

## Surfaces & elevation

Floating panels (base `Dialog`, route overlays, boot/install/update surfaces,
model-picker, onboarding, prompt overlays, notifications) use:

```
shadow-nous           /* downward-weighted, layered contact→ambient falloff */
border-(--stroke-nous) /* currentColor hairline, theme-adaptive */
```

Both are CSS vars in `src/styles.css` — tune in one place, everything inherits.
Don't add per-overlay `shadow-[…]` or `border-(--ui-stroke-secondary)`
one-offs; if elevation needs to change, change the token.

Menus and popovers use their own shared `shadow-md` +
`--ui-stroke-secondary` primitive treatment. Drag affordances may use tokenized
dashed targets and local blur. These are semantic surface classes, not licenses
for call-site shadow or border inventions.

## Stroke & color tokens

| Token                                        | Use                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `--ui-stroke-primary…quaternary`             | hairlines, in descending strength                                                           |
| `--ui-stroke-tertiary`                       | the default in-panel divider / list hairline — and every bordered surface in the transcript |
| `--stroke-nous`                              | the overlay hairline (pairs with `shadow-nous`)                                             |
| `--ui-text-primary / -secondary / -tertiary` | text hierarchy                                                                              |
| `--ui-bg-quaternary`                         | soft control fill (secondary button)                                                        |
| `--ui-widget-surface-background`             | fill for inline chat widgets (`WIDGET_SHELL_CLASS`)                                         |
| `--chrome-action-hover`                      | hover fill for quiet controls                                                               |
| `--theme-primary`, `--ui-accent`             | brand/accent                                                                                |

Never hardcode `border-gray-*`, `bg-white`, `text-black`, etc. Brand artwork
owns its baked color treatment; component chrome still comes from tokens.

## Buttons — one component

`src/components/ui/button.tsx` is the single source. Pick a `variant` + `size`;
do **not** pass `h-*`, `px-*`, `py-*`, or icon-size overrides.

**Variants:** `default` (primary), `destructive`, `secondary` (soft fill —
the default non-primary look), `outline` (transparent + 1px inset ring, no
fill/shadow), `ghost`, `link`, `text` (boxless quiet inline — "Cancel",
"Clear"), `textStrong` (bold underlined inline affordance — "Change",
"Open logs").

**Sizes:** `default`, `xs`, `sm`, `lg`, `inline` (flush, zero box — for buttons
that sit inside a heading/sentence; replaces `h-auto px-0 py-0`), `micro`
(status-stack/table-footers), and the icon family `icon` / `icon-xs` /
`icon-sm` / `icon-lg` / `icon-titlebar`.

**Tooltips only when hover teaches something new.** `<Tip>` is for discovery,
not a tax on every icon. Ask: does hover reveal something the user cannot
already see or infer? If not, skip the tip; keep an `aria-label` for a11y.

Tip unlabeled chrome when the job (or a keybind / truncated path / host /
other detail) is not already on screen — toolbar / titlebar / statusbar icons,
`TipKeybindLabel` shortcuts, ownership chips, unlabeled icon grids.

Do **not** tip:

- Menu triggers (kebabs / ⋯ / `ActionsMenu` / `DropdownMenuTrigger`) — the
  affordance is "open menu"; verbs live in the menu. Never tip
  `"Actions for ${row title}"` / `"Project actions"` / `"Actions"`.
- Close / dismiss X buttons — the glyph is the label (`aria-label` only).
- Controls whose visible label already says what the tip would ("click to…",
  paraphrases of the same words, timer labels restating "Running").

Never use native HTML `title=` on buttons — unstyled, ~500ms OS delay, clashes
with the themed `Tip`. `src/components/ui/__tests__/no-native-title.test.ts`
fails on any `<button>` / `<Button>` that still carries `title=`.

**Keybind hints in tooltips.** On a tipped button bound to a rebindable hotkey,
use `<TipKeybindLabel actionId="..." />` — it reads the i18n label and the
current combo from `$bindings`. Pass `text={...}` only when the label is
context-dependent (e.g. "Show" / "Hide"). Never hardcode combos; always use
`useKeybindHint` or `TipKeybindLabel`.

Notes:

- Text buttons are square (no radius) and sized by padding + line-height (no
  fixed heights). Only icon buttons carry the shared 4px radius.
- SVGs inherit `size-3.5` (`size-3` at `xs`). Don't re-set icon size.
- Polymorph with `asChild` when the button must render as a link/Slot.

## Badges — one component

`src/components/ui/badge.tsx`. Variants: `default` (tinted primary), `muted`,
`warn`, `destructive`, `outline`, `solid` (primary fill — icon-corner counts).
Sizes: `default`, `xs`, `overlay` (titlebar glyph counts).

## Form controls

- **`controlVariants`** (`src/components/ui/control.ts`) is the shared shape for
  `Input` / `Textarea` / `SelectTrigger`. New text-entry controls compose it.
- **`SearchField`** — borderless, underline-on-focus, auto-width. The only
  search input. Don't build boxed search bars; don't wrap it in a bordered tile.
  Empty lists hide their search field.
- **`SegmentedControl`** — the choice control for small mutually-exclusive sets
  (color mode, tool-call display, usage period). Replaces radio piles and
  pill rows.
- **`Switch`** (`size="xs"`) — bare, with `aria-label`. No bordered text wrapper.

## Layout

- **Gutters:** `PAGE_INSET_X` (`src/app/layout-constants.ts`) for page side
  padding; `PAGE_INSET_NEG_X` to bleed a child to the edge. Don't hardcode
  `px-6`/`px-8` on pages.
- **Master/detail overlays:** `OverlaySplitLayout` + `OverlaySidebar` /
  `OverlayMain`. Cron, profiles, etc. ride this — don't rebuild a titlebar
  shell.
- **Rows:** `ListRow` (settings `primitives.tsx`) for label/description/action
  rows. Flat, flush-left; no per-row indentation that fights flush headers.
- **No dividers between rows** unless the list genuinely needs them; prefer
  spacing. When you do need one, it's a single `--ui-stroke-tertiary` hairline.

## Feedback & empty/error/loading states

- **Loading:** `Loader` (`src/components/ui/loader.tsx`) — animated math/ascii
  curves (`lemniscate-bloom` for long ops). Never ship the literal text
  "Loading…".
- **Branded cold start:** `GatewayConnectingOverlay` is the single My King boot
  stage. It uses the approved lockup, the shared `Loader`, localized
  `$desktopBoot.message`, and the real `$desktopBoot.progress`; it never invents
  progress or falls back to a generic `CONNECTING` wordmark. The progress fill
  animates with `transform: scaleX()` only. Reduced motion hides the moving SVG
  and substitutes a calm opacity pulse. Before React mounts, `index.html` paints
  the same approved lockup inside a minimal `pre-react-boot` glass stage so the
  first composited frame is branded rather than blank. React replaces that
  static shell immediately; it contains no synthetic progress, never delays
  startup, and is removed synchronously for every `?win=` auxiliary renderer:
  HUD, secondary sessions, quick-entry, pet, and wake. Main and peer windows
  without `?win=` retain the branded first frame.
- **Errors:** `ErrorState` + the canonical `ErrorIcon` (no bg chip). One look
  for the React boundary, in-dialog errors, and the boot-failure banner. Pass
  nodes for title/description so Radix `DialogTitle`/`Description` can flow
  through for a11y.
- **Logs:** `LogView` — no bg, hairline border, tight padding, small mono.
  Every place we surface raw logs uses it.
- **Empty:** `EmptyState` for plain page bodies; `PanelEmpty` for overlay
  master/detail empties with an icon and action. Don't hand-roll a third
  centered empty.
- **Confirmation:** `ConfirmDialog` is the only way we ask "are you sure". It
  opens focused on Confirm, so `Enter` confirms and `Esc` cancels, and it owns
  the pending → done → close beat and the inline error — a call site passes an
  async `onConfirm` and nothing else. A third way out (e.g. "Remove from
  sidebar" beside "Delete worktree") goes in the one `secondaryAction` slot.
  Never `window.confirm`: it's an unstyled blocking Chromium modal. A handler
  that wants the answer inline instead of a mounted dialog calls `confirm()`
  from `src/store/confirm.ts`, which renders this same primitive through the
  single `ConfirmHost` at the shell — the way `notify()` backs notifications.
- **Zoomable media:** `Zoomable` owns click-to-expand media, the shared Dialog
  viewer, and its pan/zoom/copy toolbar. Its unlabeled controls use `Button` +
  themed `Tip`; the inline expand affordance and viewer toolbar expose stable
  `data-slot` hooks and reuse the named overlay materials. Never add a native
  `title=` tooltip or a one-off viewer surface.
- **Connector consent:** `ConnectorCard` owns the transcript's connect / grant /
  retry offer and exposes stable state/action slots. Theme modules may scale
  those slots, but must not alter the card's consent, credential, or dismissal
  behavior. Active offers use the shared widget surface; settled outcomes stay
  compact transcript scaffolding.

## Chat, tools & boot surfaces

- The transcript and composer are built on `@assistant-ui/react`. Extend the
  existing components under `src/components/assistant-ui` and
  `src/app/chat/composer`; do not fork a second markdown, message, tool-call, or
  approval renderer for one feature.
- **Inline widgets** — a tool result that renders as a panel the user reads or
  acts on (clarify, artifact card) wears `WIDGET_SHELL_CLASS`
  (`src/components/chat/widget-shell.ts`): shared radius, the
  `--ui-widget-surface-background` fill, no border. Its actions sit _outside_
  the panel, below it. Don't give one widget its own radius or fill.
- Bordered surfaces in the transcript (tables, fences, callouts, attachments)
  use `--ui-stroke-tertiary`. Not `border-border` — that's the app-wide
  default and reads too hot against the thread.
- A tool result may expose an inline action that opens a preview. It must not
  open the rail automatically.
- Install, onboarding, connecting, boot failure, and reauthentication are
  distinct states with shared visual primitives. Preserve their recovery
  semantics when unifying appearance.
- The branded cold-start stage changes presentation only. Its existing cold-boot
  latch, soft-switch suppression, post-boot reconnect behavior, failure handoff,
  preview loop, and exit timing remain the authority for when it may cover the
  shell.
- Respect `AppShell` overlay ownership. Persistent terminal/content layers,
  route overlays, dialogs, and boot surfaces must not compete through ad-hoc
  z-index literals. Pick a rung of the ladder in `styles.css` instead —
  `--z-modal-backdrop` / `--z-modal` / `--z-modal-popover`, `--z-over-modal`
  (toasts, tooltips, command surfaces) and `--z-over-modal-content`,
  `--z-switcher-backdrop` / `--z-switcher`, then the boot chain
  `--z-connecting` → `--z-onboarding` → `--z-setup` → `--z-crash`. Plain
  `z-10`/`z-20` are still right for stacking _within_ one component.

## Iconography & brand

- **Tabler** is the default component/chrome set. Import its curated aliases and
  `iconSize` scale from `src/lib/icons.ts`; do not import icon packages directly
  in feature code.
- **`Codicon`** is the compact editor/tool/status vocabulary. Use
  `src/components/ui/codicon.tsx`, including `codiconIcon()` where a
  Tabler-shaped component is required.
- Pick the vocabulary by semantic context and reuse the existing icon for an
  action. Do not introduce a third icon set or mix styles within one control
  group.
- **`BrandMark`** (`src/components/brand-mark.tsx`) is the canonical transparent
  My King liquid-glass glyph. `src/lib/brand.ts` owns the public name, exact
  `AI WROK OS` tagline, accessible label, and asset paths. Updates, onboarding,
  About, notifications, the shell, and packaging derive from the same approved
  symbol; do not reintroduce the Nous portrait, Hermes pixel art, or decorative
  stand-ins.
- **Brand assets** live under `assets/brand` (packaging masters) and
  `public/brand` (renderer copies). The approved lockup remains the visual
  reference; the app icon places its exact three-color symbol on a macOS-style
  opalescent plate. `ambient-background.svg` may appear only as quiet atmosphere
  behind live UI, never as a screenshot substitute.
- **The main chat intro uses the approved lockup artwork directly.** It is
  centered at the responsive `--lg-size-intro-lockup`, preserves the artwork's
  native purple/cyan/blue pixels without filters or opacity changes, and stays
  above the ambient backdrop so that layer cannot wash out the approved colors.
  It never reconstructs the wordmark from system text.

## Motion

- Quick, functional transitions (~100ms on controls). Respect
  `prefers-reduced-motion` for anything beyond a fade.
- Choreographed exits (e.g. onboarding's "matrix" fade-down) stagger per-element
  then settle the surface — the outer container's fade is _delayed_ so it
  doesn't swallow the inner animation. Don't let a global fade race the detail.
- Motion follows state; it never delays state. Selection, drag targets, cancel,
  and pressed feedback paint in the current frame.
- Do not animate layout geometry with `transition-all` on a hot interaction.
  Name the properties, avoid backdrop-filter repaints during movement, and
  remove animation before masking a performance problem.

## Direct manipulation & performance

The app should feel instant under real load — long transcripts, several panes,
live streams. Design toward that:

- Direct manipulation paints first; persistence reconciles after and rolls back
  visibly on failure.
- Keep interaction feedback cheap: hot-path state stays local or narrowly
  derived, not wired into heavy trees; pointer work coalesces per frame.
- One drop region has one visual owner, and drop targets speak one affordance
  language across files, sessions, tabs, and panes. Overlapping targets resolve
  to the active one instead of stacking overlays.
- Forgiving geometry beats pixel-perfect triggers; edge actions live near their
  edge, not clustered in the center.
- Expensive stateful surfaces stay mounted when hidden. Visibility is not
  lifecycle.

Prove speed with realistic content. A fast empty-state demo says nothing about a
long transcript or a busy terminal.

## Keyboard & cancellation

- Keyboard ownership follows focus. The focused surface wins its keys; shell
  shortcuts must not steal a terminal's or editor's bindings.
- Register global shortcuts through the shared layer, not ad-hoc listeners.
- One cancel gesture does one thing: cancel the active interaction, or close the
  topmost dismissable surface — never both, never the control underneath.
- Cancellation is synchronous in the UI even if cleanup is async: overlays,
  cursors, and pending gesture state clear at once.
- Flows that deliberately cannot be dismissed (install/onboarding, destructive
  confirmation) must make that explicit.

## i18n

- Every user-facing string goes through `useI18n()` (`src/i18n/context.tsx`).
  No literals in JSX.
- **Update all locales together** — `en`, `ja`, `zh`, `zh-hant`. A string change
  in `en.ts` that skips the others is a regression (drifted punctuation,
  stale labels). Keep trailing-punctuation and tone consistent across all four.

## State (TypeScript)

The detailed state contract lives in the scoped
[`AGENTS.md`](./AGENTS.md). Visual code follows these essentials:

- Shared/cross-component state → small **nanostores**, not prop-drilling.
  Each feature owns its atoms; shared atoms live in `src/store`.
- Rendering components subscribe with `useStore`; non-render actions read with
  `$atom.get()`.
- Subscribe to derived coarse facts instead of high-frequency source atoms when
  the component does not render the full value.
- Colocated action modules over god hooks. A hook owns one narrow job.
- Keep persistence beside the atom that owns it. Route roots stay thin.
- Prefer `interface` for public props; extend React primitives
  (`React.ComponentProps<'button'>`, `Omit<…>`).

## Affordances

- `cursor-pointer` at the primitive level (Button, dropdown/select) — don't
  hardcode it per call site.
- Global focus-ring reset; titlebar actions have no active-background state.
- `Esc` closes every dismissable overlay/dialog (install/onboarding excluded);
  close is an x-icon, not the word "Close".

## Before you add something — checklist

- [ ] Reuse a primitive (`Button`, `SearchField`, `SegmentedControl`,
      `ListRow`, `Loader`, `ErrorState`, `LogView`, `ConfirmDialog`) instead of
      forking one?
- [ ] Tokens (`--ui-*`, `shadow-nous`, `--stroke-nous`) — zero raw colors /
      one-off shadows?
- [ ] No `className` overriding a primitive's padding / size / radius / chrome?
- [ ] Tips only where hover teaches something new (no kebab / menu-trigger
      tips; unlabeled chrome that needs discovery gets `<Tip>` + `aria-label`)?
- [ ] No native `title=` on buttons?
- [ ] Keybind hints on tipped buttons use `useKeybindHint` / `TipKeybindLabel`?
- [ ] Overlay uses `shadow-nous` + `border-(--stroke-nous)`, no hard border?
- [ ] Flat — no card-in-card, no gratuitous row dividers?
- [ ] No automatic navigation, focus steal, or pane opening from background
      events?
- [ ] Direct manipulation paints immediately and rolls back cleanly on failure?
- [ ] Hot interactions avoid broad subscriptions, layout thrash, and
      `transition-all`?
- [ ] Keyboard ownership and single-action `Esc` behavior are correct?
- [ ] All four locales updated for any new/changed string?
- [ ] `cursor-pointer`, focus ring, and `Esc`-to-close behave?
- [ ] Touched a primitive, token, or variant? Its named-contract entry in this
      file is updated in the same change.
