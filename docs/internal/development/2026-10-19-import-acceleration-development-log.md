# 导入加速第一阶段开发记录

日期：2026-10-19 开始，2026-10-20 续测。工单 `Serpent-8h9qg.1`。状态：验证中。

方案：[实施与验收](../implementation/2026-10-19-import-acceleration-plan.md)。基线 `589d41aaa334c9b04c4623741ea7cdf45c4dafb3`，dev。本轮开始 `git pull --ff-only` 返回 Already up to date；既有调查报告、实验脚本及工单改动保留。

主 agent 设计/集成，Luna xhigh 开发；名称与内容链路仅一个写者，序列独立模块及单测由另一 agent 开发，再串行交接 Worker 接线。测试不并发争抢 Electron 或磁盘基准。

## 当前证据

本轮实现进行中，目前仅下列定向测试有通过证据，尚无整体验收结论。既有 PR70 与纯算法实验只作为设计依据，不证明本轮工作树通过。实现、命令结果、独立审查、性能数据及平台限制随执行更新。

## 实施与阶段证据

- 名称与内容链路：新增阶段局部目录缓存，v59 additive 内容索引以及范围正确的 managed / current revision 查询已进入工作树，尚待 Worker 回归。历史 SQL 未修改；v59 占用已同步项目状态。
- 序列共享 / Renderer：连续段追加和 first-match 帧索引已落盘，Worker 接线与真实应用旅程仍在实施。
- Native 环境预检：`node scripts/ensure-native.mjs` 成功，Electron ABI 匹配且 FTS5 可用。
- 首轮定向单测：`node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/image-sequence.test.ts tests/unit/post-import-image-sequences.test.ts`，2 文件 / 22 项通过，815 ms。测试使用本轮隔离临时目录和 `VITEST_MAX_WORKERS=2`；该结果不覆盖 Worker、迁移、实际导入或 E2E。
- 首轮 Worker 验证：`node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/import-destination-directory-cache.test.ts tests/worker/import-acceleration.test.ts tests/worker/migration-checksum-snapshot.test.ts`，3 文件 / 10 项通过，7.38 s。覆盖 v58 升级、历史 checksum、内容索引计划、current revision / NULL 回退、链接隔离、回收站同名重导入、NFD 孤儿、确认后外部变更及 bulk 应用前占用。首次误用不存在的配置文件导致启动失败，改用仓库实际的统一配置后才取得上述测试结果。
- `npm run typecheck` 通过。首次 `npm run lint` 失败：测试输出目录中既有打包 JavaScript 被当作源码检查，报告 19,993 条错误和 7 条警告；不删除归属不明的旧产物，补充生成目录排除后再验证。该记录不等于 lint 已通过。
- 正式混合媒体夹具：`node scripts/generate-large-library.mjs --output 本轮隔离测试目录内的large-library子目录 --assets 20000 --seed 20260816`，1 项通过，80.01 s；调用前检查工作区磁盘空闲超过 30 GiB。该命令说明中的目录描述需在实际运行时解析为本轮自有路径，不是可直接复制执行的字面参数。夹具不是用户库，完成测试后清理；生成通过不等于性能回归通过。
- 首次完整 `npm run test:library-availability`：9 文件中 6 通过 / 3 失败，228 项通过 / 6 失败 / 1 跳过，58.48 s。失败均为 v59 指纹索引已存在：部分历史测试从最新结构手工回退迁移记录，未同步回退新增索引。正在修正 fixture 的结构回退；不把迁移改成 `IF NOT EXISTS` 来掩盖夹具不一致，修正后须完整重跑。
- 性能 harness 首次 smoke 在 Windows 还原快照目录时报访问错误；最小复现未能确认具体 Win32 原因，不能断言是隐藏属性或句柄。改为保留本轮夹具的内部根目录、清空全部子项并逐文件恢复，随后比对全部路径、类型及文件 SHA-256 与快照完全一致；仍完整重置数据库、artifacts、operations 及迁移备份。Luna 的修正后 smoke 退出 0，1k+1 成功导入；这只是 harness 自检，不作为正式提速结论。

## 续测与审查修复（2026-10-20）

- 普通与迁移导入回归：`node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/import-planning.test.ts tests/worker/import-no-conflict.test.ts tests/worker/large-batch-import-reliability.test.ts tests/worker/pending-import-lifecycle.test.ts tests/worker/eagle-import.test.ts tests/worker/billfish-import.test.ts`，6 文件 / 80 项通过 / 1 跳过，370.21 s。批量可靠性按默认 50,000 文件执行；该运行在前一日启动并正常完成，不是被中断的测试。
- 增加 NULL current revision 的身份保留回归；内容查重要求当前版本，但 resolve 的资产身份绑定仅要求 managed / active，不能把合法空 current 行过滤后再插入相同 identity。`import-acceleration`、checksum snapshot 与 `trash-relink` 3 文件 / 99 项通过 / 2 跳过，24.04 s。
- `npm run test:library-availability` 修正 fixture 后完整重跑：9 文件 / 234 项通过 / 1 跳过，53.41 s。
- shared / Renderer / Worker 序列与目录缓存整合：4 文件 / 50 项通过，9.31 s。首跑两项失败是 `vi.spyOn` 无法改写 Node 内置 ESM namespace；改为 mock 包装真实 `readdirSync` 并保留精确目录计数断言后，才取得上述通过结果。
- 正式混合媒体性能：`node scripts/run-large-library-performance.mjs 本轮large-library夹具目录`，3 项通过，14.74 s。20,000 live assets；Worker folder switch 0.5 ms、固定 token search 18.1 ms、完整 reconciliation 2,827.9 ms；对账期间事件循环 lag P95 1.0 ms / max 76.8 ms，viewer resolve P95 2.1 ms。网络元数据缓存路径的 hot browse 零主数据库浏览查询断言通过。均为 Worker / 本地模拟证据，不是 GUI 或真实网络共享时延。
- 独立[双轴审查](../reviews/2026-10-19-import-acceleration-review.md)提出两项 P2：bulk 索引 miss 遗漏磁盘孤儿；守卫在新目录发现外部占用后，rollback 的非空目录错误阻止暂存清理。已修为索引 miss 使用阶段目录缓存、未接管目标的守卫失败单独清理 owned staging，并保留外部文件及其非空目录；实际清理错误记录 failed / diagnostic。原 reviewer 静态复核成立，未独立运行测试。
- 新增审查回归的首跑 26 项通过 / 2 项失败：失败断言错误地要求 bulk completion 返回资产摘要，但既有 bulk 契约刻意不返回。已改为验证 importedCount、查询返回的注册路径、DB managed 记录和源/副本/外部字节；修正后的整组结果仍待主线记录，不能把首跑视为通过。
- Playwright 新增可配置输出目录与显式 fail-fast 环境开关，默认行为不变。验证时隔离到本轮自有目录，并启用首错停止；若触发，必须标明后续用例未执行。
- 审查修复后的最终定向组：`import-acceleration`、`eagle-import`、`billfish-import` 3 文件 / 29 项通过，10.32 s。包含 regular / bulk 链接身份隔离、ASCII / NFD bulk 孤儿、真实 Eagle 入口及新目录守卫清理；不使用 bulk 不承诺返回的 completion.assets 作为断言。
- 最终源码 A/B：`node scripts/bench-import-acceleration.mjs --filesystem NTFS --storage-class "local NVMe volume"` 正常退出，400 文件 5 对、单文件 3 对，所有导入数量正确。总耗时中位数分别 16,963.664 → 5,338.122 ms、380.217 → 190.339 ms。原始样本、预热与成对统计见[QA](../qa/2026-10-19-import-acceleration.md)和[JSON](../qa/2026-10-19-import-acceleration-performance.json)。之后独立重新计算当前 951 个 src 文件摘要，与测量快照的 `fa1786d83b12c51805f40f5863c4e1b60108882ba9682cda0f1846c44ec1253a` 一致，生产代码没有在测量后改变。
- 最终 `verify:mainline` 首次在 lint 停止：序列测试使用动态 `import()` 类型引用违反仓库规则，1 错误 / 7 警告。已改静态 type-only namespace import，定向 ESLint 通过；完整门禁仍须重跑，不能用定向 lint 代替。
- 真实 Electron 3 文件首次执行：3 项通过 / 1 Windows 权限用例跳过 / 1 新增重启用例失败 / 2 未执行；启用 fail-fast 后停止。新增用例导入和首次实际解码通过，重启后欢迎页没有库。根因为 fixture 第一次启动未设置同时控制 E2E recent-store 持久化的 `SERPENT_E2E_RESTORE_RECENT`（见 `src/main/recent-libraries.ts:56`、`:68`），记录未写入，不是通过重跑掩盖竞态。已使首次和恢复启动均显式开启，保留完整退出、ID / 路径对账和两次解码，重测结果待记录。
- 隐私模式审计扫描了 tracked 文本及本次新增/修改行；新增范围未命中盘符绝对路径、家目录、UNC 或凭据模式。全仓仍有 71 个文件命中绝对路径类别、1 个命中 UNC 类别，其中存在历史 fixture；本轮未逐条完成既有白名单审查，`Serpent-b78285` 仍 open，不能据此宣称全仓零残留。未写入任何命中原文或私密词表；未重写历史。

## Windows 门禁收尾

新增重启 E2E 在修正 recent-store 开关后通过（1 项，30.9 s）；主 agent 已实际查看后台 Electron 截图，库身份、两张红 / 蓝图片、副本名和计数正常。序列预览与名称 / 内容冲突 E2E 再执行 2 项通过，26.9 s，包含帧实际解码、FPS / 范围变化及成组。原生桌面 Computer Use 未执行，不能据此签人工验收。

最终主线又发现测试类型 `AssetSnapshot` 漏声明真实返回的 `relativeFilePath`；补齐静态类型后，lint / typecheck / extension verify 通过。随后 availability 本次 232 通过 / 2 失败 / 1 跳过：一项在创建库发布 partial 目录时 `rename` 报 EPERM，另一项历史 schema fixture afterEach 删除报 ENOTEMPTY。此前 234 项通过不覆盖这次失败，不能把再跑通过当作根因关闭。

以 `Serpent-hms58` 跟踪收尾：建库的两个 SQLite 连接均显式关闭后再发布，但裸 rename 对短暂共享锁无容错；发布 / 失败回退 rename 和 partial 删除改为复用既有有界 helper，永久错误和清理失败仍显式传播。新增 `tests/worker/library-create-rename-retry.test.ts` 对单次 / 持续 EPERM 注入，验证确实重试、partial 清理、关库重开后写读及错误映射，Luna 定向 2 项通过。历史 schema fixture 另统一 service 关闭及有界清理。原现场持有进程未捕获，不能归因 Defender；真实共享锁故障模型诊断另记录结果。

该收尾只改变 `createLibrary` 三处调用，不改变导入 prepare / resolve 计时链路。对整个 src 树的差异摘要验证见 QA；保留已完成的 A/B，不为非计时路径的小修继续扩展性能实验。

最终 `npm run verify:mainline`：lint（0 errors / 7 warnings）、typecheck、extension verify 均通过；`npm run test:library-availability` 9 文件 / 234 项通过 / 1 跳过，52.13 s。全仓 `npm test` 输出 `network-metadata-cache.test.ts` 两项失败及 `library-watcher.test.ts` 一项失败后，进程超过 5 分钟没有新日志且 Vitest / Electron worker 基本空闲；主 agent 中断了本轮运行。Vitest 未输出完整失败堆栈和总计，因此根因未知，不能判为与本变更无关，也不能记全仓测试通过；verify 后续的 search performance、完整 E2E 与快捷键门禁未执行。上述三项为本轮可见的部分输出：`creates a local snapshot, hits it on the next open, and keeps writes remote`、`keeps the last verified snapshot when source validation is temporarily unavailable`、`keeps the same asset when a linked source is moved inside its root`。本轮自有隔离测试目录仍留在工作区：确认测试进程已退出、目录位于 test-results 且不含 reparse point 后，递归清理被执行环境拒绝；未尝试绕过该拒绝。原生桌面 Computer Use 未执行，人工验收仍未完成。
