# 内存感知媒体并发 QA

- 工单：`Serpent-e468e4`（P0，进行中）
- 开发日志：[内存感知媒体并发开发记录](../development/2026-10-21-memory-aware-media-concurrency-development-log.md)
- 规格：[缩略图与视频 proxy 加速方案](../implementation/2026-10-20-thumbnail-proxy-acceleration-plan.md) §10–11
- 结论：**部分实现，未验收**。系统内存阈值、解码器共存、Worker 并发与资源库可用性自动化通过；真实 Electron 旅程、混合媒体内存测量和人眼证据未执行。

## 四列追溯

| 需求 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 低于 4 GiB（或探测不可用）限制为 1 个 FFmpeg；达到 4 GiB 后最多 2 个；等待任务重新检查内存，降低档位不终止活动进程 | [内存策略](../../../src/worker/media-memory-concurrency.ts#L21)、[Worker 准入](../../../src/worker/library-service.ts#L7850)、[原子预算](../../../src/worker/media-memory-budget.ts#L81) | [策略和预算单测](../../../tests/unit/media-memory-concurrency.test.ts#L10)：11 项通过；[Worker 并发覆盖](../../../tests/worker/video-exr.test.ts#L1632)、[降档覆盖](../../../tests/worker/video-exr.test.ts#L1682)：Worker 组内通过 | 未执行真实混合媒体负载、RSS 采样、Electron E2E 和 Computer Use。不能判定端到端内存安全或导入提速。 |
| 视频 proxy 不使用 VP9，H.264 不可用/失败时显式失败 | [H.264-only 解析与 proxy](../../../src/worker/library-service.ts#L28639) | [无 H.264 编码器](../../../tests/worker/video-exr.test.ts#L868)、[运行时失败](../../../tests/worker/video-exr.test.ts#L913)、[大文件产物](../../../tests/worker/video-exr.test.ts#L1104)：Worker 组内通过 | 自动化使用 mock spawn；真实随包 FFmpeg 编码和用户资产验证未执行。 |

## 实际命令与结果

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/unit/media-memory-concurrency.test.ts tests/unit/media-memory-budget.test.ts` | 通过，2 个文件、11 项测试。 |
| `npm run typecheck` | 通过。 |
| `npx eslint src/worker/library-service.ts src/worker/media-memory-budget.ts src/worker/media-memory-concurrency.ts tests/worker/video-exr.test.ts tests/unit/media-memory-concurrency.test.ts` | 通过；仅有 `library-service.ts` 大文件触发的 Babel deoptimization 提示。 |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/media-concurrency.test.ts tests/unit/media-memory-budget.test.ts tests/unit/video-proxy-encoder.test.ts tests/unit/media-memory-concurrency.test.ts tests/worker/video-exr.test.ts tests/worker/thumbnails.test.ts tests/worker/thumbnail-throughput.test.ts` | 通过，7 个文件、183 项测试。 |
| `npm run test:library-availability` | 通过，9 个文件、234 项通过、1 项跳过；native ABI 与 FTS5 检查通过。 |
| 真实 Electron E2E | 未执行。`scripts/run-e2e.mjs` 会先删除并重建共享 `.vite` 构建目录；当前开发实例仍在运行，因此本轮避免中断工作区应用。 |
| 正式混合媒体基准、内存压力测量、Computer Use | 未执行；当前自动化仅证明模拟调度合同，不证明真实媒体速度或进程树内存。 |

普通系统 Node 直接运行 Vitest 时会遇到 native ABI 不匹配；本轮按仓库约定改用 Electron Node runner，必需 Worker 自动化门禁已完成。之前尝试的隔离 native 构建目录及意外生成的空 `build` 配置已清理；未保留临时媒体或数据库。人类验收清单不新增“待验收”项，真实混合负载和 Electron 证据齐备后再按最小用户旅程加入。

提交前对 tracked 文本做了本地模式扫描，工具只输出分类计数、不输出匹配原文：盘符路径类命中 59 个文件、家目录类 13 个、UNC 类 12 个、凭据形态类 52 个；这些命中属于本轮新增行以外的现存树内容，未在本增量中逐条白名单审计。暂存新增行在上述四类均为 0 命中。仓库尚无 `privacy:scan` 自证门禁，本次扫描也未使用个人本机未跟踪的私密词表；不据此声称全仓隐私扫描通过，相关缺口仍由 `Serpent-b78285` 跟踪。

## 后续验收条件

1. 在可以安全重建共享 E2E 构建目录的时段，运行方案指定的隔离 userData Electron E2E，验证图片真实解码、视频元数据/尺寸和播放推进、完整退出重启及关闭资源库时进程回收。
2. 用真实 Worker 混合负载测量低于/高于 4 GiB 的准入、系统可用内存最低点、进程树 RSS、输出有效性和总耗时；只记录实际观察结果。
3. 由独立审查与用户 Computer Use/人类验收完成四列证据后，再更新工单状态和验收清单。
