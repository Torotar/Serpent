# 链接文件强制删除快捷键 QA

- 日期：2026-10-24
- 分支与代码基线：`dev` / `e439ab52`，测试当前工作树
- 环境：Windows，Node.js 24.14.0；隔离 userData 与临时源目录的 Electron E2E
- 结果：定向单测、typecheck、lint 与链接文件夹 Electron E2E 通过；人类验收、macOS 和 packaged 未执行。

## 规格追溯

| 需求 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 链接文件强制删除快捷键执行与菜单相同的删除动作 | `src/renderer/App.tsx` 的 `diskDeleteKeyboardTargets`；`src/renderer/browse-key-command.ts` 的 `canDeleteAssetFromDiskWithShortcut` | `tests/unit/browse-command-keyboard.test.ts`；`tests/e2e/linked-folders.test.ts` | Windows Electron E2E 实际触发 `Shift+Delete` 并完成隔离样本源文件删除；人类验收待用户执行 |
| 单选、多选菜单显示匹配的平台快捷键 | `src/renderer/commands/asset-shortcuts.ts`；单资产、多资产和文件夹命令定义 | `tests/unit/asset-commands.test.ts`、`tests/unit/asset-multi-commands.test.ts`；链接文件夹 E2E 检查单资产菜单文案 | Windows Electron E2E 菜单显示 `Shift+Delete`；macOS 未执行 |

## 自动化结果

- 定向 Vitest：4 files / 133 tests passed。
- `npm run typecheck`：通过。
- `npm run lint`：exit 0，0 errors、7 React Hook dependency warnings。
- `node scripts/run-e2e.mjs tests/e2e/linked-folders.test.ts`：5 tests passed。键盘覆盖使用隔离 userData 和临时源目录，并在 finally 中关闭应用、清理临时数据。
- `git diff --check`：通过。

## 未执行与限制

- 未在真实用户会话中用 Computer Use 操作，也未在 macOS 或 packaged app 验证。`LINKED-FILE-DELETE-SHORTCUT-01` 保持“待人类验收”。
- 未运行完整 `npm test`、`test:e2e` 或 `verify:mainline`；本次只改渲染层键盘目标、命令菜单定义及相关测试，无 Worker、资源库 schema 或 IPC 变化。
