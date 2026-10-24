# 后台预览队列活性与小图直出 QA

- 日期：2026-10-24
- 分支与代码基线：`dev` / `1ad1eb8b`，测试当前未提交工作树
- 环境：Windows，Node.js 24.14.0；Worker 测试使用仓库 Electron ABI wrapper
- 最终结论：定向功能、资源库可用性、真实 Electron 解码及独立审查通过；最终 20k 刷新和 `verify:mainline` 被 Windows 临时目录 `EPERM` 阻断，Computer Use 视觉状态未验证，用户于 2026-10-24 确认功能验收通过。

## 四列规格追溯

| 需求 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 可见波让出后，已排队后台主预览继续领取 | `src/worker/index.ts` 的 `resumeBackgroundPrimaryQueue` 与队列收尾接续 | `tests/worker/thumbnail-scheduler.test.ts`；3 个预览 Worker 文件共 121 tests passed；真实 Electron 模型缩略图 E2E 1 passed | 用户于 2026-10-24 确认功能验收通过；Computer Use 返回纯黑截图，未形成独立视觉证据 |
| 小型 source-direct 图片不占满有界补队候选额度 | `src/shared/preview-policy.ts`、`src/worker/library-service.ts` `enqueueThumbnailJobs` | `tests/worker/thumbnails.test.ts` 覆盖 LIMIT 前过滤；策略阈值由既有 `tests/unit/preview-policy.test.ts` 覆盖；较早代码状态的正式 20k 基线 3 tests passed | 最终状态 20k 刷新未能创建基准库，Windows 返回 `LIBRARY_CLEANUP_FAILED` / `EPERM`；较早指标不代表最终代码状态；真实用户库及 NAS/SMB 未覆盖本次用户验收 |
| source-direct 判定从 Worker 传到卡片预览路由 | `src/shared/protocol/responses.ts`、`src/worker/library-service.ts`、`src/worker/index.ts`、`src/renderer/thumbnail-completion-projection.ts`、`src/renderer/asset-thumbnail-patches.ts`、浏览布局 hooks | 相关 unit 3 files / 20 passed；Worker 旧队列 prune 与尺寸事件断言通过；Electron E2E 真实断言 480×480 PNG `complete && naturalWidth === 480` | 用户确认小图直出功能验收通过；Computer Use 非激活截图为纯黑，未形成独立视觉证据 |
| 模型与 raster 保持独立受控资源同时持续前进 | `src/worker/index.ts` 的后台主队列接续与现有 Main 离屏 renderer gate | `tests/worker/thumbnail-scheduler.test.ts`；Electron E2E 中模型 `<img>` 尺寸非零 | 当前 Windows Electron E2E 通过；Computer Use 非激活窗口截图为纯黑，未形成视觉验证；未运行 packaged，也未证明其他平台/模型格式矩阵 |

## 自动化结果

- `npm run typecheck`：通过。
- `npm run lint`：在临时残留产生前退出码 0，0 errors、7 React Hook 依赖 warning；其后 `verify:mainline` 重跑 lint 被不可访问临时目录阻断。
- `npm run test:library-availability`：9 files passed，234 passed / 1 skipped。
- 定向预览 Worker：3 files passed，121 passed。
- 定向 Renderer unit：3 files passed，20 passed。
- 真实 Electron E2E：1 passed，分别验证小 PNG 与模型图片的实际解码；所有运行使用唯一临时 userData。由测试创建的临时库目录运行后已清理。
- `git diff --check`：通过。
- 最新 Worker 重试竞态回归：1 file / 1 passed，9.57s；真实队列失败与可见波重叠后，待处理主预览最终被领取，产物 ready 且 job succeeded。
- 20,000 资产较早状态的混合基线曾通过：fixture 生成 1 passed；性能套件 3 passed，20,000/20,000 live；重协调 2,937.6ms，event-loop lag P95/max 1.0/81.6ms，viewer resolve P50/P95/max 1.7/3.2/4.8ms。最终状态重跑 fixture 时，库创建失败并报 `LIBRARY_CLEANUP_FAILED` / `EPERM`，所以最终性能未验证。
- `npm run verify:mainline` 在 lint 阶段因上述失败夹具残留路径不可读取而退出，整套门禁未执行完成。

## 未执行与已知边界

- Computer Use 能枚举到 E2E Serpent 窗口，但 Windows.Graphics.Capture 截图是纯黑，且辅助功能树没有可用的控件文本；为避免抢占前台没有激活窗口。没有形成独立视觉证据；用户已确认本次功能验收通过。
- 失败基准创建留下一个由本次测试创建的部分目录；操作系统拒绝列举和删除其内部 `.serpent` 子目录，常规 Node 清理返回 `EPERM`。未终止当前开发应用、未修改 ACL。该残留需在释放文件访问后清理，并重跑 20k fixture 与 `npm run verify:mainline`。
- packaged 启动、完整应用退出后重启恢复、其他平台、真实用户库和 NAS/SMB 未执行。
- 本轮没有完整实现设计方案的协调器、候选 keyset 游标、自愈 watchdog、完整结构化等待原因与跨类型公平调度。当前实现修复已复现交接路径，不等同于设计矩阵全部覆盖。
- 独立 Standards/Spec 审查已完成：两项 P1 调度问题已修复，最终没有剩余代码发现；检查清单已更新为用户确认功能验收通过。由于最终 20k 与 `verify:mainline` 仍未完成，`PREVIEW-QUEUE-001` 与 `MEDIA-PERF-002` 的功能范围由用户确认验收通过；严格 500ms 性能门禁仍未通过。

## 相关记录

- [根因分析与实施设计](../implementation/2026-10-24-preview-queue-liveness-design.md)
- [开发记录](../development/2026-10-24-preview-queue-liveness-development-log.md)
- 工单：`Serpent-7b6c0a`（用户确认验收后关闭）
