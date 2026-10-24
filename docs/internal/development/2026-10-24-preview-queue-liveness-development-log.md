# 后台预览队列活性与小图直出收敛开发记录

> 规格与根因分析：[后台预览停滞与小图直出不收敛设计](../implementation/2026-10-24-preview-queue-liveness-design.md)
> 分支：`dev`；基线/当前提交：`1ad1eb8b`（改动仍在工作树，未提交）
> 日期：2026-10-24；状态：独立交叉审查与用户功能验收通过；资源库/E2E 门禁通过；最终 20k 重跑与总门禁被 Windows 临时目录 EPERM 阻断

## 已实现行为

- 可见缩略图波完成后，调度器创建一个新的、无 viewport 资产范围的后台主预览波，恢复领取已持久化的主预览任务，并执行正常的有界缺失预览发现。后台恢复不继承旧闭包中的可见范围，也不扩大可见波本身的领取范围。
- 候选 SQL 在应用批次 `LIMIT` 前过滤尺寸、字节数已知且符合 source-direct 策略的 raster 图片，避免一批原图直出资产占满有限候选额度，使后续模型或需要派生图的资产长期不被发现。扩展名集合来自共享策略，包含 AVIF；JS 准入判断仍是最终裁决。
- source-direct 任务被旧队列 prune 或 claim-time 准入取消时，Worker 发布带当前 revision 和尺寸的正常尺寸就绪事件。尺寸回填、可见窗口探测和 metadata 完成事件也携带 source 路由；Renderer 在确认 revision 仍匹配后，更新已加载摘要及普通/稀疏浏览布局，卡片不必等待不存在的 thumbnail artifact。
- 没有增加 IPC 命令或数据库迁移。复用现有 Worker 队列、typed 缩略图事件、共享 source-direct 策略和 renderer 缩略图 patch 管线。

## 同步测试

- `tests/worker/thumbnail-scheduler.test.ts`：可见波完成后必须启动无资产范围的非交互后台主队列。
- 同一测试还让失败重试定时器在可见波运行时到期，并让随后一次后台续跑零进度；恢复唤醒仍须领取真实持久任务并生成 ready artifact，数据库 job 最终为 succeeded。
- `tests/worker/thumbnails.test.ts`：已知 source-direct 候选位于排序前部、批量限制为 1 时，后续需要生成的图仍被发现；旧 source-direct 队列取消会返回 revision/尺寸/source 状态。
- `tests/worker/linked-folders.test.ts`：链接图片尺寸探测返回 source 路由。
- `tests/unit/thumbnail-completion-projection.test.ts`、`tests/unit/asset-thumbnail-patches.test.ts`、`tests/unit/virtual-browse-session.test.ts`：新 source 状态能增量投影和清除，且不重算布局几何。
- `tests/e2e/model-thumbnail.test.ts`：隔离库导入 480×480 PNG 与 OBJ；断言 PNG `<img>` 的 `complete`、`naturalWidth`、`naturalHeight`，并断言模型缩略图有真实非零解码尺寸。Electron E2E 使用唯一临时 userData；测试结束清理临时库。可选 `SERPENT_E2E_SHOW_INACTIVE=1` 用于后台呈现真实窗口，默认仍隐藏。

## 验证记录

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过，`tsc --noEmit` 与 extension 类型检查均成功。 |
| `npm run lint` | 退出码 0；7 条 React Hook 依赖 warning，无 lint error。 |
| `npm run test:library-availability` | 9 个文件通过；234 passed、1 skipped。 |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnail-scheduler.test.ts --reporter=verbose`（最终重试竞态） | 1 个文件、1 test passed，9.57s；真实排队任务最终 artifact ready、job succeeded。 |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/thumbnails.test.ts tests/worker/linked-folders.test.ts tests/worker/thumbnail-scheduler.test.ts`（较早实现版本） | 3 个文件通过，121 tests passed。 |
| `npx vitest run --config vitest.config.ts tests/unit/asset-thumbnail-patches.test.ts tests/unit/thumbnail-completion-projection.test.ts tests/unit/virtual-browse-session.test.ts` | 3 个文件通过，20 tests passed。 |
| `node scripts/run-e2e.mjs tests/e2e/model-thumbnail.test.ts --grep "renders and decodes a model thumbnail after import" --workers=1` | 真实 Electron 1 passed；PNG 与模型图片均断言真实解码。另一次后台非激活窗口运行 1 passed / 35.8s。 |
| 较早版本的 `node scripts/generate-large-library.mjs --output tmp/serpent-preview-queue-20k --assets 20000 --seed 20261024 --asset-profile mixed` + `node scripts/run-large-library-performance.mjs tmp/serpent-preview-queue-20k` | 曾通过：20,000/20,000 live、3 tests passed；重协调 2,937.6ms，event-loop P95/max 1.0/81.6ms，viewer resolve P50/P95/max 1.7/3.2/4.8ms。此结果早于最终重试竞态修改，不作为当前最终性能验证。 |
| 最终 20k 刷新：`node scripts/generate-large-library.mjs --output tmp/serpent-preview-queue-20k-final --assets 20000 --seed 20261024 --asset-profile mixed` | 未通过：创建隔离基准库时返回 `LIBRARY_CLEANUP_FAILED` / Windows `EPERM`；库未生成。失败清理留下无法由当前进程读取/删除的测试临时目录；测试运行器已退出，但无法确认是否有其他进程持有访问。不得把较早基准写成最终通过。 |
| `npm run verify:mainline` | 未完成：在 lint 阶段因上述临时目录 `EPERM` 扫描失败而退出；需先清理后重跑。 |
| `git diff --check` | 通过。 |

20k 运行还记录了 all-browse 12.8ms、folder switch 0.5ms、fixed-token search 17.7ms、layout 122.4ms、browse-session open/page/geometry 12.1/13.4/13.5ms；网络 metadata cache 的 7 次 cached browse statement 数均为 0、P95 15.9ms。独立夹具和临时网络缓存已删除，E2E 与网络缓存临时目录计数为 0。

第一次直接用宿主 Node 执行 Worker Vitest 时遇到 better-sqlite3 的宿主/Electron ABI 不匹配；按仓库流程运行 `npm run rebuild:native`，native/FTS5 probe 通过，后续 Worker 测试统一使用 `scripts/run-vitest-with-electron.mjs` 并通过。最终 20k 刷新时，Windows 对失败创建路径中的 `.serpent` 子目录拒绝读取和删除；重试及原生清理命令均返回 `EPERM`。测试运行器已退出，但没有终止当前开发应用或修改目录 ACL，因此该临时残留仍待释放后清理。Computer Use 非激活窗口截图为纯黑，未记为 UI 视觉通过，也未激活窗口抢占用户前台；功能验收由用户确认通过；Computer Use 未形成独立视觉证据。夹具创建在导入资产前失败，未生成基准数据库或媒体。

## 范围与后续

本次修复了已复现的 viewport 交接、有限候选批次被已知 source-direct 小图挡住，以及动态 source 路由未投影到 Renderer 这三处断点。它没有实现设计文档中的统一持久需求协调器、独立 keyset discovery cursor、低频 watchdog、全结束路径的结构化 pump outcome 或多资源类别公平调度；这些是更广的可靠性设计，当前实现不能声称覆盖所有设计矩阵。普通后台波仍依赖启动和队列边界的既有调度入口。

独立 Standards/Spec 审查完成：两项 P1 调度发现已修复，最终审查没有剩余代码发现；清单状态已记录用户于 2026-10-24 确认功能验收通过。20k 最终刷新与 `verify:mainline` 仍因 Windows 临时目录 EPERM 未完成。Computer Use 非激活截图为纯黑；没有抢占用户前台，也没有把它记为 UI 视觉验收通过。packaged、完整退出重启、真实用户资源库和独立人工视觉证据未通过本轮验证；用户确认功能验收后关闭工单。
