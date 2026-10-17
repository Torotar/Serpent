// ---------------------------------------------------------------------------
// Custom keyboard shortcut catalog (v1-lite)
//
// One declaration per user-configurable action. The same catalog feeds the
// Renderer matchers, context-menu labels and the shortcut settings page.
// It is pure data: no React, Electron or i18n runtime imports.
// ---------------------------------------------------------------------------

export type ShortcutPlatform = "mac" | "windows";

/** Where an action can fire. Browse and sidebar are mutually exclusive by focus. */
export type ShortcutScope =
  | "app"
  | "browse"
  | "sidebar.folder"
  | "sidebar.collection";

export type ShortcutSurface =
  | "renderer"
  | "context-menu"
  | "hidden-accelerator";

export type ShortcutCategory = "asset" | "folder" | "collection" | "app";

export type ShortcutChord = {
  /** Logical key used for display and named-key matching. */
  readonly key: string;
  /** Physical key (KeyboardEvent.code); preferred for letters/digits/F keys. */
  readonly code?: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
};

export type ShortcutActionDefinition = {
  readonly id: string;
  readonly labelKey: string;
  readonly category: ShortcutCategory;
  readonly scopes: readonly ShortcutScope[];
  /** false = occupied by an existing shortcut but not editable in v1-lite. */
  readonly customizable: boolean;
  readonly defaults: {
    readonly mac: readonly ShortcutChord[];
    readonly windows: readonly ShortcutChord[];
  };
  readonly surfaces: readonly ShortcutSurface[];
};

const chord = (
  key: string,
  modifiers: Omit<ShortcutChord, "key" | "code"> & { code?: string } = {},
): ShortcutChord => ({
  key,
  ...(modifiers.code === undefined ? {} : { code: modifiers.code }),
  ...(modifiers.metaKey === undefined ? {} : { metaKey: modifiers.metaKey }),
  ...(modifiers.ctrlKey === undefined ? {} : { ctrlKey: modifiers.ctrlKey }),
  ...(modifiers.altKey === undefined ? {} : { altKey: modifiers.altKey }),
  ...(modifiers.shiftKey === undefined ? {} : { shiftKey: modifiers.shiftKey }),
});

const command = (key: string, platform: ShortcutPlatform): ShortcutChord =>
  platform === "mac"
    ? chord(key, { code: `Key${key.toUpperCase()}`, metaKey: true })
    : chord(key, { code: `Key${key.toUpperCase()}`, ctrlKey: true });

const shiftCommand = (key: string, platform: ShortcutPlatform): ShortcutChord =>
  platform === "mac"
    ? chord(key, { code: `Key${key.toUpperCase()}`, metaKey: true, shiftKey: true })
    : chord(key, { code: `Key${key.toUpperCase()}`, ctrlKey: true, shiftKey: true });

const functionKey = (key: string): ShortcutChord =>
  chord(key, { code: key });

const [assetOpenExternalMac, assetOpenExternalWin] = [
  command("o", "mac"),
  command("o", "windows"),
];
const [assetRevealMac, assetRevealWin] = [
  shiftCommand("s", "mac"),
  shiftCommand("s", "windows"),
];
const [assetShowInLibraryMac, assetShowInLibraryWin] = [
  command("b", "mac"),
  command("b", "windows"),
];
const [assetCopyPathMac, assetCopyPathWin] = [
  chord("c", { code: "KeyC", metaKey: true, altKey: true }),
  chord("c", { code: "KeyC", ctrlKey: true, shiftKey: true }),
];
const [folderCreateMac, folderCreateWin] = [
  shiftCommand("n", "mac"),
  shiftCommand("n", "windows"),
];
const [focusSearchMac, focusSearchWin] = [
  command("f", "mac"),
  command("f", "windows"),
];
const refresh = functionKey("F5");
const rename = functionKey("F2");
const moveToTrashMac = chord("Backspace", {
  code: "Backspace",
  metaKey: true,
});
const moveToTrashWin = chord("Delete", { code: "Delete" });
const deleteFromDiskMac = chord("Delete", {
  code: "Delete",
  metaKey: true,
  altKey: true,
});
const deleteFromDiskWin = chord("Delete", {
  code: "Delete",
  shiftKey: true,
});

const sharedDefaults = {
  mac: [rename],
  windows: [rename],
} as const;

const sharedTrashDefaults = {
  mac: [moveToTrashMac],
  windows: [moveToTrashWin],
} as const;

const sharedDiskDeleteDefaults = {
  mac: [deleteFromDiskMac],
  windows: [deleteFromDiskWin],
} as const;

const rendererAndContext: readonly ShortcutSurface[] = [
  "renderer",
  "context-menu",
];

const rendererContextAndHidden: readonly ShortcutSurface[] = [
  "renderer",
  "context-menu",
  "hidden-accelerator",
];

export const SHORTCUT_ACTIONS: readonly ShortcutActionDefinition[] = Object.freeze([
  {
    id: "asset.open-external",
    labelKey: "shortcuts.action.asset.openExternal",
    category: "asset",
    scopes: ["browse"],
    defaults: {
      mac: [assetOpenExternalMac],
      windows: [assetOpenExternalWin],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  {
    id: "asset.reveal-in-folder",
    labelKey: "shortcuts.action.asset.revealInFolder",
    category: "asset",
    scopes: ["browse"],
    defaults: {
      mac: [assetRevealMac],
      windows: [assetRevealWin],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  {
    id: "asset.show-in-library-folder",
    labelKey: "shortcuts.action.asset.showInLibraryFolder",
    category: "asset",
    scopes: ["browse"],
    defaults: {
      mac: [assetShowInLibraryMac],
      windows: [assetShowInLibraryWin],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  {
    id: "asset.copy-file-path",
    labelKey: "shortcuts.action.asset.copyFilePath",
    category: "asset",
    scopes: ["browse"],
    defaults: {
      mac: [assetCopyPathMac],
      windows: [assetCopyPathWin],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  {
    id: "asset.rename",
    labelKey: "shortcuts.action.asset.rename",
    category: "asset",
    scopes: ["browse"],
    defaults: sharedDefaults,
    customizable: true,
    surfaces: rendererContextAndHidden,
  },
  {
    id: "asset.move-to-trash",
    labelKey: "shortcuts.action.asset.moveToTrash",
    category: "asset",
    scopes: ["browse"],
    defaults: sharedTrashDefaults,
    customizable: true,
    surfaces: rendererContextAndHidden,
  },
  {
    id: "asset.delete-from-disk",
    labelKey: "shortcuts.action.asset.deleteFromDisk",
    category: "asset",
    scopes: ["browse"],
    defaults: sharedDiskDeleteDefaults,
    customizable: true,
    surfaces: rendererContextAndHidden,
  },
  {
    id: "folder.open-in-file-manager",
    labelKey: "shortcuts.action.folder.openInFileManager",
    category: "folder",
    scopes: ["sidebar.folder"],
    defaults: {
      mac: [assetRevealMac],
      windows: [assetRevealWin],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  {
    id: "folder.create-subfolder",
    labelKey: "shortcuts.action.folder.createSubfolder",
    category: "folder",
    scopes: ["sidebar.folder"],
    defaults: {
      mac: [folderCreateMac],
      windows: [folderCreateWin],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  {
    id: "folder.rename",
    labelKey: "shortcuts.action.folder.rename",
    category: "folder",
    scopes: ["sidebar.folder"],
    defaults: sharedDefaults,
    customizable: true,
    surfaces: rendererContextAndHidden,
  },
  {
    id: "folder.move-to-trash",
    labelKey: "shortcuts.action.folder.moveToTrash",
    category: "folder",
    scopes: ["sidebar.folder"],
    defaults: sharedTrashDefaults,
    customizable: true,
    surfaces: rendererContextAndHidden,
  },
  {
    id: "folder.delete-from-disk",
    labelKey: "shortcuts.action.folder.deleteFromDisk",
    category: "folder",
    scopes: ["sidebar.folder"],
    defaults: sharedDiskDeleteDefaults,
    customizable: true,
    surfaces: rendererContextAndHidden,
  },
  {
    id: "collection.create-subcollection",
    labelKey: "shortcuts.action.collection.createSubcollection",
    category: "collection",
    scopes: ["sidebar.collection"],
    defaults: {
      mac: [folderCreateMac],
      windows: [folderCreateWin],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  {
    id: "collection.rename",
    labelKey: "shortcuts.action.collection.rename",
    category: "collection",
    scopes: ["sidebar.collection"],
    defaults: sharedDefaults,
    customizable: true,
    surfaces: rendererContextAndHidden,
  },
  {
    id: "collection.delete",
    labelKey: "shortcuts.action.collection.delete",
    category: "collection",
    scopes: ["sidebar.collection"],
    defaults: sharedTrashDefaults,
    customizable: true,
    surfaces: rendererContextAndHidden,
  },
  {
    id: "workspace.focus-search",
    labelKey: "shortcuts.action.app.focusSearch",
    category: "app",
    scopes: ["app"],
    defaults: {
      mac: [focusSearchMac],
      windows: [focusSearchWin],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  {
    id: "canvas.refresh",
    labelKey: "shortcuts.action.app.refresh",
    category: "app",
    scopes: ["browse"],
    defaults: {
      mac: [refresh],
      windows: [refresh],
    },
    customizable: true,
    surfaces: rendererAndContext,
  },
  // Occupied shortcuts kept out of the v1-lite editor. They still participate
  // in conflict detection so a custom chord cannot silently shadow them.
  {
    id: "asset.view",
    labelKey: "command.asset.view",
    category: "asset",
    scopes: ["browse"],
    defaults: {
      mac: [chord("Enter", { code: "Enter" }), chord("Space", { code: "Space" })],
      windows: [chord("Enter", { code: "Enter" }), chord("Space", { code: "Space" })],
    },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "asset.copy",
    labelKey: "command.asset.copy",
    category: "asset",
    scopes: ["browse"],
    defaults: { mac: [command("c", "mac")], windows: [command("c", "windows")] },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "asset.paste",
    labelKey: "command.asset.paste",
    category: "asset",
    scopes: ["browse"],
    defaults: { mac: [command("v", "mac")], windows: [command("v", "windows")] },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "folder.copy",
    labelKey: "command.folder.copy",
    category: "folder",
    scopes: ["sidebar.folder"],
    defaults: { mac: [command("c", "mac")], windows: [command("c", "windows")] },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "folder.paste",
    labelKey: "command.folder.paste",
    category: "folder",
    scopes: ["sidebar.folder"],
    defaults: { mac: [command("v", "mac")], windows: [command("v", "windows")] },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "selection.select-all",
    labelKey: "shell.mainMenuSelectAll",
    category: "asset",
    scopes: ["browse"],
    defaults: { mac: [command("a", "mac")], windows: [command("a", "windows")] },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "selection.invert",
    labelKey: "shell.mainMenuInvertSelection",
    category: "asset",
    scopes: ["browse"],
    defaults: { mac: [command("i", "mac")], windows: [command("i", "windows")] },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "edit.undo",
    labelKey: "shell.mainMenuUndo",
    category: "app",
    scopes: ["app"],
    defaults: { mac: [command("z", "mac")], windows: [command("z", "windows")] },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "edit.redo",
    labelKey: "shell.mainMenuRedo",
    category: "app",
    scopes: ["app"],
    defaults: {
      mac: [shiftCommand("z", "mac")],
      windows: [shiftCommand("z", "windows")],
    },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "canvas.zoom-in",
    labelKey: "shortcuts.action.fixed.zoomIn",
    category: "app",
    scopes: ["app"],
    defaults: {
      mac: [chord("=", { code: "Equal", metaKey: true })],
      windows: [chord("=", { code: "Equal", ctrlKey: true })],
    },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "canvas.zoom-out",
    labelKey: "shortcuts.action.fixed.zoomOut",
    category: "app",
    scopes: ["app"],
    defaults: {
      mac: [chord("-", { code: "Minus", metaKey: true })],
      windows: [chord("-", { code: "Minus", ctrlKey: true })],
    },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "canvas.zoom-reset",
    labelKey: "shortcuts.action.fixed.zoomReset",
    category: "app",
    scopes: ["app"],
    defaults: {
      mac: [chord("0", { code: "Digit0", metaKey: true })],
      windows: [chord("0", { code: "Digit0", ctrlKey: true })],
    },
    customizable: false,
    surfaces: rendererAndContext,
  },
  {
    id: "window.toggle-fullscreen",
    labelKey: "shell.mainMenuToggleFullscreen",
    category: "app",
    scopes: ["app"],
    defaults: {
      mac: [chord("f", { code: "KeyF", metaKey: true, ctrlKey: true })],
      windows: [chord("F11", { code: "F11" })],
    },
    customizable: false,
    surfaces: rendererAndContext,
  },
]);

const ACTION_BY_ID = new Map(SHORTCUT_ACTIONS.map((action) => [action.id, action]));

export function findShortcutAction(
  actionId: string,
): ShortcutActionDefinition | undefined {
  return ACTION_BY_ID.get(actionId);
}

export function shortcutActionIds(): readonly string[] {
  return SHORTCUT_ACTIONS.map((action) => action.id);
}

export function shortcutScopesOverlap(
  left: readonly ShortcutScope[],
  right: readonly ShortcutScope[],
): boolean {
  if (left.includes("app") || right.includes("app")) return true;
  return left.some((scope) => right.includes(scope));
}

export const SHORTCUT_CATEGORY_ORDER: readonly ShortcutCategory[] = [
  "asset",
  "folder",
  "collection",
  "app",
];
