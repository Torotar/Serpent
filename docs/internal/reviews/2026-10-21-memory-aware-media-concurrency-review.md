# 内存感知媒体并发代码审查

- 范围：`Serpent-e468e4` 首个实施增量，按 Standards 与 Spec 双轴检查。
- 审查方式：独立 Luna 审查者只读静态审查，并对初次发现的修正做只读复核；审查者没有编辑文件或运行测试。
- 状态：初次发现的问题已修复；复核未发现新的 P1/P2。整项功能仍未验收。

## 初次发现与处理

| 严重度 | 发现 | 处理 |
| --- | --- | --- |
| P1 | FFmpeg keyed slot 已满时，队首等待任务会阻止后续 Sharp/OIIO 使用仍空闲的全局字节预算，影响图片缩略图和 proxy 共存。 | [media-memory-budget.ts:214](../../../src/worker/media-memory-budget.ts#L214) 只在队首字节容量足够但 keyed slot 不足时查找其他 admission key 的可运行任务；字节容量不足仍遵守队首顺序，同 key FFmpeg 保持 FIFO。[单测](../../../tests/unit/media-memory-concurrency.test.ts#L95) 验证图片先运行，并验证 FFmpeg 等待顺序。复核者确认已解决。 |
| P2 | 方案文档称当前 `library-service.ts` 仍有 VP9 fallback，与用户要求和实现冲突。 | [实施方案 §6.1](../implementation/2026-10-20-thumbnail-proxy-acceleration-plan.md#L151) 已把该描述限定为基线状态，并说明当前实现已移除 VP9。复核者确认文档与代码一致。 |

## 标准与规格核对

- 系统内存阈值通过 `os.freemem()` 读取；低于 4 GiB 或未知时 FFmpeg 并发上限为 1，达到阈值时上限为 2。新任务获准时重新采样，降档不终止活动进程。
- FFmpeg 槽位与共享 384 MiB 估算字节预算在同一准入中登记和释放；等待不预留字节，取消/异常由 `finally` 释放。
- Sharp/OIIO 与全局内存预算协同；OIIO 原有 single-flight 保持不变。队列只允许其他 admission key 越过因 slot 阻塞的任务，避免改变同资源顺序。
- H.264 不可用或生产编码失败时显式失败，不调用 VP9 encoder。对应 Worker 测试覆盖探针失败、运行时失败和大产物大小路径。
- 变更没有新增 UI。没有新增个人路径、用户名、资源库名称或凭据样本；新增测试使用独立临时目录和抽象资源标识。

## 验证证据与限制

实现者在修正后运行：定向媒体测试 7 个文件、183 项通过；`npm run test:library-availability` 9 个文件、234 项通过、1 项跳过；`npm run typecheck` 和受影响文件 ESLint 通过。

真实 Electron E2E、Computer Use、真实混合媒体速度与进程树 RSS 测量未执行。当前开发实例仍使用共享 `.vite` 构建目录，而 E2E harness 会在启动时清理并重建该目录。本审查不将这些未执行项写作通过，也不将本次增量标为已验收。
