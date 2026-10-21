# AI 分析多 API 档案 QA

> 结论：自动化覆盖本功能主流程；等待用户验收。仓库全量门禁未全绿，见下文。
> 对应工单：`Serpent-906fed`（保持 `in_progress`）；GitHub Issue #44。
> 方案：[实施方案](../implementation/2026-10-21-ai-analysis-api-profiles-plan.md)；开发记录：[开发日志](../development/2026-10-21-ai-analysis-api-profiles-development-log.md)。

## 四列追踪

| 需求 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 新增/编辑多份 API 档案，显式激活；未配置 Key 的草稿不覆盖当前配置 | `src/main/library-request/ai.ts:336`；`src/main/ai-profile-store.ts:112`；`src/renderer/AiConfigDialog.tsx:447` | `tests/unit/ai-profile-store.test.ts:17`；`tests/e2e/ai-profile-switching.test.ts:113` | Playwright/Electron 隔离测试通过；Computer Use 未进入 AI 设置，等待用户操作 |
| 分析行为偏好与模型档案分开保存 | `src/main/ai-analysis-preferences.ts:31`；`src/main/index.ts:1586`；`src/renderer/AiConfigDialog.tsx:447` | `tests/unit/ai-analysis-preferences.test.ts:5`；`tests/unit/ai-profile-legacy-config.test.ts:15` | 亮/暗主题、实际窗口布局以及切档后偏好保留由用户验收 |
| 旧配置幂等迁移，凭据/目录部分写入可恢复 | `src/main/ai-profile-legacy-config.ts:32`；`src/main/ai-profile-transaction.ts:28`；`src/main/index.ts:1586` | `tests/unit/ai-profile-legacy-config.test.ts:15`；`tests/unit/ai-profile-transaction.test.ts:53` | 仅自动化测试；真实既有安装升级、Windows safeStorage 未执行 |
| 资产分析读取当前档案；完整退出重启后档案和凭据仍可用 | `src/main/index.ts:3097`；`src/main/library-request/ai.ts:31`；`src/preload/bridge/library.ts:1917` | `tests/e2e/ai-profile-switching.test.ts:113`；`tests/e2e/ai-inspector-refresh.test.ts:87`；`tests/e2e/ai-inspector-refresh.test.ts:237` | 隔离 Electron 使用本机模拟服务，验证单项/批量分析、切换和重新连接；真实服务待用户验收 |
| 在途批次保持原连接快照，后续请求用新的活动档案 | `src/main/index.ts:3097`；`src/main/ai-profile-store.ts:179` | `tests/unit/ai-profile-store.test.ts:87` 验证冻结快照；未覆盖实际网络请求竞态 | 需要用户使用响应较慢的两个本地/远端服务确认；当前列为直接自动化覆盖不足 |
| AI 搜索规划使用活动档案的模型、地址与凭据 | `src/main/library-request/ai.ts:521` | `tests/unit/main-ai-owned-request.test.ts:197` 使用隔离 fetch 验证请求 URL、Bearer 凭据和模型 | 自动化覆盖通过；真实服务切档行为待用户验收 |
| 自动分析导入路径使用活动档案 | `src/main/index.ts:3013`；`src/main/index.ts:3097` | 暂无 profile 路由的导入自动分析 E2E | 尚未验证，保留为直接自动化覆盖缺口 |
| 凭据只留在 Main，删除当前档案后不再静默沿用其他凭据 | `src/main/ai-profile-transaction.ts:28`；`src/main/library-request/ai.ts:386`；`src/shared/protocol/responses.ts:1740` | `tests/unit/ai-profile-transaction.test.ts:110`；`tests/unit/ai-profile-store.test.ts:17`；`tests/unit/public-error-catalog-gaps.test.ts` | 自动化确认；UI 凭据脱敏、删除确认与无活动档案状态等待用户验收 |

## 自动化结果

| 命令 | 结果 |
| --- | --- |
| `npm run test:unit` | 646 个文件通过；4,504 项通过，10 项跳过（完整单元运行早于后来追加的一个搜索规划用例）。 |
| `npm run typecheck` | 通过。 |
| `npm run lint` | 通过；0 个错误、7 条 React Hook 依赖警告。 |
| `npm run extension:verify` | 通过。 |
| `npm run test:library-availability` | 9 个文件通过；234 项通过，1 项跳过。 |
| `npx vitest run --config vitest.config.ts tests/unit/main-ai-owned-request.test.ts` | 补充搜索规划路由测试后 18/18 通过。 |
| `npx eslint tests/unit/main-ai-owned-request.test.ts` | 通过。 |
| `node scripts/run-e2e.mjs --workers=1 tests/e2e/ai-profile-switching.test.ts tests/e2e/ai-inspector-refresh.test.ts` | 3/3 通过。真实 Electron 使用隔离 userData、本地模拟 API 和临时资源库。 |
| `npm run verify:mainline` | 未全绿，`npm run test` 门禁失败后终止。总计 750 个测试文件中 6,017 项通过、2 项失败、18 项跳过。 |

`verify:mainline` 中失败的用例：

- `tests/worker/database-recovery.test.ts`：routine backup throttle 测试在间隔后仍读到旧的 `Throttle Before`，预期为 `Throttle During`。
- `tests/worker/semantic-index-handler.test.ts`：stale-claim 测试的 `afterEach` 清理临时目录时得到 `ENOTEMPTY`。

两项均不涉及本次 AI 配置改动。完整门禁因此没有运行 `test:perf:search`、全量 `test:e2e` 与 `test:e2e:shortcuts`；不报告为通过。没有对失败项重复运行，根因未确认。

## 人工、平台与范围限制

- 已尝试真实 Windows Computer Use，但只到达隔离开发实例的空资源库起始界面，没有建立库并进入设置页，因此没有完成 AI 设置视觉与操作验收。
- 隔离 GUI 尝试产生的测试配置目录仍在系统临时目录；清理操作被执行环境策略拦截，目录当前没有运行中的 Electron 进程占用。
- Windows 以外的平台、packaged app、真实供应商服务均未验证。
- 自动分析和实际 Main 请求在飞行期间切换档案没有直接请求级自动化覆盖；冻结快照单测不等同于端到端切换竞态验证。AI 搜索规划已有隔离请求单测。
- 用户验收步骤已加入[持续验收清单](human-acceptance-checklist.md)。完成人类验收前，工单保持 `in_progress`。

## 0.3.2 发布前复验（2026-10-21）

| 命令 | 结果 |
| --- | --- |
| `npm run test:library-availability` | 9 个文件通过；234 项通过，1 项跳过。 |
| `npm run test` | 752 个文件通过、18 个跳过；6,020 项通过、35 项跳过。包含修复后 `semantic-index-handler` 测试。 |
| `npm run test:perf:search` | 按用户要求停止；未完成、未验证。 |
| `npm run test:e2e` | 按用户要求在运行至 108/109 项时停止；未取得最终汇总。随后串行定向复验先前 5 项失败：分页、合集/文件夹改名、嵌套合集拖放、工作区标签历史通过；根目录导入因文件夹内联输入提交时序再次失败，修正测试操作后定向 E2E 通过。 |
| `node scripts/run-e2e.mjs --workers=1 --grep "ordinary browsing continuously appends every asset without page controls" tests/e2e/asset-pagination.test.ts` | 修正虚拟卡片未挂载及滑块档位依赖窗口宽度后通过，1/1。 |
| `node scripts/run-e2e.mjs --workers=1 --grep "imports into the library root after leaving a folder scope" tests/e2e/asset-ingestion.test.ts` | 修正文件夹输入提交与完成等待后通过，1/1。 |
| `npm run test:e2e:shortcuts` | 未运行。 |

其余 3 项失败只在中断的并行全量运行中出现，串行定向复验通过；因未能稳定复现，不判定为已修复或确认的产品缺陷。全量 E2E 及发布门禁仍不完整，0.3.2 尚未发布。
