import { describe, expect, it } from "vitest";

import { assetCommandDefinitions } from "../../src/renderer/commands/asset-commands";
import { sidebarCommandDefinitions } from "../../src/renderer/commands/sidebar-commands";
import { toolbarCommandDefinitions } from "../../src/renderer/commands/toolbar-commands";
import {
  SHORTCUT_ACTIONS,
  findShortcutAction,
  shortcutScopesOverlap,
} from "../../src/shared/shortcut-catalog";
import { formatShortcutChord } from "../../src/shared/shortcut-resolution";

const definitionById = new Map(
  [
    ...assetCommandDefinitions,
    ...sidebarCommandDefinitions,
    ...toolbarCommandDefinitions,
  ].map((definition) => [definition.id, definition]),
);

describe("shortcut catalog", () => {
  it("has unique ids and both platform defaults", () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of SHORTCUT_ACTIONS) {
      expect(action.defaults.mac.length, action.id).toBeGreaterThan(0);
      expect(action.defaults.windows.length, action.id).toBeGreaterThan(0);
      expect(findShortcutAction(action.id)).toBe(action);
    }
  });

  it("matches the command-definition defaults for every shared action", () => {
    for (const action of SHORTCUT_ACTIONS) {
      const definition = definitionById.get(action.id);
      if (definition?.shortcut === undefined) continue;
      expect(
        formatShortcutChord(action.defaults.mac[0]!, "mac"),
        action.id,
      ).toBe(definition.shortcut.mac?.label);
      expect(
        formatShortcutChord(action.defaults.windows[0]!, "windows"),
        action.id,
      ).toBe(definition.shortcut.windows?.label);
    }
  });

  it("keeps folder and collection sidebar scopes independent", () => {
    expect(shortcutScopesOverlap(["app"], ["browse"])).toBe(true);
    expect(shortcutScopesOverlap(["browse"], ["sidebar.folder"])).toBe(false);
    expect(shortcutScopesOverlap(["sidebar.folder"], ["sidebar.collection"])).toBe(false);
    expect(shortcutScopesOverlap(["sidebar.folder"], ["sidebar.folder"])).toBe(true);
  });
});
