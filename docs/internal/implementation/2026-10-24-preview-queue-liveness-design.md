# 后台预览停滞与小图直出不收敛：根因分析和实施设计

日期：2026-10-24。工单：`Serpent-7b6c0a`。源码基线：`dev` / `1ad1eb8b`，核查时存在其他工作中的未提交修改，本次未改动产品代码。

状态：本文记录**实施前的分析与方案基线**，不描述后续代码状态。后续实现、自动化结果、审查及未覆盖边界见[开发记录](../development/2026-10-24-preview-queue-liveness-development-log.md)和[QA 报告](../qa/2026-10-24-preview-queue-liveness-qa-report.md)。关联 `Serpent-90ff52`、`Serpent-1de919`、`Serpent-sa65`。本文中的“尚未实施/未执行”均指写作时点，不替代后续验证证据。

## 1. 结论

此次问题同时涉及执行活性、候选发现和展示状态，不能仅恢复一处回调：

1. 后台执行意图寄存在 `scheduleThumbnailQueue` 的闭包、active/rescheduled 标志和可选恢复回调里。可见波接管后，部分结束路径没有接续普通主预览泵；有持久任务不代表有未来执行者。
2. 缺失预览的全库补队是普通泵的尾操作。普通泵停止后，最初几批以外的候选也不再发现。
3. 补队先 SQL `LIMIT`、后在 JS 排除原图直出候选。批次新增为零不代表候选耗尽；只恢复泵仍可能被整批小图挡在扫描前部。
4. 原图直出是已经具备的策略，但其动态结果没有贯通增量事件和前端状态。尺寸从未知变为已知后，卡片可能有正确宽高，却依然没有可用 URL。

模型依赖 Main 的单槽离屏渲染；可见 raster 快速入口会过滤模型，因此尤其依赖后台接续。资源限制本身需要保留，必须把“模型不占图像名额”和“模型有持续执行者”同时实现。

## 2. 实例核查及证据边界

### 2.1 本次读取的事实

通过进程信息确认安装版 Serpent 正在运行；安装包与源码均为 0.3.2。使用 `@electron/asar.extractFile` 在内存检查安装包 Worker，确认存在与源码相同的交接控制流。安装产物已压缩、注释和变量名消失，不能以搜索不到注释认定该分支不存在，也不能据版本号认定全部字节与当前工作树一致。

通过 Node 内建 SQLite 的 `DatabaseSync(..., { readOnly: true })` 查询最近活动库；没有修改真实数据库、任务、预览文件或用户配置，没有主动触发重试、刷新、恢复、切库或重启。

| 核查项 | 本次快照 |
| --- | --- |
| 主预览任务 | `generate_thumbnail`：queued 124、running 0、paused 0、succeeded 59、cancelled 9 |
| 排队任务领取次数 | 124 条 `attempt_count` 合计 0 |
| 任务租约 | `library_job_leases` 0 条 |
| 队列来源 | priority 100 / 150 / 250 分别为 46 / 48 / 30 条，与 startup / refresh / linked 场景一致 |
| 排队时间 | 当日 13:57 左右建立；这些行的更新时间仍与建立时间相同 |
| 排队格式 | FBX 11、GLB 5、JPG 74、PNG 34 |
| 已满足原图直出却仍 queued | 22 条；这是已知尺寸满足阈值的子集 |
| 粗略缺产物且无活跃主任务 | 2584 个；此数**不是**需要生成预览的数量 |

用户报告面板曾为 104，本次库快照为 124。两者可能处于不同时间或界面投影状态，当前证据不足以给出确切差额原因。不能未经验证就把差额定性为摘要缓存 bug，也不能以面板数字代替数据库事实。

2584 个粗略候选中有 1253 个 `.uasset`、143 个 ZIP、15 个 MAX 等，还包含 9 个尺寸已知的小型原图直出资产。ZIP 是否可生成取决于已启用 provider；不能把全部未知格式送进原生 decoder，也不能把这 2584 个都写成调度遗漏。这里至少有 JPG 589、PNG 319、WebP 9、TIFF 6、EXR 1，以及 FBX 135、GLB 27、OBJ 22 的格式级候选；最终还要排除直出、忽略、隐藏序列帧、终态失败等业务条件。

与用户所述目录及约 173 KiB 大小对应的 PNG：480×480、177377 bytes；13:57:23.273 建立任务，13:57:23.329 以 `cancelled / SOURCE_DIRECT` 结束，间隔 56ms。它不在 124 条排队记录中。该取消表示无需另行编码，不能解释成用户取消或图像生成失败。

### 2.2 尚不能声称已取得的证据

- 最近库配置的 active pointer 为空，诊断选择最近打开的库；其计数与用户提供的另一份分析一致，但不是 Worker 当前内存状态快照。
- 尝试 Computer Use：识别到 Serpent 窗口，但截图呈现遮挡窗口，可访问性树仅有空区域；未取得可读的当前任务面板。为保持用户前台工作，未激活窗口。**真实 UI 状态和截图验收未执行**，不保存含私人内容的截图进仓库。
- 没有把完整当前应用挂入调试器，没有读取调度器内部 Map/Set，也没有重启真实实例证明恢复。
- 本轮未运行 Vitest、资源库可用性套件、Electron E2E、packaged 或性能门禁；没有产品修复可供验收。

## 3. 根因链

### 3.1 持久任务与执行意图脱节

入口：`src/worker/index.ts` 的 `scheduleThumbnailQueue`。

已有行为：

- 新请求先 enqueue；发现 active 后，用 `rescheduledThumbnailQueues` 记一个布尔值。
- 高优先级可见请求写 `pendingVisibleThumbnailWaves`，并修改 active pump 的 claim scope。
- 下一波根据 pending visible 将 `viewportOnlyWave` 置为 true；这时禁止回落整库领取和运行全库补队，保护前台延迟的方向正确。
- 普通泵的原始 options 只在闭包和某些 `resumeOrdinaryQueue` 回调中保留，数据库里没有对应的“需要继续执行”唤醒记录。
- 可见波结束后，无待处理 exact reconciliation、待启动 startup 或交互 idle 恢复条件时，结束路径只启动 secondary 队列。

`completedVisibleWaveIsCurrent` 分支的注释提到以后由 browse/refresh 或独立维护调度接手，但未找到保证接续主预览与候选遍历的独立常驻 owner。已有资源压力 retry 和 exact reconciliation retry 只处理各自条件，不能承担一般后台活性。

**断点不只在用户引用的那个 if 内**：即便下一波结束时 `queueWasRescheduled` 已被上一轮消费，普通结束尾部仍可能仅启动 secondary。因此把 return 改成立即调用旧闭包，只覆盖部分路径，还会继承可见 scope/options，或把重扫描带回交互路径。

### 3.2 候选发现被绑在执行循环尾部

`mayRunBackgroundRepair()` 要求非 viewport-only、未 abort、无 pending visible 等条件，才会调用 `enqueueThumbnailJobs(limit: 500, priority: 50, skipStaleRepair: true)` 与尺寸回填。

这是合理的**执行时机限制**，但现在它同时成为**是否还有发现者**的开关。主泵被交互让出后，后台补队需求没有独立保存，startup/refresh/linked 各最多 50 条的初始批次不能覆盖整个库。用户不再操作时也不会自然修复。

### 3.3 零入队不等于扫描耗尽

`library-service.ts` 的 `enqueueThumbnailJobs` 查询：

1. 从缺主预览、无活跃任务的格式候选中按创建时间/路径取 `LIMIT`。
2. 读尺寸、字节数，在 JS 中执行 `isSourceDirectPreview` 和 `admitArtifactJob`。
3. 小图不入队，函数只返回新增任务数。

因此当最前面的整批候选都是 source-direct 时，之后每次都可能重新看到相同候选、返回 0；真正要生成的大图或模型在后面永远到不了。被其他后置策略排除的候选也有同类问题。该缺口由源码确认，**不是已证明本次 124 条未领取的直接触发器**；完整修复必须覆盖它。

相同审查要覆盖尺寸回填：一批不可解析源不能让游标永远停在同一组文件。

### 3.4 小图策略成功，界面仍无图片

策略：`src/shared/preview-policy.ts`。

| 条件 | 现行值 |
| --- | --- |
| 类型 | image |
| 扩展名 | JPG/JPEG/JFIF、PNG、WebP、AVIF、GIF |
| 文件大小 | 大于零且不超过 2 MiB |
| 尺寸 | 已知的正整数；长边 ≤2048；总像素 ≤2,000,000 |

**PNG 支持原图直出**。未知尺寸不能仅凭文件很小就挂原图：压缩文件小不等于解码内存小。复杂图像格式和超阈值图仍走现有生成路径。

当前竞态：

```text
初始 browse：尺寸未知 → previewKind 没有 source → 卡片无 URL
    ↓
异步 header probe：写入 480×480，发送 asset.dimensions.ready
    ↓
Renderer：只 patch width / height / duration，不 patch previewKind / previewRevisionId
    ↓
claim 或 scoped prune：任务以 SOURCE_DIRECT 结束，不生成 artifact，也不发布原图可用事件
    ↓
卡片 URL resolver：没有 artifact，也没有 source 标记 → URL 仍为空
```

`catalogAssetSummaryFromRow` / `catalogBrowseLayoutEntryFromRow` 在**重新读取**时会算出 source，但 `AssetThumbnailPatch` 甚至没有这两个字段；尺寸事件和普通二级 metadata 事件都不能完整更新当前卡片/稀疏布局的展示路由。重新读取可掩盖缺口，不应作为用户操作要求。

还存在策略复制：claim 前批量 source-direct prune 的扩展名手写列表遗漏 AVIF，而公共策略包含 AVIF。claim 时仍会二次拒绝冗余生成，因此不能说 AVIF 完全没有直出，但准入、批量收敛与展示必须使用同一规则。

### 3.5 模型任务的执行所有权缺失

`handlers/visible-window.ts` 调用 `filterVisibleThumbnailAssetIds` 排除模型，意图是避免 Main 离屏渲染占用快速图像波名额。后台主泵失去接续后，这些模型无法靠快速波自救；模型专用 gate 本身不是有工作就会自动运行的 scheduler。

此外，过滤 ID 和 overlay 排名需要在最终 claim 边界验证资源分类；不能只在入口过滤一次，然后让可变 overlay 再把另一类任务混入快速图像名额。

## 4. 两个本次隔离探针

均以 PowerShell here-string 输入 `node`，只在内存中用 TypeScript `transpileModule` 装载当前源码，无临时文件、无真实数据写入、无应用输入。下面是输入行为与实际输出摘要；它们是缺陷定位证据，不是修复后的产品测试。

### 4.1 普通泵 → 可见波 → 无普通接续

从 `index.ts` 提取 `isHighPriorityThumbnailQueue` 与 `scheduleThumbnailQueue` 原函数，注入受控依赖：第一波用 Promise 闸门停在 process 中；期间提交可见请求；无剩余 startup/exact reconciliation、无冷却或 idle 阻挡；随后释放第一波。每次 process 返回 0，模拟 claim scope 被缩窄后没有可领取项。

结果及断言：

```json
{
  "calls": [
    { "interactive": false, "ids": null },
    { "interactive": true, "ids": ["visible-fixture"] }
  ],
  "activePrimary": 0,
  "pendingVisible": 0,
  "secondaryAdmissions": 1,
  "ordinaryResumedAfterVisible": false
}
```

`node:assert/strict` 校验两次调用、第二次 interactive、主泵清空且 secondary 被启动。该探针复现控制流丢接续，不包含实际 durable queue、decoder 或完整 UtilityProcess；不能单独证明真实任务全部可运行。

### 4.2 尺寸 patch 后仍无原图 URL

装载真实 `applyAssetThumbnailPatches`、`isSourceDirectPreview`、`resolveAssetCardCoverUrl`。合成一张 177377 bytes 的 PNG summary：初始尺寸未知，无 artifact、无 source 标记。按现有尺寸事件 patch 为 480×480。

实际输出：

```json
{
  "sourceDirectEligible": true,
  "width": 480,
  "height": 480,
  "previewKind": null,
  "coverUrl": null
}
```

严格断言直出策略为 true、URL 为 null。此探针证明当前增量接线有缺口，不声称读取到了真实 Renderer 当时的 React 内存。

## 5. 根本方案：明确后台需求、执行资源与展示路由

### 5.1 每个打开库一个生命周期 owner

新增小型 `PrimaryPreviewCoordinator`，替代主预览交接中分散的意图持有方式，接入既有 Worker scheduler、generation registry 和资源 guard。它不另建数据库、独立工作进程或第二份任务队列。

每库状态至少包含：

- `libraryGeneration`、调度 epoch、是否 closing。
- 最新 visible/focused/nearby 需求与精确 reconciliation ID 集合。
- `drainRequested`：需要继续处理已有 durable jobs；不携带旧场景闭包。
- `discoveryRequested` 与候选 keyset cursor / exhausted token。
- 当前在飞操作、待处理 demand version、下一次唤醒时间和明确阻挡原因。

持久 `jobs` 仍是任务真相源。上述是可从开库与 job summary/有界索引查询恢复的内存执行状态，不把任务可靠性依赖于内存永存。重开库后主动恢复 queued work 与候选发现需求，不等用户再次报告 viewport。

**活性不变量**：库可用且未关闭时，若有可执行任务或未完成候选扫描，则必须有在飞执行者、已登记的未来唤醒，或一个能在释放时唤醒的明确阻挡 owner。不能合法停在“有工作 + 没有执行者 + 没有唤醒/阻挡原因”。

### 5.2 所有结束路径归一为 reconcile

每次只完成一个有界操作；在 `finally` 中统一释放所有权，重新评估最新需求，选取下一步。成功、scope drained、abort、抢占、可见空波、zero enqueue、异常、资源拒绝都走同一条收敛出口。

```text
收到事件 → 合并并递增 demandVersion → 唤醒 coordinator
    ↓
校验库 generation / 生命周期 / 可执行时间与资源
    ↓
选择一个有界步骤：最新可见 / exact 修复 / durable 领取 / 候选发现
    ↓
提交结果、释放所有权 → 根据最新 demandVersion 再 reconcile
```

不能用旧请求结束时清理新请求：只有本轮确实满足、且版本仍匹配的需求才可 ack；若新请求在最后一次检查与 cleanup 之间到达，必须保留 pending wake。重复唤醒合并成一个计划，避免 timer 风暴。

可见波仍严格限定自己的 scope。后台 drain 是另一次独立调度，经过交互许可和安全边界后开始；不会在一个 viewport RPC 里直接同步补扫 500 行。

现有 startup/exact reconciliation 的可恢复批次需要归入同一 owner；迁移后删掉重复的意图源，不保留两套互相唤醒的主泵。

### 5.3 发现与执行分开，扫描必须前进

候选发现复用现有 catalog sequence 语义和 `RawMetadataBackfillAdmissionGate` 的 token/keyset 经验，**不复用 RAW 的持久状态行来保存主预览游标**。

采用稳定 `asset_id` keyset（结合已有格式索引），每轮同时限制候选数、源头探测数及耗时；每处理一个候选都推进 cursor，包括直出、不支持、被忽略、失败等不入队项。不能用成功入队数决定 cursor 或 exhausted。

返回结构至少为：

```ts
type PreviewDiscoveryOutcome = {
  examined: number;
  admitted: number;
  sourceDirect: number;
  skipped: number;
  cursor: string | null;
  exhausted: boolean;
  budgetReached: boolean;
  nextRetryAt: number | null;
};
```

- `admitted === 0 && !exhausted`：继续登记发现需求并让出一个时间片。
- 第一批全为直出小图，后一批含大图/模型：必须到达后一批。
- 失败探测有限退避；越过当前候选，不能卡住整条 cursor。
- 开库建立一次扫描；首屏一致性和交互许可就绪后分批推进，不等待一个可能永不出现的 viewport 事件。
- 新增/修订/恢复/provider 改变/产物失效通过精确 dirty IDs 进入；落在 cursor 前面的新 ID 不能遗漏。catalog token 变化不应每次强制从头重置，造成持续导入下尾部饥饿；本轮完成后再作有限复核。
- jobs 的进度变化不重置 catalog 扫描；exhausted 后只由相关变化失效，不在 UI 轮询时重扫。
- 首期可用内存 cursor，重开后按预算重新遍历；若实测需要持久化，只能追加 migration，不改历史迁移。不能拿持续重扫掩盖扫描成本。

在 SQL 阶段排除已知 source-direct 可以减少无效候选，但不替代 cursor：未知尺寸、provider 判定等仍有后置排除。

### 5.4 不同资源通道各自有进展

逻辑队列仍共用 `jobs` 和优先级 overlay；领取时按资源类型选择执行许可：

| 类别 | 执行资源与要求 |
| --- | --- |
| 可见 raster image | 沿用现有 interactive 图像预算，优先最新视口 |
| 后台图像/复杂图像 | 沿用 Sharp/OIIO 许可与共享内存预算，有界让步 |
| 模型预览 | 复用 Main 离屏 single-flight gate；不占 raster worker 名额；可见模型在模型通道提权 |
| document/font/plugin | 按实际执行资源分类，受控复用现有 provider 和 Main 渲染 owner |
| 二级 metadata/palette/proxy | 保留既有职责与显式 viewer fallback；不会被当成恢复主预览的替代品 |

模型通道与图像通道可以在现有安全预算内分别取得执行权；不是新增一套无预算并发。Main 单槽是否被模型、HTML、字体共享，要在实施前核对真实 owner，不能重复发放同一资源。

维持现有原生并发/内存保护，先解决活性，不以提高并发掩盖停泵。空闲窗口用于协调后台与交互，不能因面板轮询或几何重复报告无限延期；同范围且无实际等待任务的重复提示不应持续重置维护许可。多库使用资源级轮转，静态视口下后台可持续前进；持续真实前台负载下按可用资源公平让步，不承诺超出资源能力的绝对期限。

与 [10 月 20 日并发加速方案](2026-10-20-thumbnail-proxy-acceleration-plan.md)的关系：本方案修复需求接续、候选前进和状态正确性；硬件编码/多 FFmpeg 子进程仍按原方案独立验证，不在本轮同时扩并发或归并性能收益。

### 5.5 小图直出必须是明确可用结果

在 Worker/共享策略层提供统一 preview presentation 解析，输入当前 revision、源尺寸、字节数、可用性及 artifact 状态，输出 `source / artifact / pending / unsupported / unavailable / failed`。它是派生状态，不新增一份永久保存、易过期的 ready 标志。

首期保留已有 `previewKind: source` / `previewRevisionId` 字段，保证 summary、layout、Inspector 和封面 URL 采用同一解析规则。已存在且有效的 artifact 优先级保持。

新增或扩展 typed 预览状态事件，包含 library generation、asset ID、**revision ID**、解析后的 presentation 和必要尺寸。尺寸探测完成、metadata 补齐、source-direct prune、claim-time SOURCE_DIRECT、ready artifact 复用/失效等路径都发布正确结果。不能依赖 thumbnail artifact 生成成功事件，因为直出根本不生成它。

Renderer 用独立 projection/controller 同步更新：已加载 summary、当前稀疏 layout、Inspector、文件夹 cover candidate；仅更新订阅资产，保留现有合并/批量发布，不因一个小图刷新整个库。以 generation + revision fence 拒绝旧事件，支持显式清空旧 source/artifact，不能用只合并非空字段的逻辑留下过期 URL。事件漏收时通过有界 summary 重读收敛，不建立全库轮询。

`SOURCE_DIRECT` 是正常“不需要生成”的终态：可复用历史 cancelled/error_code 的存储语义，展示不报失败、不显示等编码，不制造假 artifact ID。既有 queued 小图分批收敛，不能一次性扫改所有任务，也不能每次重新入队再取消。

格式白名单、尺寸/字节限制只定义一次；SQL 候选筛选和 scoped prune 从共享策略常量构建，补齐 AVIF；原生 RAW/TIFF/PSD/EXR 等不能误当浏览器直出。

### 5.6 生命周期、等待原因与自愈

- pause 保持用户意图；coordinator 不自行 resume paused jobs。cancel 不因普通唤醒重新执行同一被取消意图；相关新 revision/显式 retry 按既有产品规则处理。
- close/switch 先置 closing、取消所有 wake/claim、等待受控 decoder/离屏 render 释放，再关 DB；迟到 callback 不能复活旧 generation。queued 是否保留继续遵守现有切库/关闭语义，不借本方案更改。
- queue processing 返回结构化 outcome，区分 scoped-drained、batch-limit、resource-blocked、retry-at、cancelled、failed、library-closed；`processed === 0` 不再被当成全库无工作。
- 等待资源释放、交互许可、重试到期、外部 hold 释放都显式登记唤醒。优先事件驱动，重试采用一个去重 timer。
- 增加低频活性 watchdog，只检查已有需求/有界索引线索，发现“可执行积压、无 owner/无 wake”时记录异常并补一次 reconcile。它是兜底，不是每秒全库扫描；对故障指数退避，不能空转或绕过暂停/资源拒绝。
- 本地诊断快照记录 generation、scope、通道、最后领取/完成时间、下一次唤醒、阻挡原因、发现进度。任务摘要继续复用 O(1) 计数；仅有 queued 无 running 时，内部应能解释 idle/cooling/resource wait，而不是假装正在生成。

## 6. 实施边界与复用位置

| 位置 | 调整 |
| --- | --- |
| `src/worker/primary-preview-coordinator.ts`（拟新增） | 需求/生命周期状态机、有界交接、统一结束出口；先确认无等价 owner |
| `src/worker/index.ts` | 变为 coordinator 接线；替换相关 Map/Set/闭包的意图职责，不继续大段内联 |
| `src/worker/library-service.ts` | 保留事务与文件所有权，提供有界候选/claim/presentation 结果 |
| `src/worker/handlers/visible-window.ts` | 只更新最新需求与优先级；模型转交正确资源通道 |
| `src/shared/preview-policy.ts`、`artifact-policy.ts` | 统一格式/尺寸策略和准入语义，复用现有 revision 检查 |
| `src/shared/protocol`、Preload、Main event bridge | typed presentation 变化事件及 revision/generation 校验 |
| `src/renderer/asset-thumbnail-patches.ts`、projection、browse layout | 完整 source/artifact/pending 投影与清空语义，避免重载全库 |

不修改真实原文件、不清空预览缓存、不删除重建任务历史、不要求用户刷新/重启才能继续、不新建 worktree。诊断和 fixture 仅用隔离合成数据。相关临时输出沿既有 owner 清理，不能产生旁置残留。

## 7. 回归设计与完成条件

以下均为**拟新增或补强**的验收合同；当前修复尚无实现与测试证据。

| 需求 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 普通泵被 visible 接管后自动继续 | coordinator + index（待实施） | scheduler 闸门：无 startup/exact 兜底；viewport 完成后真实 durable 后台任务被领取 | 未执行 |
| 任意结束路径不丢新需求 | coordinator（待实施） | 控制 cleanup 前/后到达事件；success/abort/error/zero/资源拒绝；最多一个 owner/wake | 未执行 |
| 无任务可领不等于无工作 | 结构化 pump outcome（待实施） | scoped empty + 全局 queued；全 paused；仅 retry-at；外部 hold 解除 | 未执行 |
| 全库候选最终遍历 | 有界 discovery（待实施） | 前 500+ 条全部 source-direct，后有大图和模型；前部不可解析、忽略、终态；新增落 cursor 前 | 未执行 |
| 已有队列无需新 viewport 也会恢复 | open 生命周期（待实施） | 真实 Worker 旧 queued 重开；无首个 viewport；窗口隐藏；完整 UtilityProcess 重启 | 未执行 |
| 小 PNG 未知尺寸变已知后立刻可显示 | presentation + Renderer projection（待实施） | Worker 延迟 probe；无需切页/刷新，卡片与 Inspector `complete && naturalWidth > 0`；无假 artifact | 未执行 |
| 全格式策略一致 | 共享策略/SQL（待实施） | JPG/PNG/WebP/AVIF/GIF 的 enqueue/prune/claim/catalog/projection 一致；阈值边界与未知尺寸 | 未执行 |
| 可见模型和后台模型均有进展 | 资源分类（待实施） | 纯模型视口、混合视口、后台模型 + 图像；Main 单槽，图像不被模型占额 | 未执行 |
| 用户控制和生命周期不回归 | 既有控制路径 + coordinator（待实施） | pause/cancel/retry、切库关闭、generation/revision 迟到事件、资源冷却、provider 失败 | 未执行 |

测试必须覆盖“静置不操作仍推进”，不能通过主动刷新/手动 resume/持续发送新请求维持循环，也不能只断言 enqueue 被调用。scheduler 测试使用受控 Promise 闸门和 fake clock，最终队列状态使用真实 Worker/SQLite 对账；不以长 sleep 和重跑掩盖时序问题。

实施后按仓库门禁执行（均后台、不抢前台）：

1. 定向 unit：coordinator、visible policy、preview policy、projection、Inspector/cover URL、稀疏 layout；定向 Worker：scheduler、thumbnails、ignore、序列、palette、provider、model。
2. 完整 `npm run test:library-availability`；本变更触及 Worker 协议/生命周期接线，不从简跳过。
3. 隔离 userData 的真实 Electron E2E：冷小图延迟 probe、静态视口后台 drain、模型/图像混排、pause/resume、完整退出再启动解码。
4. 正式 `tests/worker/large-library-performance.test.ts` 的 20k 混合基线与真实 Electron 浏览基准。分别记录可见首屏延迟、后台领取/完成、发现 examined/admitted、事务和事件量；证明小图不重复取消/入队、exhausted 不重扫、交互许可不会被轮询无限推迟。
5. 当前构建的 Windows packaged、真实桌面 Computer Use 与用户复验；其他平台/NAS 缺证据标未验证。当前安装包只作旧行为诊断，不能证明修复后的 HEAD。
6. 大规模功能编码完成后，仅一个独立审查 agent 同时审 Standards/Spec；启动前按仓库要求询问本次模型。设计阶段没有启动审查 agent，也未形成 accepted 结论。

交付目标是：小图直接可解码，真正需要生成的资产自动入队和持续执行；所有有意等待都有原因和恢复入口，静态视口不会再使主预览工作永久失去执行者。
