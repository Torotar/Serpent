import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron as electron, expect, test } from "@playwright/test";

import { resolveElectronExecutablePath } from "./electron-test-helpers";

test.describe.configure({ timeout: 60_000 });

function environment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

test("persists custom shortcut overrides through preload and Main", async () => {
  const executablePath = resolveElectronExecutablePath();
  const applicationDirectory =
    process.env.SERPENT_E2E_APP_DIRECTORY ?? process.cwd();
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "serpent-shortcuts-e2e-"));
  const profilePath = path.join(temporaryRoot, "profile");
  mkdirSync(profilePath);
  const exportPath = path.join(temporaryRoot, "shortcuts-export.json");
  const importPath = path.join(temporaryRoot, "shortcuts-import.json");
  const platform = process.platform === "darwin" ? "mac" : "windows";
  const env = {
    ...environment(),
    SERPENT_E2E: "1",
    SERPENT_E2E_HIDE_WINDOW: "1",
    SERPENT_E2E_USER_DATA_PATH: profilePath,
    SERPENT_E2E_SHORTCUTS_EXPORT_PATH: exportPath,
    SERPENT_E2E_SHORTCUTS_IMPORT_PATH: importPath,
  };

  let application = await electron.launch({
    executablePath,
    args: [applicationDirectory],
    cwd: applicationDirectory,
    env,
  });
  try {
    const window = await application.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    const initial = await window.evaluate(async () => {
      const api = (window as unknown as {
        serpent?: { shortcuts?: { get(): Promise<unknown> } };
      }).serpent?.shortcuts;
      return api?.get() ?? null;
    });
    expect(initial).not.toBeNull();

    const saved = await window.evaluate(
      async ({ platform: targetPlatform }) => {
        const api = (window as unknown as {
          serpent?: {
            shortcuts?: {
              set(input: {
                platform: string;
                bindings: Record<string, unknown>;
              }): Promise<{ ok: boolean }>;
            };
          };
        }).serpent?.shortcuts;
        return api?.set({
          platform: targetPlatform,
          bindings: {
            "asset.rename": { key: "F3", code: "F3" },
          },
        }) ?? null;
      },
      { platform },
    );
    expect(saved?.ok).toBe(true);

    const exported = await window.evaluate(async () => {
      const api = (window as unknown as {
        serpent?: { shortcuts?: { exportToFile(): Promise<{ ok: boolean }> } };
      }).serpent?.shortcuts;
      return api?.exportToFile() ?? null;
    });
    expect(exported?.ok).toBe(true);
    const exportedSettings = JSON.parse(readFileSync(exportPath, "utf8")) as {
      platforms: Record<string, Record<string, unknown>>;
    };
    expect(exportedSettings.platforms[platform]?.["asset.rename"]).toEqual({
      key: "F3",
      code: "F3",
    });

    exportedSettings.platforms[platform]!["asset.rename"] = {
      key: "F4",
      code: "F4",
    };
    writeFileSync(importPath, JSON.stringify(exportedSettings), "utf8");
    const imported = await window.evaluate(async () => {
      const api = (window as unknown as {
        serpent?: { shortcuts?: { importFromFile(): Promise<{ ok: boolean }> } };
      }).serpent?.shortcuts;
      return api?.importFromFile() ?? null;
    });
    expect(imported?.ok).toBe(true);

    await application.evaluate(({ app }) => app.quit());
    await application.close().catch(() => undefined);

    application = await electron.launch({
      executablePath,
      args: [applicationDirectory],
      cwd: applicationDirectory,
      env,
    });
    const restoredWindow = await application.firstWindow();
    await restoredWindow.waitForLoadState("domcontentloaded");
    const restored = await restoredWindow.evaluate(
      async ({ platform: targetPlatform }) => {
        const api = (window as unknown as {
          serpent?: { shortcuts?: { get(): Promise<unknown> } };
        }).serpent?.shortcuts;
        const snapshot = await api?.get();
        if (!snapshot || typeof snapshot !== "object") return null;
        return (snapshot as {
          platforms?: Record<string, Record<string, unknown>>;
        }).platforms?.[targetPlatform]?.["asset.rename"] ?? null;
      },
      { platform },
    );
    expect(restored).toEqual({ key: "F4", code: "F4" });
  } finally {
    await application.evaluate(({ app }) => app.quit()).catch(() => undefined);
    await application.close().catch(() => undefined);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
