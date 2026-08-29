// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

vi.mock("@nous-research/ui/ui/components/confirm-dialog", () => ({
  ConfirmDialog: ({
    cancelLabel,
    confirmLabel,
    open,
  }: {
    cancelLabel?: string;
    confirmLabel?: string;
    open: boolean;
  }) =>
    open ? (
      <div>
        <button type="button">{cancelLabel}</button>
        <button type="button">{confirmLabel}</button>
      </div>
    ) : null,
}));

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
});

describe("ConfirmDialog", () => {
  it("uses the current Chinese locale for omitted action labels", async () => {
    // Given: the managed dashboard uses its default simplified-Chinese locale.
    // When: a caller opens a confirmation without overriding button labels.
    await act(async () => {
      root.render(
        <ConfirmDialog
          onCancel={() => {}}
          onConfirm={() => {}}
          open
          title="确认操作"
        />,
      );
    });

    // Then: the shared dialog never falls back to upstream English actions.
    expect(document.body.textContent).toContain("取消");
    expect(document.body.textContent).toContain("确认");
    expect(document.body.textContent).not.toContain("Cancel");
    expect(document.body.textContent).not.toContain("Confirm");
  });
});
