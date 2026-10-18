# 2026-10-17 自定义快捷键开发日志

> 工单：`Serpent-963e00`
> 状态：R1、R2a、R2b 实现完成，待人类验收；R3 未实现
> 方案：[custom-keyboard-shortcuts-plan.md](../implementation/custom-keyboard-shortcuts-plan.md)

## R1 首个交付范围（历史记录）

R1 首个交付只覆盖高频文件/侧栏命令；当时将 macOS 原生菜单、查看器 IME 和滚轮手势留给后续阶段：

- 可编辑动作：资产打开外部程序、在文件管理器显示、库内定位、复制路径、重命名、移入回收站、从硬盘删除；文件夹在文件管理器显示、新建子文件夹、重命名、移入回收站、从硬盘删除；合集新建子合集、重命名、删除；聚焦搜索、刷新。
- 固定占用动作参与冲突检测但不显示编辑入口：资产复制/粘贴、文件夹复制/粘贴、全选/反选、撤销/重做、缩放、窗口全屏、查看资产（Enter/Space）。
- 修复三个幽灵快捷键：`folder.copy`、`folder.paste`、`collection.create-subcollection` 现在都有真实键盘分发。

## 当前共享目录与解析

### 共享目录与解析

- `src/shared/shortcut-catalog.ts`：43 个动作（36 个可编辑 + 7 个固定占用），角色、作用域、双平台默认键、分发入口。
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

R1 阶段未执行：Computer Use 人工交互验收、packaged 构建、Windows 中文输入法真机字母键/自定义键组合验收、macOS 原生菜单（R1 当时不改原生菜单）。Playwright 截图检查仅作为自动化证据，不替代人类验收。

## R2a / R2b 增量

### R2a：应用菜单与文本编辑焦点

- 共享目录新增撤销/重做、资产复制/粘贴、全选/反选及应用缩放动作。macOS 原生菜单 accelerator、Windows 隐藏 accelerator 和 Renderer 菜单标签都从有效绑定重建。
- 设置保存后 Main 原生菜单即时同步。Windows Main `before-input-event` 使用同一份解析结果处理隐藏菜单动作；Renderer 通过焦点 IPC 同步启用状态，文本框和模态框聚焦时禁用应用加速键。
- 输入框中的 Ctrl/Cmd+C/V/A 继续走 Chromium 文本编辑。Main 对隐藏 accelerator 与 `before-input-event` 双路径做同动作去重，并在 matcher 层忽略系统自动重复。

### R2b：查看器媒体动作与输入法

- 共享目录新增 Space 播放/暂停、D/F 逐帧、X/C 调速、Ctrl+←/→ 跳转、音量和 viewer fit；设置自定义覆盖直接驱动现有 viewer handlers。
- Viewer scope 由查看器激活状态与文本/模态焦点共同门控。Esc 和 ←/→ 切资产仍为固定结构键；媒体按键离开对应查看器或进入输入上下文时不触发。
- Windows 裸字母动作沿用隐藏 Menu accelerator、IMM32 转换态暂停与 Main `before-input-event` 兜底，三个入口均使用当前配置。双路径事件去重；系统自动重复不触发第二次动作。

### 本轮验证

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/shortcut-catalog.test.ts tests/unit/application-menu.test.ts tests/unit/main-menu-items.test.ts tests/unit/app-settings-shortcuts-page.test.tsx tests/unit/viewer-video-shortcuts.test.ts tests/unit/viewer-video-shortcut-forward.test.ts tests/unit/selection-keyboard.test.ts tests/unit/global-zoom-shortcuts.test.ts tests/unit/viewer-volume-preferences.test.ts tests/unit/video-player-controls.test.ts tests/unit/viewer-fit-shortcut.test.ts` | 11 files / 111 tests passed |
| `npm run typecheck` | 通过，无诊断 |
| `npm run lint` | 首次运行 0 errors / 8 warnings，其中 1 条是本次新增焦点依赖遗漏；补齐 `editableTextFocused` 后重跑，0 errors / 7 warnings（均位于本次未改动位置） |
| `git diff --check` | 通过，无空白错误 |
| `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 每次以隐藏窗口和临时 `SERPENT_E2E_USER_DATA_PATH` 在后台运行；8 次尝试的逐次结果见下表。 |

| 尝试 | 命令 | 结果 |
| --- | --- | --- |
| 1 | `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 失败：测试直接经 preload API 写设置并假定 Renderer provider 已刷新；该 API 只持久化，没有 provider refresh 广播。改为通过实际设置 UI 操作。 |
| 2 | `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 失败：搜索控件使用 `searchbox` role，测试却按 `textbox` 查找。修正 locator。 |
| 3 | `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 失败：关闭按钮 selector 同时命中设置对话框和窗口标题栏，触发 strict-mode 错误。将 locator 限定在设置对话框内。 |
| 4 | `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 失败：测试搜索过滤掉视频资产后仍双击原 locator，元素 detach。清空搜索并等待资产重新可见。 |
| 5 | `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 失败于真实 viewer 按键断言：系统 repeat 仍改变播放速度。根因是 Renderer 投影丢失 `event.repeat`；修复现有 zoom、video、fit、volume handler 的 repeat 透传与抑制。 |
| 6 | `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 失败于搜索框最终值断言：清空搜索后实际值为 `k`，旧预期仍包含先前剪贴板文本。修正预期，并加 viewer 外不触发媒体动作的断言。 |
| 7 | `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 通过：1 test passed（约 1.1 分钟），实际视频元数据/尺寸、菜单同步、文本输入、viewer 控制和作用域断言均通过。 |
| 8 | `node scripts/run-e2e.mjs tests/e2e/custom-shortcut-runtime.test.ts` | 通过：补齐 `editableTextFocused` 焦点监听依赖后复跑，1 test passed（54.2 秒）。 |

所有 E2E 测试 `finally` 均关闭应用并清理库、媒体 fixture 和 profile。启动器 stdout/stderr 保存在本任务专属临时目录；本代理清理操作被执行策略拒绝，已将目录、创建时间、归属和文件清单交主线程清理。早期 E2E 报告过 viewer 播放速度/跳转/音量/fit 断言通过；后续按非激活窗口的严格证据标准复核后，seek/volume/fit 无法证明真实 Renderer handler 收到输入，不再计为有效 E2E 证据，改由定向 handler/matcher 单测覆盖。当前可采信的 E2E 路径与未执行范围见本日志最后的 follow-up 验证表。单元测试另外覆盖 Windows Process/code/keyCode 输入法恢复匹配、IMM32 状态恢复与 repeat/dedup。真实 Windows CJK 输入法/IMM32 与 macOS 原生菜单仍需人类在对应平台验收；本轮未运行 packaged 构建，也未执行 Computer Use，自动化不替代平台验收。

重复按键的纵向 TDD 命令为 `npx vitest run tests/unit/global-zoom-shortcuts.test.ts tests/unit/video-player-controls.test.ts tests/unit/viewer-volume-preferences.test.ts tests/unit/viewer-fit-shortcut.test.ts`：先得到 4 files / 56 tests、3 failures，分别暴露视频调速、跳转/逐帧和 fit handler 未传递系统 `repeat`；修正四个现有 handler 后同一命令 4 files / 56 tests passed。之后最终 11-file 定向套件增加 selection repeat 检查并通过。

## 已知边界

- 下方 R2a/R2b 已补齐应用菜单动作与查看器媒体动作；插件快捷键和鼠标/滚轮手势仍属于 R3，尚未实现。
- 浏览/应用作用域限制裸字母和数字，避免打字和输入法冲突；R2b 的查看器裸字母动作有独立焦点门控、Windows IMM32 与 Main fallback。
- 设置 UI 的改键流程现由真实 Electron E2E 操作；仍需人类按验收清单点验视觉和平台行为。

## 独立审查 P2 follow-up

修正并补测五项审查问题：

- `useViewerVolume(false)` 让 App 的浏览预览只读共享音量偏好，不注册按键监听；实际打开音频/视频查看器的 `AssetPreviewModal` 持有唯一音量键监听。偏好变化同步到其他 hook 实例，保证关闭查看器后浏览预览仍使用最新值。
- macOS 原生 View zoom 菜单命令在 Renderer 分发前统一检查可编辑焦点和模态框；普通画布焦点仍可缩放。
- 视频与 GIF fit handler 都调用共享快捷键 matcher，支持自定义修饰键组合，同时保留 typing、modal、system repeat 与已存在的 keyboard-shortcuts-disabled 守卫。
- 快捷键 validator 拒绝会覆盖文本 Cut / Paste-and-Match-Style 原生 Edit roles 的组合键；菜单保留原生角色和未自定义 accelerator。
- 两条 shortcut spec 接入专用 `test:e2e:shortcuts`，并由 `verify:mainline` 调用。为避免标准全量列表重复运行，full 与 isolated E2E 列表不再重复收录这两条 spec。

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/shortcut-bindings.test.ts tests/unit/application-menu.test.ts tests/unit/global-zoom-shortcuts.test.ts tests/unit/viewer-fit-shortcut.test.ts tests/unit/use-viewer-volume.test.tsx tests/unit/video-player-controls.test.ts` | 6 files / 81 tests passed。覆盖原生 Edit 保留键、zoom 文本/模态焦点门控、video/GIF fit 共享 matcher、浏览态 volume 让键及活动 viewer 调音量。 |
| `npm run typecheck` | 通过；Renderer 与 extension 两个 TypeScript 项目均无诊断。 |
| `npm run lint` | 0 errors / 7 React Hook dependency warnings，warning 均在既有位置。 |
| `$env:SERPENT_E2E='1'; $env:SERPENT_E2E_HIDE_WINDOW='1'; npm run test:e2e` | **partial/interrupted，不算通过**。标准入口启动 110 tests / 1 worker；Ctrl+C 前已到第 11 项，观察到 8 passed、2 failed、1 skipped，其余未执行。失败项是 `asset-ingestion.test.ts` 的资源库创建后空态标题未出现（页面快照仍显示无活动资源库且创建对话框打开，根因未知），以及 `asset-pagination.test.ts` 卡片尺寸 Ctrl+wheel 后锚点资产 viewport ratio 为 0（根因未知）。两项均与快捷键路径无关；其 error context 和 trace 保留在本轮 E2E 输出中，没有据此修改无关功能。 |
| `npm run test:e2e:shortcuts -- --output=test-results/shortcuts-followup`（同样启用隐藏窗口） | ensure-native / FTS5 probe 通过；Electron production-like build 通过；2 tests passed（1.2 分钟）。分别验证快捷键设置经 preload/Main 持久化重启，以及真实媒体查看器按键路径。 |
| `git diff --check` | 通过，exit 0；仅有 Git 关于 `.beads/issues.jsonl` 与 `package.json` 下次写入时 LF→CRLF 的提示，无空白错误。 |

快捷键 E2E 由各自 `finally` 关闭应用并清理测试库、媒体 fixture、profile 与临时导入/导出文件。尝试清理本轮专用 `test-results` 子目录和 `.vite` build 输出时，PowerShell `Remove-Item` 被执行策略拒绝；没有换用其他删除方式。它们仍是待清理的本轮测试产物；全量 E2E 中断时生成的两个失败上下文仍保留。macOS 原生菜单行为、Windows CJK IME/IMM32 与真实人工操作仍待人类/平台验收；本轮没有运行 packaged 构建或 Computer Use。

## 2026-10-17 自定义快捷键 follow-up：范围与验证计划

在独立审查后继续处理用户新增的四项：

- 设置页的 `viewer` category 单独显示本地化标题「查看界面」/ `Viewer`，应用动作继续显示「应用」/ `App`。
- `window.toggle-fullscreen` 进入可自定义动作目录，默认保持 Windows F11 / macOS ⌃⌘F。原生和隐藏菜单根据有效绑定更新；清除绑定时移除 accelerator，避免 Electron `togglefullscreen` role 再提供系统隐式组合；菜单点击仍通过 action 路由切换窗口全屏。
- `viewer.previous` / `viewer.next` 保持 ←/→ 默认并可自定义；`viewer.close` 的 Esc 继续固定。App 导航统一使用共享 matcher，并保留文本、模态、焦点、首末边界和系统 repeat 守卫。
- Mouse Back/Forward 使用 `MouseBack` / `MouseForward` chord，必须带至少一个 Ctrl/Alt/Shift/Meta 修饰键，可绑定到所有可自定义动作。纯侧键拒绝保存；录制、冲突/保留键校验、持久化、导入导出、键帽和运行时 matcher 共用该 chord。带修饰的侧键由 Renderer 捕获并阻止浏览器 history 默认行为，再投影到现有 action matcher；不支持的固定/插件动作不接受绑定。

自动化结果如下。专用 E2E 在隔离 userData、隐藏且非激活窗口运行，避免抢占用户桌面；测试 `finally` 关闭隔离应用并清理本轮库、媒体 fixture 与 profile。

| 命令 | 结果 |
| --- | --- |
| `npx vitest run --config vitest.config.ts tests/unit/video-player-controls.test.ts tests/unit/viewer-fit-shortcut.test.ts tests/unit/viewer-video-shortcuts.test.ts tests/unit/viewer-volume-preferences.test.ts tests/unit/shortcut-runtime.test.ts tests/unit/workspace-mouse-navigation.test.ts` | 6 files / 67 tests passed。覆盖 renderer-only 媒体 matcher/handler、repeat 和鼠标输入路由。 |
| `npx vitest run --config vitest.config.ts tests/unit/application-menu.test.ts tests/unit/app-settings-shortcuts-page.test.tsx tests/unit/browse-keyboard-shortcuts.test.ts tests/unit/collection-command-shortcuts.test.tsx tests/unit/folder-shortcut-dispatch.test.ts tests/unit/global-zoom-shortcuts.test.ts tests/unit/main-menu-items.test.ts tests/unit/platform-shortcut-table.test.ts tests/unit/platform-shortcut-parity.test.ts tests/unit/shortcut-bindings.test.ts tests/unit/shortcut-bindings-store.test.ts tests/unit/shortcut-catalog.test.ts tests/unit/shortcut-matcher.test.ts tests/unit/shortcut-runtime.test.ts tests/unit/shortcut-settings-model.test.ts tests/unit/viewer-fit-shortcut.test.ts tests/unit/viewer-video-shortcut-forward.test.ts tests/unit/viewer-video-shortcuts.test.ts tests/unit/viewer-volume-preferences.test.ts tests/unit/video-player-controls.test.ts tests/unit/window-fullscreen-shortcut.test.ts tests/unit/workspace-mouse-navigation.test.ts tests/unit/use-viewer-volume.test.tsx` | 扩大后的快捷键定向回归：23 files / 182 tests passed。 |
| `npm run test:e2e:shortcuts` | 2 tests passed / 30.5s。实测动态全屏菜单启用状态和 accelerator、主进程真实 fullscreen toggle 与命令计数、默认及自定义 viewer 导航、Esc 关闭、真实带修饰 MouseBack/MouseForward 事件驱动浏览重命名和查看器导航、文本输入让键、侧键不触发浏览器 history。测试结束后没有快捷键 E2E 或隔离 profile 进程。 |
| `npm run typecheck` | 通过；Renderer 和 extension TypeScript 项目无诊断。 |
| `npm run lint` | 通过，0 errors / 7 React Hook dependency warnings；警告位于 `App.tsx`、`AssetPreviewModal.tsx` 与 browse 视图。 |
| `git diff --check` | 通过，exit 0；Git 对 `.beads/issues.jsonl` 和 `package.json` 的换行符提示不是空白错误。 |

E2E 调试调整记录：非激活窗口中的 Playwright `keyboard.press` 未将全屏/视频键送到 Main，测试改为从测试自有 WebContents 使用 Electron `sendInputEvent`；同时断言 accelerator enabled、命令计数和真实窗口全屏状态。两次 fullscreen 输入间隔 75ms，确保覆盖跨入口去重且不命中 50ms 去重窗口。真实 MouseBack 曾被 workspace `pointerdown` history listener 消费，现由 modified side-button 路由接管并在捕获阶段抑制浏览器 history 默认行为；ArrowLeft/Right 默认验证移到用户改键之前。非激活窗口下 Renderer-only seek/volume/fit 即使经 Main input event 也无法证明实际 renderer handler 触发，因此没有保留为 E2E 通过项；相关 renderer handler/matcher 由本节定向单测覆盖，真实查看器交互仍待人类验收。没有激活窗口或抢占桌面。

本轮专用 gate 的调试尝试均使用 `npm run test:e2e:shortcuts`：① 直接用 Playwright 键盘输入测试全屏时 Main 未收到事件，改用 WebContents `sendInputEvent` 并增加 accelerator/命令/窗口状态观测；② 自定义 MouseBack 重命名未触发，定位到 workspace `pointerdown` 消费事件，调整事件所有权后该路径通过；③ 默认左右键断言放在改键后，属于测试顺序错误，移到设置改键前；④ Playwright `press("k")` 未经非激活窗口送达 Main，改成 Main 可观测的 Electron 输入事件后调速断言通过；⑤ `Ctrl+ArrowLeft` seek 在非激活窗口无法触发/证明 Renderer handler，按约定不激活窗口，移除 seek/volume/fit E2E 断言并以定向单测覆盖；最终同一专用 gate 2 tests passed / 30.5s。所有失败均不是被记为通过；前四项已修复或改正测试，Renderer-only E2E 范围保持未执行。

R1/R2 的 QA 清单项仍为「待人类验收」。macOS 原生菜单、Windows CJK IME/IMM32、Windows 真机按键、packaged app 和 Computer Use 未执行；非激活窗口下 seek/volume/fit 的真实 Electron E2E 未执行。实现与自动化结果不构成平台或人工验收通过。

## 2026-10-17 独立最终审查 P2 follow-up

本轮修复四项跨 viewer/IME 回归，并为每项增加具体单测：

- Audio 的 Space 播放/暂停、Video 的 Space/seek/frame/rate、GIF/Video fit 和 viewer volume 在分发入口调用 `hasActiveModalDialog()`；非编辑按钮聚焦的活动模态框也取得快捷键所有权。全局缩放共享同一模态守卫，覆盖 App 画布、image/video zoom hook、PDF surface 和菜单命令入口。
- 同源 HTML iframe 的带修饰 Mouse Back/Forward 在捕获阶段取消 history 默认行为，并将原始 button 与 Ctrl/Alt/Shift/Meta 精确转发到顶层 `mousedown` matcher。没有修饰键的侧键继续沿原有 workspace history 事件处理。
- Windows 查看器 IME fallback 改为从共享 catalog/routes 按实际 active scope 建立 hidden accelerator 和 Main `before-input-event` matcher。Play/pause 路由同时支持 audio 与 video；Audio controls 会启停 audio scope 并处理 Main 下发动作。验证器拒绝未接入 Main fallback 的 viewer action 使用 Windows 裸字母，以免设置显示可配但 IME 路径无法执行。

验证结果：

| 命令 | 结果 |
| --- | --- |
| `npx vitest run --config vitest.config.ts tests/unit/use-viewer-volume.test.tsx tests/unit/audio-player-controls.test.ts tests/unit/global-zoom-shortcuts.test.ts tests/unit/video-player-autoplay.test.tsx tests/unit/use-viewer-zoom-pan-middle-button.test.tsx tests/unit/workspace-mouse-navigation.test.ts tests/unit/viewer-video-shortcuts.test.ts tests/unit/shortcut-bindings.test.ts` | 8 文件 / 54 项通过。覆盖 modal ownership、App/viewer zoom 共享守卫、iframe modifier forwarding 与 audio/video bare-letter matcher/route。 |
| `npx vitest run --config vitest.config.ts tests/unit/application-menu.test.ts tests/unit/app-settings-shortcuts-page.test.tsx tests/unit/browse-keyboard-shortcuts.test.ts tests/unit/collection-command-shortcuts.test.tsx tests/unit/folder-shortcut-dispatch.test.ts tests/unit/global-zoom-shortcuts.test.ts tests/unit/main-menu-items.test.ts tests/unit/platform-shortcut-table.test.ts tests/unit/platform-shortcut-parity.test.ts tests/unit/shortcut-bindings.test.ts tests/unit/shortcut-bindings-store.test.ts tests/unit/shortcut-catalog.test.ts tests/unit/shortcut-matcher.test.ts tests/unit/shortcut-runtime.test.ts tests/unit/shortcut-settings-model.test.ts tests/unit/viewer-fit-shortcut.test.ts tests/unit/viewer-video-shortcut-forward.test.ts tests/unit/viewer-video-shortcuts.test.ts tests/unit/viewer-volume-preferences.test.ts tests/unit/video-player-controls.test.ts tests/unit/window-fullscreen-shortcut.test.ts tests/unit/workspace-mouse-navigation.test.ts tests/unit/use-viewer-volume.test.tsx tests/unit/audio-player-controls.test.ts` | 扩展快捷键定向集：24 文件 / 191 项通过。 |
| `npm run test:e2e:shortcuts`（第 1 次） | custom-shortcuts 通过；runtime spec 失败于 `.preview-video-playpause` selector 同时匹配播放和静音按钮，属测试 locator 歧义。隔离 app、profile、媒体和库由 `finally` 清理。 |
| `npm run test:e2e:shortcuts`（第 2 次） | custom-shortcuts 通过；runtime spec 在隐藏非激活窗口中通过 Playwright pointer click 视频按钮时被 overlay 拦截，尚未到快捷键断言。隔离产物由 `finally` 清理。 |
| `npm run test:e2e:shortcuts`（第 3 次） | 2 tests passed / 31.2s。使用精确播放按钮 DOM click 继续测试流程；Main/隐藏菜单、输入框保护及可在非激活 WebContents 中证明的快捷键行为通过。隔离 app、profile、媒体与库由 `finally` 清理。E2E 未覆盖真实 Windows CJK 组成输入或 macOS native menu；audio Main scope 由单测证明。 |
| `npm run typecheck` | exit 0，Renderer 与 extension TypeScript 项目均无诊断。 |
| `npm run lint` | exit 0，0 errors / 7 React Hook dependency warnings，位于既有代码位置。 |
| `git diff --check` | 通过，exit 0；仅有 `.beads/issues.jsonl` 与 `package.json` 的 LF→CRLF 提示，无空白错误。 |

没有发现本轮 shortcut E2E 的残留进程或以 shortcut 命名的 `test-results` 子目录；测试临时 app/profile/media/library 由 spec `finally` 清理。之前被策略拒绝清理的历史测试产物未尝试用其他方法删除。实现自动化不替代平台/人工验收：Windows CJK IME/IMM32、macOS 原生菜单、packaged、Computer Use、真实音频媒体操作仍待验。
