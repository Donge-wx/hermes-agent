// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusResponse } from "./lib/api";
import { SidebarSystemActions } from "./App";

const apiMocks = vi.hoisted(() => ({
  checkHermesUpdate: vi.fn(),
}));
const systemActionMocks = vi.hoisted(() => ({
  runAction: vi.fn(),
}));
const confirmDialogMocks = vi.hoisted(() => ({
  latestUpdateOnConfirm: undefined as undefined | (() => void),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));
vi.mock("@/components/SidebarStatusStrip", () => ({
  SidebarStatusStrip: () => null,
  gatewayLine: () => ({ label: "Running", tone: "text-success" }),
}));
vi.mock("@/contexts/useSystemActions", () => ({
  useSystemActions: () => ({
    activeAction: null,
    isBusy: false,
    isRunning: false,
    pendingAction: null,
    runAction: systemActionMocks.runAction,
  }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: {
      app: { system: "System" },
      common: { cancel: "Cancel", loading: "Loading" },
      status: {
        gateway: "Gateway",
        restartGateway: "Restart gateway",
        restartGatewayConfirmMessage: "Restart the gateway?",
        restartGatewayConfirmTitle: "Restart gateway",
        restartingGateway: "Restarting gateway",
        updateHermes: "Update Hermes",
        updateHermesConfirmMessage: "Update Hermes?",
        updateHermesConfirmNow: "Update now",
        updateHermesConfirmTitle: "Update Hermes",
        updatingHermes: "Updating Hermes",
      },
    },
  }),
}));
vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({
    onConfirm,
    open,
    title,
  }: {
    onConfirm: () => void;
    open: boolean;
    title: string;
  }) => {
    if (title === "Update Hermes") {
      confirmDialogMocks.latestUpdateOnConfirm = onConfirm;
    }
    return open ? <button onClick={onConfirm} type="button">{title}</button> : null;
  },
}));

let container: HTMLDivElement;
let root: Root;

function statusWithUpdatePolicy(canUpdateHermes: boolean): StatusResponse {
  return {
    active_sessions: 0,
    can_update_hermes: canUpdateHermes,
    config_path: "/tmp/.myking/config.yaml",
    config_version: 1,
    env_path: "/tmp/.myking/.env",
    gateway_exit_reason: null,
    gateway_health_url: null,
    gateway_pid: null,
    gateway_platforms: {},
    gateway_running: true,
    gateway_state: "running",
    gateway_updated_at: null,
    hermes_home: "/tmp/.myking",
    latest_config_version: 1,
    release_date: "2026-08-23",
    version: "1.2.3",
  };
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  apiMocks.checkHermesUpdate.mockReset();
  apiMocks.checkHermesUpdate.mockResolvedValue({
    behind: 0,
    can_apply: true,
    current_version: "1.2.3",
    install_method: "git",
    message: null,
    update_available: false,
    update_command: "hermes update",
  });
  systemActionMocks.runAction.mockReset();
  confirmDialogMocks.latestUpdateOnConfirm = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("SidebarSystemActions", () => {
  it("does not expose an update action for a managed deployment", async () => {
    // Given: a managed deployment that reports updates as externally controlled.
    // When: the desktop-width sidebar renders its system actions.
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SidebarSystemActions
            collapsed={false}
            onNavigate={() => {}}
            status={statusWithUpdatePolicy(false)}
            tooltipWarmRef={{ current: 0 }}
          />
        </MemoryRouter>,
      );
    });

    // Then: it retains gateway control but provides neither update entry nor update probe.
    expect(container.textContent).toContain("Restart gateway");
    expect(container.textContent).not.toContain("Update Hermes");
    expect(apiMocks.checkHermesUpdate).not.toHaveBeenCalled();
  });

  it("keeps the confirmation check for an explicitly updatable deployment", async () => {
    // Given: a deployment that explicitly permits Hermes updates.
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SidebarSystemActions
            collapsed={false}
            onNavigate={() => {}}
            status={statusWithUpdatePolicy(true)}
            tooltipWarmRef={{ current: 0 }}
          />
        </MemoryRouter>,
      );
    });
    const updateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Update Hermes",
    );
    if (!updateButton) throw new Error("Expected an available update action");

    // When: the user requests an update confirmation.
    await act(async () => updateButton.click());

    // Then: the usual cached update check still runs.
    expect(apiMocks.checkHermesUpdate).toHaveBeenCalledWith(false);
  });

  it("closes a pending update confirmation when updates become managed", async () => {
    // Given: a normal deployment whose sidebar has an available update action.
    const renderSidebar = (canUpdateHermes: boolean) => (
      <MemoryRouter>
        <SidebarSystemActions
          collapsed={false}
          onNavigate={() => {}}
          status={statusWithUpdatePolicy(canUpdateHermes)}
          tooltipWarmRef={{ current: 0 }}
        />
      </MemoryRouter>
    );
    await act(async () => root.render(renderSidebar(true)));
    const updateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Update Hermes",
    );
    if (!updateButton) throw new Error("Expected an available update action");

    // When: the user opens its confirmation and the next status refresh makes
    // the deployment externally managed before React commits the effect.
    await act(async () => {
      updateButton.click();
      root.render(renderSidebar(false));
    });

    // Then: the dialog and its check request disappear, and a queued confirm
    // callback cannot delegate an update action after policy revocation.
    expect(apiMocks.checkHermesUpdate).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Update Hermes");
    const staleConfirm = confirmDialogMocks.latestUpdateOnConfirm;
    if (!staleConfirm) throw new Error("Expected the initial confirmation handler");
    await act(async () => staleConfirm());
    expect(systemActionMocks.runAction).not.toHaveBeenCalled();
  });
});
