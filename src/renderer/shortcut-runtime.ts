// ---------------------------------------------------------------------------
// Renderer-visible shortcut runtime.
//
// Pure matcher helpers (asset/folder/collection keyboard hooks) cannot consume
// React context. The ShortcutProvider keeps this small mirror in sync; tests
// can reset it through setShortcutRuntime.
// ---------------------------------------------------------------------------

import {
  findShortcutAction,
  type ShortcutPlatform,
} from "../shared/shortcut-catalog";
import {
  DEFAULT_SHORTCUT_BINDINGS,
  type ShortcutBindings,
} from "../shared/shortcut-bindings";
import {
  formatActionShortcut,
  matchesActionShortcut,
  type ShortcutEventLike,
} from "../shared/shortcut-resolution";

let runtimePlatform: ShortcutPlatform = "windows";
let runtimeBindings: ShortcutBindings = DEFAULT_SHORTCUT_BINDINGS;
let runtimeVersion = 0;

export function setShortcutRuntime(
  platform: ShortcutPlatform,
  bindings: ShortcutBindings,
): void {
  runtimePlatform = platform;
  runtimeBindings = bindings;
  runtimeVersion += 1;
}

export function getShortcutRuntimePlatform(): ShortcutPlatform {
  return runtimePlatform;
}

export function getShortcutRuntimeBindings(): ShortcutBindings {
  return runtimeBindings;
}

export function getShortcutRuntimeVersion(): number {
  return runtimeVersion;
}

/** Returns null when the action is not part of the custom catalog. */
export function matchesRuntimeShortcut(
  actionId: string,
  event: ShortcutEventLike,
  platform: ShortcutPlatform = runtimePlatform,
): boolean | null {
  if (!findShortcutAction(actionId)) return null;
  return matchesActionShortcut(actionId, event, platform, runtimeBindings);
}

/** Returns null when the action is not part of the custom catalog. */
export function formatRuntimeShortcut(
  actionId: string,
  platform: ShortcutPlatform = runtimePlatform,
): string | null {
  if (!findShortcutAction(actionId)) return null;
  return formatActionShortcut(actionId, platform, runtimeBindings);
}
