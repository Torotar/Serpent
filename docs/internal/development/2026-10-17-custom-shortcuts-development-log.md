# 2026-10-17 自定义快捷键 v1-lite 开发日志

> 工单：`Serpent-963e00`
> 状态：v1-lite 实现完成，待人类验收
> 方案：[custom-keyboard-shortcuts-plan.md](../implementation/custom-keyboard-shortcuts-plan.md)

## 交付范围

首个交付只覆盖高频文件/侧栏命令，避免把 macOS 原生菜单、查看器 IME 和滚轮手势一起引入：

- 可编辑动作：资产打开外部程序、在文件管理器显示、库内定位、复制路径、重命名、移入回收站、从硬盘删除；文件夹在文件管理器显示、新建子文件夹、重命名、移入回收站、从硬盘删除；合集新建子合集、重命名、删除；聚焦搜索、刷新。
- 固定占用动作参与冲突检测但不显示编辑入口：资产复制/粘贴、文件夹复制/粘贴、全选/反选、撤销/重做、缩放、窗口全屏、查看资产（Enter/Space）。
- 修复三个幽灵快捷键：`folder.copy`、`folder.paste`、`collection.create-subcollection` 现在都有真实键盘分发。

## 实现

### 共享目录与解析

- `src/shared/shortcut-catalog.ts`：30 个动作（17 个可编辑 + 13 个固定占用），角色、作用域、双平台默认键、分发入口。
- `src/shared/shortcut-bindings.ts`：Zod schema、覆盖解析、`null` 取消主键、未知 id 保留。
- `src/shared/shortcut-resolution.ts`：有效绑定、平台格式化、`code`/`key`/`keyCode` 匹配、同作用域冲突、固定动作冲突、系统保留键、IME `Process` 恢复、可分配性校验。

### 本机持久化

- 覆盖保存在 Main 的 `userData/shortcut-bindings.json`，与资源库无关。
- `src/main/shortcut-bindings-store.ts` 负责读取、写入和损坏回退。
- `src/shared/protocol/channels.ts` 新增 `serpent:shortcuts:get/set`；`src/preload/bridge/shortcuts.ts` 暴露 `window.serpent.shortcuts`。
- Main 在写入前二次校验：只接受目录内动作、拒绝固定动作覆盖、拒绝非法键和冲突绑定；写入后返回有效快照。

### Renderer

- `src/renderer/shortcut-provider.tsx` 启动读取快照，驱动 `shortcut-runtime.ts`；设置页和纯匹配器使用同一份有效绑定。
- 命令注册表的菜单标签改为优先读解析结果，右键菜单会显示用户的新键。
- `use-browse-command-keyboard`、`use-folder-command-shortcuts`、`use-collection-command-shortcuts`、`asset-action-keyboard`、`workspace-discovery-shortcuts` 改为按 action id 匹配。
- 侧栏焦点优先：浏览资产快捷键在侧栏文件夹/合集行聚焦时让路；文件夹快捷键在合集行聚焦时让路。
- Windows 隐藏菜单保持默认 F2/Delete/Shift+Delete 兜底；自定义键由 Renderer 处理，旧默认键转发后会被新绑定拒绝，不会产生双触发。

### 设置界面

- 设置新增「快捷键」分类，按资产/文件夹/合集/应用分组。
- 支持搜索、全部/已修改/冲突过滤、逐行更改、清除、恢复默认、全部恢复。
- 「已修改」标记放在动作名右侧；动作名/标记/作用域/键帽/更改/恢复压缩到同一行；更改/恢复使用铅笔/撤销图标。点击更改后键帽原位变成输入框，先显示「等待输入」，按键后显示组合键；右侧 ✓ 或 Enter 确认，× 取消，垃圾桶清除绑定。键帽和输入框改用界面正常字体。
- 录制态实时显示修饰键，`Esc` 取消，输入法组合中的按键不误判。
- 冲突时输入框背景变红；错误日志以纯红文本直接显示在行下方，不显示「替换」或「取消」按钮。用户换一个组合键，或点 ×/Esc 退出编辑。
- 固定手势区展示滚轮、Ctrl/Cmd+滚轮、中键拖拽、查看器 Esc/←/→。
- 页脚提供 JSON 导入/导出；导出写完整覆盖表，导入前校验 schema、版本、平台、保留键、固定动作和冲突；导入只替换当前平台，保留另一平台设置。
- 文案、键帽、焦点返回、`aria-live`/`role="alert"`、窄窗口布局均按方案实现。

## 验证

| 命令 | 结果 |
| --- | --- |
| `NODE_OPTIONS=--localstorage-file=<临时文件> npx vitest run ...`（17 个快捷键/命令/设置相关文件） | 17 files / 202 passed |
| `NODE_OPTIONS=--localstorage-file=<临时文件> npm run test:unit` | 633 passed / 3 unrelated failures（semantic runtime owner、win32 clipboard 短路径大小写）/ 10 skipped |
| `node scripts/run-e2e.mjs tests/e2e/custom-shortcuts.test.ts` | 1 passed（preload → Main 存储 → 导出 → 导入 → 重启恢复） |
| 真实 Electron Playwright 截图检查 | 单行列表、行内输入框的等待/结果/确认状态、已修改标记、页脚导入/导出按钮布局通过；截图保存在临时目录，未纳入仓库 |
| `npx tsc --noEmit` | 通过 |
| 改动文件 ESLint | 0 error（`App.tsx` 仅保留改动前的 2 条 react-hooks warning） |

`npm run test:unit` 不带 `--localstorage-file` 时，当前 Node 26 环境会让多个既有 happy-dom 套件因 `localStorage` 缺失失败；这不是本次改动引入。

未执行：Computer Use 交互验收（已用真实 Electron Playwright 截图做视觉检查）、packaged 构建、Windows 中文输入法真机字母键/自定义键组合验收、macOS 原生菜单（v1-lite 不改原生菜单）。

## 已知边界

- 查看器媒体键、鼠标/滚轮、插件快捷键、macOS 原生菜单和 Windows 隐藏菜单的自动重建属于 R2/R3，尚未开放。
- 自定义键限制为非裸字母/数字（功能键或带修饰键）；这是为了避开 Windows IME 把裸字母吞掉的问题。
- 设置页目前在真实 Electron 中只通过 E2E API 持久化与组件测试验证，仍需人类按验收清单点验视觉和交互。
