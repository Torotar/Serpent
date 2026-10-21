# AI 分析 API 档案开发记录

> 状态：实现完成，等待用户验收；未提交或推送。
> 工单：`Serpent-906fed`；GitHub Issue #44。
> 方案：[AI 分析多 API 配置方案](../implementation/2026-10-21-ai-analysis-api-profiles-plan.md)

## 实现内容

- 新增应用级命名 API 档案，可保存、编辑、测试连接、获取模型、激活和删除。档案 DTO 只暴露 `hasCredential`，API Key 由 Main 使用 `safeStorage` 加密并按档案 ID 单独保存。
- 档案目录与凭据写入使用事务日志并在启动时恢复；删除当前档案会清空活动选择。保存没有 API Key 的草稿不会覆盖现有活动档案，也不能用于实际请求。
- 将分析开关、标签策略（含强制使用已有标签）、提示词、语言、并发、自动分析及披露状态迁至独立分析偏好文件。旧 `ai-config.json` 与旧密钥迁移为档案；读取、解密或写入失败时保留旧数据并向界面返回明确错误。
- 新增经过 Zod 校验的 Main/Preload/Renderer 档案 API。设置页现在将「连接档案」与「分析设置」分开；测试连接和模型列表可针对当前编辑的草稿配置执行。
- AI 资产分析、批量队列和搜索规划均解析活动档案。一个 AI 队列批次开始时固定连接快照；切换后启动的新任务使用新档案。

## 关键实现与测试追踪

| 需求 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 档案 CRUD、活动档案及不完整草稿 | `src/main/ai-profile-store.ts:112`；`src/main/library-request/ai.ts:336`；`src/renderer/AiConfigDialog.tsx:447` | `tests/unit/ai-profile-store.test.ts:17`；`tests/e2e/ai-profile-switching.test.ts:113` | 等待用户在设置页建立并切换两份配置 |
| 分析偏好与连接信息分离 | `src/main/ai-analysis-preferences.ts:31`；`src/renderer/AiConfigDialog.tsx:447` | `tests/unit/ai-analysis-preferences.test.ts:5`；`tests/unit/ai-profile-legacy-config.test.ts:15` | 等待用户切档后核对标签策略等全局偏好 |
| 旧设置迁移和中断恢复 | `src/main/index.ts:1586`；`src/main/ai-profile-legacy-config.ts:32`；`src/main/ai-profile-transaction.ts:28` | `tests/unit/ai-profile-legacy-config.test.ts:15`；`tests/unit/ai-profile-transaction.test.ts:53` | 自动化覆盖内存故障注入与重试；旧安装升级的人类验证待执行 |
| 当前档案驱动资产分析与重启恢复 | `src/main/library-request/ai.ts:31`；`src/main/index.ts:3097`；`src/preload/bridge/library.ts:1917` | `tests/e2e/ai-profile-switching.test.ts:113`；`tests/e2e/ai-inspector-refresh.test.ts:87`；`tests/e2e/ai-inspector-refresh.test.ts:237` | 隔离的真实 Electron E2E 验证单项/批量分析、档案切换、完整退出重启及重启后连接探测；真实供应商请求待用户验证 |
| AI 搜索规划使用当前档案 | `src/main/library-request/ai.ts:521` | `tests/unit/main-ai-owned-request.test.ts:197` 通过隔离 fetch 检查活动档案的 URL、凭据与模型 | 自动化覆盖通过；用户切换后使用实际服务的验证待执行 |
| 自动分析与在途请求切档 | `src/main/index.ts:3013`；`src/main/index.ts:3097`；`src/main/ai-profile-store.ts:179` | `tests/unit/ai-profile-store.test.ts:87` 仅验证不可变快照；尚无自动分析导入路径或 Main 实际请求竞态测试 | 保留为直接自动化覆盖缺口；等待用户按清单验证或后续补充测试 |
| 凭据不回传 Renderer、错误明确 | `src/shared/protocol/requests.ts:1109`；`src/shared/protocol/responses.ts:1740`；`src/shared/library-api.ts:712` | `tests/unit/ai-profile-store.test.ts:17`；`tests/unit/public-error-catalog-gaps.test.ts` | DTO 仅有凭据状态；packaged/Windows 未执行 |

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:unit` | 646 个测试文件通过；4,504 项通过、10 项跳过（该次完整运行在新增搜索规划用例前）。 |
| `npx vitest run --config vitest.config.ts tests/unit/main-ai-owned-request.test.ts` | 新增活动档案搜索规划用例后，定向文件 18/18 通过。 |
| `npx eslint tests/unit/main-ai-owned-request.test.ts` | 通过。 |
| `npm run typecheck` | 通过，包含应用与扩展 TypeScript 检查。 |
| `npm run lint` | 通过，0 错误、7 条既有 React Hook 依赖警告。 |
| `npm run extension:verify` | 通过。 |
| `npm run test:library-availability` | 9 个文件通过；234 项通过、1 项跳过。 |
| `node scripts/run-e2e.mjs --workers=1 tests/e2e/ai-profile-switching.test.ts tests/e2e/ai-inspector-refresh.test.ts` | 3/3 通过；E2E 使用隔离 userData 与本地模拟端点。 |
| `npm run verify:mainline` | 未全绿。lint、typecheck、extension:verify、library availability 通过；在 `npm run test` 阶段 750 个文件中 6,017 项通过、18 项跳过、2 项失败，脚本停止。 |

完整验证的两个失败为：

1. `tests/worker/database-recovery.test.ts` 的例行备份节流测试预期名称变为 `Throttle During`，实际仍为 `Throttle Before`。
2. `tests/worker/semantic-index-handler.test.ts` 的 stale claim 用例在 `afterEach` 删除临时目录时得到 `ENOTEMPTY`。

这两个文件不在本次改动范围。由于 `verify:mainline` 会在失败后停止，搜索性能基准、仓库全量 E2E 与快捷键 E2E 未执行。没有重跑这两个失败以避免把一次重跑误记成关闭；其稳定性和根因仍待单独调查。

## 独立审查与未完成验收

独立代码审查未发现新的产品缺陷。审查确认设置加载错误可见、不会因失败而继续覆盖状态；E2E 会在完整退出后用已保存凭据再次探测当前档案。审查建议补充自动分析、搜索规划和真实请求运行中途切档的直接覆盖，本记录不把代码走读当成测试通过。

Computer Use 仅检查到隔离开发实例的空资源库起始界面，没有进入 AI 设置页；因此实际设置界面视觉核验仍未完成。Windows/packaged 运行也未执行。上述限制已登记到[人类验收清单](../qa/human-acceptance-checklist.md)，工单保持 `in_progress`，等待用户测试与反馈。

## 0.3.2 发布前复验（2026-10-21）

- 修正 Windows 测试清理竞态：`tests/worker/semantic-index-handler.test.ts` 删除临时资源库时复用 `removePathWithSyncRetry`。定向测试 6/6 通过；随后完整 `npm run test` 为 752 个文件通过、6,020 项通过、35 项跳过。
- `npm run test:library-availability` 为 9 个文件通过、234 项通过、1 项跳过；lint、typecheck 与 extension verify 通过，lint 有 7 条既有 React Hook 警告。
- 用户要求跳过性能检查，搜索性能基准已中止，不能记为通过。
- 用户要求停止全量测试时，`npm run test:e2e` 已运行至 108/109 项并中止。对当时观察到的 5 项失败做串行定向复验：分页、合集/文件夹改名、嵌套合集拖放及工作区标签历史 4 项通过；资产根目录导入用例再次暴露内联编辑提交时序问题。
- 修正两个 E2E 用例的前置条件：文件夹创建通过聚焦的内联输入框提交并等待编辑行关闭；分页测试先滚动到虚拟卡片附近再等待其挂载，且从当前滑块最大档位的前一档开始缩放。分页用例单独通过；根目录导入用例修正后单独通过。
- 其余 3 项只在中断的并行全量运行中失败，串行定向复验通过；没有稳定复现，故不将其归因为已修复或确认的产品缺陷。快捷键 E2E 未运行。全量 E2E 及发布门禁仍不完整，本记录不代表 0.3.2 已可发布。
