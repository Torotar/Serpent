# 内存感知媒体并发开发记录

- 规格：[缩略图与视频 proxy 加速方案](../implementation/2026-10-20-thumbnail-proxy-acceleration-plan.md)，首个实施增量：`Serpent-e468e4`。
- 分支：`dev`。
- 基线：`7812aced`（方案与 P0 工单已提交）。
- 开始日期：2026-10-21。
- 状态：部分实现；Worker 集成与资源库门禁受本地 SQLite native ABI 不匹配阻塞，尚未验收。

## 目标

Library Worker 在每次重型 FFmpeg 任务准入时探测系统可用物理内存。低于 4 GiB 或无法读取时最多运行一个 FFmpeg；达到 4 GiB 时最多两个。正在运行的进程不会因内存档位下降而被强制终止。共享原生内存字节预算继续执行，每个 FFmpeg 保持单线程，编码器保持 H.264-only。

## 实施与验证

Library Worker 通过 `os.freemem()` 在重型原生任务准入时读取系统可用物理内存。低于 4 GiB 或探测结果无效时上限为 1；达到 4 GiB 时上限为 2。未知值按保守档处理，并记录一次诊断；后续探测恢复后会重新按当前档位准入。内存档位降低只阻止新的任务进入，不会中断正在运行的 FFmpeg。

`MediaNativeMemoryBudget` 现在把 FFmpeg 并发槽位和既有 384 MiB 估算字节预算作为一次原子准入。等待中的任务不预占字节；如果队首只因 FFmpeg 槽位满而等待，其他可运行的解码类别可以使用空闲字节预算，同 key FFmpeg 仍按 FIFO 获准。释放或取消后重新采样系统内存并排队。图像解码既有并发策略与 OIIO single-flight 不变，每个 FFmpeg 仍使用一个线程。视频 proxy 只尝试 H.264；探针或实际编码失败时返回失败，不尝试 VP9。

| 证据 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/media-memory-concurrency.test.ts tests/unit/media-memory-budget.test.ts` | 2 个文件、11 项通过；覆盖阈值、动态降档、取消释放及 FFmpeg 槽位满时图片解码仍可使用空闲预算。 |
| `npm run typecheck` | 通过。 |
| `npx eslint src/worker/library-service.ts src/worker/media-memory-budget.ts src/worker/media-memory-concurrency.ts tests/worker/video-exr.test.ts tests/unit/media-memory-concurrency.test.ts` | 通过；大型 `library-service.ts` 有 Babel deoptimization 提示。 |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/media-concurrency.test.ts tests/unit/media-memory-budget.test.ts tests/unit/video-proxy-encoder.test.ts tests/unit/media-memory-concurrency.test.ts tests/worker/video-exr.test.ts tests/worker/thumbnails.test.ts tests/worker/thumbnail-throughput.test.ts` | 通过，7 个文件、183 项测试。使用仓库的 Electron Node 测试入口加载匹配 ABI 的 native 模块。 |
| `npm run test:library-availability` | 通过，9 个文件、234 项通过、1 项跳过；`ensure-native` 确认 better-sqlite3 ABI 与 FTS5 probe 正常。 |
| 真实 Electron E2E、真实混合媒体压力/内存采样、Computer Use | 未执行。当前开发实例正在使用共享构建目录，E2E harness 启动时会清理并重建该目录；本轮不打断正在运行的实例。不得将单测或 Worker 通过替代这些证据。 |

具体四列映射和当前验证限制已同步到实施方案 §11.3；独立 QA 报告记录未执行项。本次不把该增量或整份 MEDIA-FAST-003 标记为完整或已验收。

独立只读 Standards/Spec 审查发现并促成修复了“FFmpeg 队首阻塞缩略图”和方案文档残留旧 VP9 状态两项问题；同一审查者对修正做了复核，确认两项均解决且无新的 P1/P2。详见[审查记录](../reviews/2026-10-21-memory-aware-media-concurrency-review.md)。

## 已知边界

本轮先落地动态并发门控。若没有可用的真实低内存环境或真实 Worker/Electron 混合媒体旅程，必须将相应平台/压力证据明确记录为未执行，不得由模拟单测代替。
