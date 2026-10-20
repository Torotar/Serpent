# 导入加速第一阶段 QA

日期：2026-10-19 开始，2026-10-20 续测。工单 `Serpent-8h9qg.1`。状态：最终门禁未完成，未验收。

依据：[实施方案](../implementation/2026-10-19-import-acceleration-plan.md)。比较基线为 `589d41aaa334c9b04c4623741ea7cdf45c4dafb3`；本轮未提交工作树须通过性能结果中的源码摘要识别，不能只用 HEAD 指代。

## 可追溯范围

| 需求 | 实现 | 自动化 | 人工 / 平台 |
| --- | --- | --- | --- |
| IMP-FAST-001 名称与磁盘目录查找 | `import-destination-directory-cache.ts:12`；`library-service.ts:13059`、`:45262`、`:45679` | `import-acceleration.test.ts:236` / `:401` / `:465` / `:547`；`eagle-import.test.ts:97`；`tests/e2e/import-conflict-flows.test.ts:26` | 本机 Windows Worker 与真实 Electron 通过；其他平台和 packaged 未执行，人工未验收 |
| IMP-FAST-002 当前版本内容查重 | `library-service.ts:3040`、`:3813`、`:42854` | `import-acceleration.test.ts:75`、`:135`；完整资源库门禁 234 项通过 / 1 跳过；`tests/e2e/asset-ingestion.test.ts:623` 完整退出重启与实解码 | Windows 独立应用重启证据通过；人工未验收 |
| IMP-FAST-003 序列检测复用 | `image-sequence-import-discovery.ts:14`；`library-service.ts:13199`、`:13239`；`src/shared/image-sequence.ts:285`；Renderer 反向索引 | `tests/worker/image-sequence.test.ts:296`、`:327`；共享 / Renderer / Worker 整合 50 项；`tests/e2e/image-sequence-import-preview.test.ts:29` 实解码 / FPS / 范围 / 成组 | Windows Worker 与真实应用序列旅程通过；人工未验收 |

## 测试与限制

当次命令和结果随执行写入[开发记录](../development/2026-10-19-import-acceleration-development-log.md)。最终 `verify:mainline` 的 lint、typecheck、extension verify 与资源库可用性通过；全仓 `npm test` 输出三个失败后超过 5 分钟没有新日志，Vitest / Electron worker 基本空闲，由主 agent 中断。测试没有输出完整堆栈或汇总，原因未明；不能判为与本变更无关。该门禁之后的 search performance、完整 E2E 与快捷键检查未执行，故 QA 仍未验收。

后台 Electron 测试均隔离 userData，不操作真实资源库。本环境原生桌面控制不可用，Computer Use 未执行；自动化图片解码与主 agent 截图检查仅作为真实 Electron 自动化证据，不标记为人类验收通过。截图是自有红 / 蓝 PNG fixture，重启后资源库名称、2 个资产及各自尺寸和副本名正常；截图和夹具位于本轮隔离测试目录，该目录清理被执行环境拒绝，仍留在本地工作区。

性能分别记录实际导入 API 的固定基线 / 工作树 A/B，以及正式 20,000 资产混合媒体库回归。前者的微型 PNG 用于隔离算法成本，不涵盖大媒体复制、缩略图完成、UtilityProcess 通信或界面响应。单进程两版模块共驻的 RSS 边界采样不能解释成各版峰值内存。

## 最终源码 A/B

命令：`node scripts/bench-import-acceleration.mjs --filesystem NTFS --storage-class "local NVMe volume"`。Windows x64、Electron 43.1.0 / Node 24.18.0，固定 seed。每场景每版累计至少 5 秒预热，计时排除预热；AB / BA 成对交替，全部串行，期间没有并发测试。每次恢复完整闭库快照，包括 DB、artifacts、operations、迁移备份，并逐项验证路径 / 类型 / SHA-256 一致。

| 场景 | 配对轮数 | 原版总耗时中位数 | 优化后中位数 | 两版中位数之比的耗时降幅 |
| --- | --- | --- | --- | --- |
| 20k 条目 + 400 个微型 PNG | 5 | 16,963.664 ms | 5,338.122 ms | 68.5% |
| 20k 条目 + 1 个微型 PNG | 3 | 380.217 ms | 190.339 ms | 49.9% |

400 文件各组成对降幅为 59.7%–71.8%，中位数 69.3%；单文件为 49.9%–52.9%，中位数 51.1%。这些配对比例的中位数与上表两列中位数的比值是不同统计量。

400 文件的 prepare 中位数 11,886.547 → 2,807.908 ms，apply 中位数 5,289.886 → 2,402.044 ms。目的地目录枚举累计处理的条目数从 32,000,000 降到 80,000；单文件两版均为 80,000，仍需实际磁盘身份检查，收益主要来自查询与阶段工作减少。

这是 SQL 预置条目与磁盘单字节占位文件构成的闭库合成负载，来件为有效 1×1 PNG；并非 20k 可解码图片库。生产 service 的实际 prepare / resolve 均执行，计时不含开库迁移与 UI / IPC / 缩略图任务。没有测大文件复制、所有来件均为重复内容的场景或旧库大量 NULL 指纹回退场景，不能外推统一提速百分比。

原始样本与源码摘要：[performance.json](2026-10-19-import-acceleration-performance.json)。测量时 `src` 摘要为 `fa1786d83b12c51805f40f5863c4e1b60108882ba9682cda0f1846c44ec1253a`（951 文件）；HEAD 没有包含未提交改动，不能用 HEAD 代替该摘要。初次对照之后修了独立审查发现，再重新运行取得上表数据；上表不引用审查修复前快照。

此后为 Windows 门禁失败修正了 `createLibrary` 的三处目录发布 / 失败清理调用（`Serpent-hms58`），当前 src 摘要为 `8b6d0183968199d9643258b32c78b0472e87d7b639ba6407633793d1bf814649`。独立重新计算整个 src 树，并仅将这三处调用还原为测量时文本，所得摘要与上方测量摘要完全一致；导入计时路径及其他源码均未改变。`createLibrary` 不在本 A/B 的 prepare / resolve 计时内，因此不为该次非计时路径小修重复跑导入性能对照；上方数据仍准确归属原始测量快照，未改写 JSON 冒充新树实测。

## 正式混合媒体基线

正式夹具包含 20,000 资产，按仓库既定 90% 可解码图片及混合媒体分布生成；与上方合成导入负载分开。`tests/worker/large-library-performance.test.ts` 3 项通过：Worker startup 10.5 ms、folder switch 0.5 ms、固定 token search 18.1 ms，完整 reconciliation 2,827.9 ms；对账期间 viewer resolve P95 2.1 ms，事件循环 lag P95 1.0 ms / max 76.8 ms。这里的 startup 不是 Electron 进程启动或结构一致性恢复总耗时。

网络元数据缓存测试通过（hot path 零主数据库浏览查询）；该场景是本地模拟，不能代表真实 NAS 时延。删除刷新路径由该基线明确排除，本轮没有据此宣称 200 ms 删除目标已验证。
