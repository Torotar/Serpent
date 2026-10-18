# 侧栏回收站无法接收资产拖拽

> 日期：2026-10-18  
> 状态：接收协商与事件生命周期修复已获用户手动确认；此前错误结论、自动化局限和全量门禁失败均保留。

工单：`Serpent-tm8sy`，按用户确认关闭；人工验收条目：`DND-002`（单资产路径）。

## 用户复验撤回与新增证据

用户随后报告「拖到回收站的时候光标是个禁止」。上一轮不能被当作该故障已修复：
诊断通过 CDP 传入了允许 copy + move 的操作掩码，而生产原生源并不提供 move。
单测和局部 helper 事件实验未验证实际资产拖拽可被回收站接收。

当前项目使用 Electron 43.1.0。[该版本 Windows/Linux 原生拖拽实现](https://github.com/electron/electron/blob/v43.1.0/shell/browser/ui/drag_util_views.cc#L39)
只提供 `DRAG_COPY | DRAG_LINK`。回收站目标却在 dragover 强制 `dropEffect = "move"`，
在源操作不包含 move 时导致浏览器拒绝接收；事件甚至到不了上一轮修复的 drop 阶段。
需要按源的 `effectAllowed` 协商传输操作，并保持真实移动/回收站业务由现有命令执行。
现已扩展既有 `resolveManagedDropEffect`，使目标按源允许的操作协商；这只决定传输操作，不改变 Alt 选择的移动/复制业务模式，回收站始终执行原有回收站命令。此前 helper 证据不能替代本轮接收条件验证。

## 根因与历史

上一轮确认的 drop 时序问题由 `e082ee3be74b5f24509db47b8489104b576c89e3` 引入；
它不足以解释用户复验中的禁止光标，不再作为整个故障的唯一根因。该提交在
`src/renderer/NavigationSidebar.tsx` 的回收站 `Files` 分支增加
`isInternalAssetDrag()` 门禁，避免外部文件仅因路径匹配库内资产就被移入回收站。
这一保护仍然需要保留。

此前分支只要收到 `Files`，就调用 `onResolveManagedAssetDrop`，并把解析出的资产
交给 `onAssetsDroppedOnTrash`。同一提交把内部拖拽标记的清理放在 `window` 的
capture `drop` 监听器中，并用 `queueMicrotask` 延后。可信原生 drop 的浏览器事件
分发会在 capture 与 React 委托的 bubble handler 之间执行 microtask checkpoint，
于是清理先于侧栏读取标记：Main Agent 的隐藏 Electron/CDP 复现观察到
`capture: active`、`microtask: cleared`、`bubble: idle`。同步 DOM
`dispatchEvent` 不会经过这个时序，因此旧的单测漏掉了回归。

## 修复

在 `src/renderer/use-external-import-handlers.ts` 中，drop 后将 phase 清理安排到
下一个 task，使当前 drop 的 React handler 能先读取原生拖拽状态。新拖拽开始时会
取消尚未执行的旧清理，组件卸载时也会清除定时器。回收站仍只消费完整映射到库内
资产的 Serpent 原生拖拽；外部文件不会因路径匹配而进入回收站。

## 自动化验证

- `npx vitest run --config vitest.config.ts tests/unit/external-import-transfer.test.ts tests/unit/use-external-import-handlers.test.tsx tests/unit/navigation-sidebar.test.ts`：3 个文件、49 项通过。
- `npx eslint src/renderer/external-import-transfer.ts src/renderer/use-external-import-handlers.ts tests/unit/external-import-transfer.test.ts tests/unit/use-external-import-handlers.test.tsx tests/unit/navigation-sidebar.test.ts`：通过。
- hook 单测覆盖真实 `useExternalImportHandlers` 的拖拽 phase，模拟 capture 与目标 handler 间的 microtask checkpoint，并检查新拖拽取消旧清理、卸载时清除清理定时器。侧栏单测覆盖活动的原生 `Files` drop 进入回收站，以及外部文件不会触发该动作。
- 一次性可信 native File drop 诊断：PowerShell 内联 Node ESM（here-string 经管道传给 `node --input-type=module`），用 `Vite build({ configFile: false, lib.entry: 'src/renderer/external-import-transfer.ts', formats: ['es'] })` 编译实际源码到唯一临时目录；隐藏 Electron 使用独立临时 profile 加载 harness，由 capture listener 调用真实 `scheduleInternalAssetDropCleanup`，target handler 读取 phase 并调用真实 `shouldConsumeManagedAssetDrop`。通过 CDP `Input.dispatchDragEvent` 顺序发送 `dragEnter`、`dragOver`、`drop`，携带一个临时 File fixture。两种场景的内联 `assert.deepEqual` 均通过：内部拖拽观察到 `capture(active) → bubble(active, fileCount=1, consume=true) → cleanup`；外部拖拽观察到 `capture(idle) → bubble(idle, consume=false) → cleanup`。`finally` 关闭 Electron 并清理临时目录。旧行为对照得到 `capture → queueMicrotask(clear) → bubble(idle)`；同步 `dispatchEvent` 对照则是 `capture → bubble(active) → microtask`。这是一项一次性诊断实验，不是可复跑的 E2E 套件；两条内联断言也不代表完整应用 E2E 通过。
- 该诊断与上述单测没有从真实资产卡片启动 Main 的 `startAssetDrag`。

主 agent 在首轮仅含微任务修复的代码状态执行 `npm run verify:mainline`，结果为**未通过，测试阶段中断**：

- lint：0 errors / 7 条既有 React Hook warnings；typecheck、extension:verify 通过。
- `test:library-availability`：9 个文件通过，232 项通过、1 项跳过。
- 全量 `test` 输出统计为 736 个文件通过、2 个失败、18 个跳过；5925 项通过、2 项失败、35 项跳过，另有 3 个 Worker 错误。两项失败分别发生在 `library-export-import.test.ts` 与 `semantic-index-handler.test.ts` 的临时目录清理阶段（`EPERM` / `ENOTEMPTY`），不是这两个测试的业务断言失败。本轮未进一步判定这些清理失败的根因，不以重跑通过关闭。
- 同时发生大量 fork 退出超时。主 agent 最后仅终止了本轮主线门禁及其剩余测试子进程，没有结束正在使用的 Serpent 实例。Worker 异常退出包含这一中断的影响，全量运行不能作为完整通过证据。
- 后续 `test:perf:search`、应用 E2E 与快捷键 E2E 未执行；没有运行会清除当前开发实例构建目录的 E2E 构建脚本。
- 一次性 Electron 诊断的应用与临时 profile/构建/fixture 已由 `finally` 清理。全量测试报告的两个临时目录仍在；主 agent 核对其属于本次测试后，清理命令被自动审批策略以 `blocked by policy` 拒绝。没有改用其他工具绕过；该残留尚未清理。

## 四列追溯

| 需求条目 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 原生 drop 的目标处理前不得清除库内拖拽身份 | `use-external-import-handlers.ts:174`、`external-import-transfer.ts:65` | `use-external-import-handlers.test.tsx:91`；调度契约 `external-import-transfer.test.ts:52` | 隐藏 Electron/CDP 可信事件一次性对照通过；完整应用 OS 拖拽、Computer Use、人工复验未执行 |
| 新拖拽和组件卸载不得遗留旧清理任务 | `use-external-import-handlers.ts:135`、`:188` | `use-external-import-handlers.test.tsx:115`、`:141` | 仅定向自动化通过 |
| 回收站仍区分库内原生文件和外部文件 | `NavigationSidebar.tsx:2864`，读取修复后的共享状态 | `navigation-sidebar.test.ts:556`、`:595` | 实际消费 helper 的可信 File 对照通过；完整应用与人工未验证 |

## 首轮未覆盖范围（历史记录）

现有应用 E2E 将 `serpent.e2e` 设为真，资产卡片因此走 HTML5 测试 payload，不会覆盖生产环境的 Main 原生拖拽分支。本轮没有完整覆盖“真实应用资产卡片 → Main `startAssetDrag` → 原生 `Files` drop → Worker 回收站持久化”的 E2E 证据；这项一次性 harness 诊断只验证实际调度/消费 helper 与可信 File drop 的事件时序。OS 拖拽和平台行为仍未据此标为通过。

## 用户确认与最终定向检查

2026-10-18 用户手动确认「我手动测试了，确实好了」，随后明确要求提交推送。该确认覆盖当前单资产原生拖入回收站恢复；没有扩张为批量、macOS、Linux 或 packaged 验收通过。

- `npx vitest run --config vitest.config.ts tests/unit/asset-drag-drop.test.ts tests/unit/navigation-sidebar.test.ts tests/unit/use-external-import-handlers.test.tsx tests/unit/external-import-transfer.test.ts`：4 个文件 / 70 项通过。新增 copyLink 源以兼容 copy 接收、copyMove 仍选 move、none 不接收等覆盖，业务回收站动作保持不变。
- `npm run typecheck`：通过。对本次全部源码及测试运行定向 ESLint：0 errors / 2 条 App 既有 Hook warnings。
- 新增 `tests/e2e/native-asset-drag-trash.test.ts`，通过 E2E opt-in 启用真实卡片的原生拖拽分支。仅以替身替换 Main 的系统拖放交接；其余真实卡片、IPC、Main cache、可信 copyLink File drop 和 Worker 均使用实际应用代码。此测试不能写为 agent 完成了真实 OS 鼠标拖拽，用户手动确认单独列证。
- 首次运行在回收站图片解码处失败：一像素图片按既有 source-direct 策略不生成持久缩略图，源文件预览解码不代表有派生预览。仅增加等待仍按预期超时，已定位原因后将夹具改为 3072×1536 PNG，明确超过源直出阈值；再等待 `serpent://preview/` 且解码成功后执行删除。这是测试样本选择修正，不是以重跑通过关闭 flaky；隔离构建通过环境变量使用本机工作副本现有媒体工具，未复制或链接依赖目录。

- 最终完整应用原生 drop 分支回归：在隔离构建设置 `SERPENT_E2E_APP_DIRECTORY`，并通过 `SERPENT_FFMPEG_PATH` / `SERPENT_OIIO_PATH` 指定已有媒体工具，执行 `node node_modules/@playwright/test/cli.js test tests/e2e/native-asset-drag-trash.test.ts --reporter=line`，结果 **1 passed / 7.6s**。验证真实卡片入口经 IPC/Main cache 得到实际文件、copyLink 源的可信 drop 发起回收站请求、源文件搬入回收站、预览实际解码，以及完整退出重开后同一资产仍在回收站且预览可解码。OS 交接仍由测试替身替换，原生鼠标可用性的人工证据来自用户本人。
- `git diff --check`：通过；提交前检查没有把隔离构建、测试 profile 或截图加入源码。首轮全量门禁失败仍作为已知验证局限保留，不声称全仓通过。

最终追溯补充：`asset-drag-drop.ts` 的 `resolveManagedDropEffect` / `NavigationSidebar.tsx` 的回收站 dragover 为接收协商实现；`asset-drag-drop.test.ts` / `navigation-sidebar.test.ts` 为规则与接收断言；`native-asset-drag-trash.test.ts` 为可信 copyLink 的完整应用 drop/重启证据；`DND-002` 记录用户单资产实际鼠标路径确认。
