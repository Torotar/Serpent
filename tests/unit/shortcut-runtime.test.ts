import { afterEach, describe, expect, it } from "vitest";

import {
  formatRuntimeShortcut,
  matchesRuntimeShortcut,
  setShortcutRuntime,
} from "../../src/renderer/shortcut-runtime";
import {
  DEFAULT_SHORTCUT_BINDINGS,
  setShortcutOverride,
} from "../../src/shared/shortcut-bindings";

const event = (key: string, code: string) => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
});

afterEach(() => {
  setShortcutRuntime("windows", DEFAULT_SHORTCUT_BINDINGS);
});

describe("shortcut runtime", () => {
  it("routes matchers and menu labels through the current override", () => {
    const bindings = setShortcutOverride(
      DEFAULT_SHORTCUT_BINDINGS,
      "windows",
      "asset.rename",
      { key: "F3", code: "F3" },
    );
    setShortcutRuntime("windows", bindings);

    expect(formatRuntimeShortcut("asset.rename", "windows")).toBe("F3");
    expect(matchesRuntimeShortcut("asset.rename", event("F3", "F3"), "windows")).toBe(true);
    expect(matchesRuntimeShortcut("asset.rename", event("F2", "F2"), "windows")).toBe(false);
    expect(matchesRuntimeShortcut("not-a-catalog-action", event("F3", "F3"), "windows")).toBeNull();
  });
});
