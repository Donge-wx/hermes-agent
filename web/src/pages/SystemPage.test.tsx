// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SystemPage from "./SystemPage";

const apiMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getSystemStats: vi.fn(),
  getMemory: vi.fn(),
  getCredentialPool: vi.fn(),
  getCheckpoints: vi.fn(),
  getHooks: vi.fn(),
  getCurator: vi.fn(),
  getPortal: vi.fn(),
  checkHermesUpdate: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function configureManagedDashboard() {
  apiMocks.getStatus.mockResolvedValue({
    can_update_hermes: false,
    gateway_platforms: {},
    gateway_running: true,
  });
  apiMocks.getSystemStats.mockResolvedValue({
    arch: "arm64",
    hermes_version: "1.2.3",
    hostname: "my-king",
    os: "macOS",
    os_release: "26",
    psutil: false,
    python_impl: "CPython",
    python_version: "3.13",
  });
  apiMocks.getMemory.mockResolvedValue({
    active: null,
    builtin_files: { memory: 0, user: 0 },
    providers: [],
  });
  apiMocks.getCredentialPool.mockResolvedValue({ providers: [] });
  apiMocks.getCheckpoints.mockResolvedValue({ sessions: [], total_bytes: 0 });
  apiMocks.getHooks.mockResolvedValue({ hooks: [], valid_events: [] });
  apiMocks.getCurator.mockResolvedValue({ enabled: false, paused: false });
  apiMocks.getPortal.mockResolvedValue({
    features: [],
    logged_in: false,
    provider: "",
    subscription_url: "https://portal.nousresearch.com/manage-subscription",
  });
}

function configureOrdinaryDashboard() {
  configureManagedDashboard();
  apiMocks.getStatus.mockResolvedValue({
    can_update_hermes: true,
    gateway_platforms: {},
    gateway_running: true,
  });
  apiMocks.checkHermesUpdate.mockResolvedValue({
    behind: 0,
    can_apply: true,
    current_version: "1.2.3",
    install_method: "git",
    message: null,
    update_available: false,
    update_command: "hermes update",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configureManagedDashboard();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("SystemPage", () => {
  it("does not request or expose Hermes update controls when updates are managed", async () => {
    // Given: a managed dashboard status response that disables Hermes updates.
    // When: the system page loads its version and health information.
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SystemPage />
        </MemoryRouter>,
      );
    });
    await vi.waitFor(() => expect(apiMocks.getStatus).toHaveBeenCalledOnce());

    // Then: it only exposes the installed version and never probes or offers updates.
    expect(apiMocks.checkHermesUpdate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("v1.2.3");
    expect(container.textContent).not.toContain("Check for updates");
    expect(container.textContent).not.toContain("Update now");
    expect(container.textContent).not.toContain("hermes update");
  });

  it("keeps update checks available when the server permits updates", async () => {
    // Given: an ordinary Hermes deployment that explicitly permits updates.
    configureOrdinaryDashboard();

    // When: the system page loads.
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SystemPage />
        </MemoryRouter>,
      );
    });
    await vi.waitFor(() => {
      expect(apiMocks.checkHermesUpdate).toHaveBeenCalledWith(false);
    });

    // Then: the normal update-check control remains available.
    expect(container.textContent).toContain("检查更新");
  });

  it("projects backend status values into Chinese without changing the payload", async () => {
    configureOrdinaryDashboard();
    apiMocks.getStatus.mockResolvedValue({
      can_update_hermes: true,
      gateway_platforms: {},
      gateway_running: false,
      gateway_state: "stopped",
    });
    apiMocks.getSystemStats.mockResolvedValue({
      arch: "arm64",
      hermes_version: "1.2.3",
      hostname: "my-king",
      os: "macOS",
      os_release: "26",
      psutil: true,
      python_impl: "CPython",
      python_version: "3.13",
      uptime_seconds: 9 * 86400 + 60 * 60 + 10 * 60,
    });
    apiMocks.checkHermesUpdate.mockResolvedValue({
      behind: 514,
      can_apply: true,
      current_version: "1.2.3",
      install_method: "git",
      message: null,
      update_available: true,
      update_command: "hermes update",
    });
    apiMocks.getPortal.mockResolvedValue({
      features: [
        { label: "Web tools", state: "via Nous Portal" },
        { label: "Image generation", state: "not configured" },
        { label: "Browser automation", state: "active" },
      ],
      logged_in: true,
      provider: "",
      subscription_url: "https://portal.nousresearch.com/manage-subscription",
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SystemPage />
        </MemoryRouter>,
      );
    });
    await vi.waitFor(() => expect(apiMocks.getPortal).toHaveBeenCalledOnce());

    expect(container.textContent).toContain("514 个新版本");
    expect(container.textContent).toContain("9 天 1 小时 10 分钟");
    expect(container.textContent).toContain("网页工具");
    expect(container.textContent).toContain("图像生成");
    expect(container.textContent).toContain("浏览器自动化");
    expect(container.textContent).toContain("通过 My King 账户");
    expect(container.textContent).toContain("未配置");
    expect(container.textContent).toContain("已启用");
    expect(container.textContent).not.toContain("behind");
    expect(container.textContent).not.toContain("stopped");
  });
});
