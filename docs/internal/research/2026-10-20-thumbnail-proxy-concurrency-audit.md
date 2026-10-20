# 缩略图与视频 proxy 并发核查

日期：2026-10-20。源码基线：`589d41aa` 加当前未提交工作树。此次仅核查源码、历史记录、随包二进制帮助和官方文档，没有修改产品代码，也没有测量媒体吞吐或真实用户数据。

## 结论与证据

“所有缩略图都单线程”不准确；“导入媒体仍同时运行多个 FFmpeg”也不符合当前 LibraryService 实现。

| 范围 | 当前行为 | 证据位置 |
| --- | --- | --- |
| 普通图片 | Sharp 后台最多 2 个任务，可见图片交互池最多 4 个；物理核心数不足时降低，并受共享内存预算限制；libvips 内部 concurrency 为 1 | `src/shared/media-concurrency.ts`、`src/worker/library-service.ts` 的 `requireSharp` 与进程级 Sharp semaphores |
| LibraryService 内 FFmpeg/ffprobe | 同一个 Library Worker 进程内，跨库、跨 service 共用一个槽位；包括封面、视频/音频 proxy、联系表、元数据探针和编码器探针 | `library-service.ts:4817`、`:7845`；已有测试 `tests/worker/video-exr.test.ts:1620` 明确断言最大并发为 1，此次未运行 |
| FFmpeg 内部 | 默认输入视频解码、普通滤镜、复杂滤镜各限制为 1；proxy 输出编码参数也指定 threads=1。不能据此把整个进程所有线程或 GPU 工作称为严格单线程 | `library-service.ts:563`、`:28572`、`:28593` |
| OIIO | 进程内共用一个槽位 | `library-service.ts:4818`、`:7880` |
| 其他 FFmpeg 调用 | 语义音频准备直接 spawn，不经过上述槽位，因此不能把 LibraryService 的限制说成整个应用所有 FFmpeg 的绝对进程数上限 | `src/worker/handlers/semantic-index.ts:355` 的 `convertAudio` |

队列的两个异步执行者不等于两个 FFmpeg 子进程；其中一个可以正在等待 semaphore。普通图片主要由进程内 Sharp/libvips 处理，也不能称为多进程 FFmpeg。

## 为什么变成这样

`aa4634b28`（2026-08-25）将 FFmpeg 收紧到一个槽位。对应开发日志 `docs/internal/development/2026-08-25-media-task-memory-safety-development-log.md` 记录原生内存不足、进程创建失败及 lease-lost。旧海报链路使用 `thumbnail=300`，可能在缩小之前保留大量原始分辨率帧，多解码器并发进一步放大峰值。

当前 `generateVideoPoster` 已经改为输入侧 seek 到时间点、缩放并输出一帧，不再使用 thumbnail=N。限制的安全背景成立，但旧帧批缓存问题已变化，应以当前链路重测合理并发，而不是直接恢复按 CPU 核心数扩张的旧配置。

## 可确认的问题与候选

### 1. Windows 的编码器选择不能证明使用了硬件

`src/worker/video-proxy-encoder.ts` 的顺序是 VideoToolbox → Media Foundation → NVENC → QSV → AMF → OpenH264。探针成功即选中；`ffmpegOneFrameEncodeArgs` 和生产 `h264VideoProxyProfile` 都未给 h264_mf 添加 `-hw_encoding 1`。`library-service.ts` 仍把 VP9 放在回退链中，这与用户明确禁止 VP9 的要求冲突；本轮基准没有执行该路径，产品代码仍需移除它。

本轮运行随包 Windows FFmpeg：

- H.264 一帧探针：h264_mf、libopenh264 成功；NVENC、QSV、AMF 失败。没有尝试其它编码格式。
- `ffmpeg -hide_banner -h encoder=h264_mf`：`hw_encoding` 的默认值为 false。

因此名称含 mf 和一帧编码成功都不是硬件编码证据。本轮真实片段中 h264_mf 与 OpenH264 都成功完成 20/20 段最多 15 秒的 proxy；h264_mf 仍未证实使用硬件。

建议让硬件探针与生产使用一致的硬件参数；优先评估显式 GPU 编码器及 h264_mf 的硬件模式，失败后再进入软件编码。应记录实际选择、失败回退和完整素材编码速度。官方依据：[Media Foundation 编码器选项](https://www.ffmpeg.org/ffmpeg-all.html#MediaFoundation)。

### 2. 短探针、单帧封面和长转码竞争同一槽位

`runFfmpeg` 的同一 semaphore 覆盖元数据 probe、poster 和完整 proxy。已有同资产主预览优先、交互取消后台派生、urgent fallback 免取消等保护，不能说完全没有优先级；但这些机制没有独立的短任务执行容量。显式 proxy 的长转码仍可能让其他库/资产的短任务等待。

建议候选：元数据探针、单帧封面、长转码分别准入，保留跨库总预算和取消/资源压力退避。可从“小并发封面 + 一个 proxy”开始试验，具体数值由内存和吞吐决定，不能仅把现有 semaphore 的 1 改成较大数字。

同时调整领取任务的范围，避免两个队列执行者都领到长任务并堵在 native gate 前，使短任务即使有独立 semaphore 也无法开始。

### 3. 扩大并发前必须完善预算估算

现有 `mediaNativeMemoryBudget` 是 384 MiB 的进程级估算准入预算，不是实际 RSS 上限。当前视频 poster/proxy 调用未传已知尺寸给 runFfmpeg，通常按未知 FFmpeg 的 128 MiB 预留。且预留发生在取得 FFmpeg semaphore 之前，排队任务也会占用预算。本轮隔离基准中，代理单并发进程树峰值约 648–756 MiB，双并发约 1.16–1.33 GiB；进程树数值包含基准运行时，不等同于 Worker 准入内存，但说明当前估算不足以直接批准并发扩张。

应按源分辨率、解码器缓存及转码方式保守估算，并避免等待 decoder 槽位的任务长期占住预算；需统一资源准入设计，防止改锁顺序引入饥饿或死锁。先有这些保护，再评估 4K/8K 的受控多进程。

### 4. proxy 成本不只在编码端

当前 proxy 缩到最长边不超过 720、保持原帧率、转完整时长；没有指定硬件解码或 GPU 缩放。H.264 软件路径限制输出编码 threads=1。即便硬件编码成功，输入解码和 CPU 缩放仍可能占主要耗时。

建议在确认真实编码器后，分别比较受限的 1/2/4 解码线程与转码吞吐，再考虑平台专属的硬件解码/缩放。GPU 往返复制可能抵消收益，不能只加 hwaccel 就宣称加速。官方依据：[FFmpeg 硬件加速说明](https://www.ffmpeg.org/ffmpeg.html#Advanced-Video-options)。

帧率封顶属于预览质量取舍，需单独确认，不能默认修改。播放本来可直接使用的源文件继续 source-first；现有 `artifact-policy.ts` 已要求真实播放失败后的显式请求才准入 proxy，按需生成不是本轮新增方案。

视频编码兼容、仅容器或音频有问题时，可评估先 remux/copy-video，只重编音频，再回退全视频转码；必须有实际播放器解码和失败降级证据。官方依据：[FFmpeg streamcopy](https://www.ffmpeg.org/ffmpeg.html#Streamcopy)。

### 5. 复用已有元数据

`generateVideoPoster` 在未传入 duration 时调用 `probeVideoDurationSeconds`；独立技术元数据任务又可能执行完整 ffprobe。优先复用当前 revision 的已就绪元数据，并对在飞探针去重，避免每个视频反复启动探针和读同一源。不能让封面等待全库元数据完成。

联系表还会通过 `countVideoKeyframes` 读取全片计数，再运行采样生成；当前联系表只在 AI 分析需要时生成，不是普通导入缩略图的必经成本。优化这条路径应独立衡量。

## 建议实施顺序与验证

1. 修正并验证 Windows 硬编码选择和探针/生产参数一致性，补实际 codec、速度及各阶段耗时诊断。
2. 统一资源准入，在保留预算的条件下拆分短任务与长转码容量，并复用 probe 结果。
3. 测量后调整受限线程数、软件回退及硬件解码/缩放；按兼容性矩阵评估 remux。

测量必须拆开排队时间与真实处理时间，分别记录图片/视频封面吞吐、proxy 相对实时速度、可见首图延迟、Worker 与子进程 RSS、失败/取消/重试及剩余临时文件。使用隔离合成媒体，覆盖高清/4K/8K、长视频、不同编码/容器及跨库并发，不能用一帧测试估算整片速度。

功能修改后同步相关 unit/Worker 测试与真实 Electron 媒体解码旅程；若触及 library-service，完整运行资源库可用性门禁；性能回归使用项目正式 20,000 资产混合媒体基线。自动化在后台运行，临时媒体、库和 profile 按本轮归属清理。

2026-10-20 使用隔离临时 harness 完成一轮真实资产基准：150 张图、20 段视频、Sharp/FFmpeg 图片吞吐、输入/输出 seek 对照、两种 H.264 编码器及 1/2 路并发。结果详见实施方案文档。没有改动产品代码；该运行不是正式 20,000 资产门禁，没有完成人眼画质、packaged 或跨平台验收，也不能证明硬件编码。临时 manifest、媒体输出与测试文件已清理。本轮没有新功能增量，不新增待人类验收条目。
