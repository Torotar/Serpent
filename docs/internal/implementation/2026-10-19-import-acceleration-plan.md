# 导入算法加速实施方案

日期：2026-10-19 设计与编码，2026-10-20 继续验证。总工单 `Serpent-8h9qg`，第一阶段 `Serpent-8h9qg.1`。

基线 `589d41aaa334c9b04c4623741ea7cdf45c4dafb3`（dev）。用户已授权先写方案并开发；本轮明确交付名称查找、内容查重、序列算法三项，复制哈希融合与事务子批另列阶段。实际开发沿用 Luna xhigh，主 agent 集成验收，一个独立 Luna xhigh 审查 Standards / Spec。工具没有 fast 服务档位参数。

依据：[当前算法考察](../research/2026-10-19-import-algorithm-optimization.md)、[PR70 对照评估](../reviews/2026-10-19-pr70-import-performance.md)。PR70 未合并，其 Map + normalized-path lstat 门控不作为实施基线。

## 边界与复用

普通导入继续复制并保留源文件，stage 到 Assets 继续内部 rename；不改变哈希算法、冲突策略、序列重复帧例外、取消、持久性或既有崩溃恢复语义。Renderer 不获得路径/SQL能力，文件与数据库操作仍归 Worker。源名称的比较继续使用已有 portable identity；实际磁盘访问使用真实名称。

复用 `prepareCached`、`portableDiskDestination` 的验证逻辑、既有分块查询、`detectImageSequences`、序列映射先例和现有测试。新目录缓存及索引工具放独立模块；不继续将大段新逻辑堆进 `library-service.ts` / `App.tsx`。不新建全库常驻目的地 Map，不增加重复的文件名字段。

## 第一阶段

### IMP-FAST-001：名称索引及短阶段目录缓存

1. 托管资产身份查询统一为 portable `path_identity` 等值匹配，并带 `location_kind = 'managed'` 与相应 active 条件；预编译复用。修正导入 action 绑定资产、重复合并及现有名称冲突摘要查询的范围，避免链接根同名资产参与托管目标匹配。
2. 将目录枚举结果按实际目录缓存为 identity 到真实 Dirent 的映射；同一短阶段同一目录仅枚举一次。沿用原查找的路径规范化、真实大小写恢复、名称歧义、符号链接/目录检查及 `destinationLstat` 的 ENAMETOOLONG 错误语义。
3. 缓存仅限导入阶段局部对象。初始 manifest、stage 完成后的分类、用户确认后的 resolve 分别使用新快照；不能在弹窗等待期间沿用旧快照。适当在应用前重新校验受影响的目标目录，发现新占用时不得覆盖未授权目标。
4. 数据库未登记的 ASCII / Unicode / NFD 孤儿文件仍必须识别冲突；数据库记录存在但实际文件缺失时保持原普通导入行为。显式 bulk 目的地索引保留其原路径，查询范围须限定托管资产。

优先以独立目录缓存模块给原磁盘查找提供候选映射，保留现有错误处理；不继承 Map 再修改 `get` 语义。大批量候选预取仅在必要时使用本次目标集合，不扫全库建 Map。

### IMP-FAST-002：当前版本内容查重

1. 先验证查询计划，再新增 additive 索引迁移；本地基线最新 migration 为 v58，第一阶段预留 v59，编码前再次检查尾部。历史迁移 SQL / checksum 不变。
2. 候选索引按 `byte_size, content_fingerprint`（可加必要覆盖列）定位 revisions。关联资产时利用 `a.asset_id = r.asset_id`，并核对 `a.current_revision_id = r.revision_id`，保留 active / managed 范围；历史修订不应命中。
3. fingerprint 已知路径和 NULL 旧数据回退均保留；不能因缺失哈希跳过内容判断。复用本批已计算的内容哈希，避免同一旧文件在同批反复读取。
4. 若持久化渐进回填会引入缺少快照校验的写入，本阶段仅保留安全的按需计算和任务缓存，将持久化回填独立列出，不写入可能过期的旧版本指纹。
5. 准备与应用之间可能有外部变更，不无条件复用旧分类。只有存在可证明的版本/变更校验才复用；否则保留应用前重新分类，但查询必须命中新增索引。

### IMP-FAST-003：序列按目录复用

1. 连续帧构建从复制整个 run 数组改为就地追加；每次发出连续段后换新数组，避免改写已返回候选。
2. 增加或复用一个候选帧反向映射工具，保持 first-match、重复路径、断号、padding、括号、父目录隔离和候选顺序。
3. Worker 的展开及探测路径按父目录列举一次、识别一次；尺寸验证保留，重复选中同一序列不重复遍历验证其全部帧。
4. Renderer 后置序列提示的逐帧 `.find` 改成 first-match Map，保留原结果。
5. 普通导入中用于避免误判重复帧的检测不能因关闭序列分组而移除；入口偏好、确认流程及 UI 文案保持现状。

## 后续阶段

- `Serpent-8h9qg.2`：复制与双哈希融合、按任务复用有界缓冲区。先证明源快照、短写、刷新失败、stage 校验、取消及大文件一致性；分别测大量小文件和大媒体，不仅测微型 PNG。
- `Serpent-8h9qg.3`：有界子批事务、事务外元数据准备、COMMIT 后合并事件。必须重新设计 durable 子批状态，不能直接将 bulk 外层事务套在会提前记录 affected IDs / 发通知的普通循环上。保持 FULL，测进程中断后重启、部分成功、取消、首屏与总耗时。

## 验收与证据

| 需求 | 实现位置 | 自动化测试 | 平台 / 人工证据 |
| --- | --- | --- | --- |
| IMP-FAST-001 | `src/worker/import-destination-directory-cache.ts:12`；`library-service.ts:13059`、`:42944`、`:45262`、`:45679`；resolve 身份绑定只限定 managed / active，不排除 NULL current 行 | `tests/worker/import-destination-directory-cache.test.ts:11`；`import-acceleration.test.ts:236`、`:401`、`:465`、`:547`；`tests/worker/eagle-import.test.ts:97`；`tests/e2e/import-conflict-flows.test.ts:26` | Windows Worker 与真实 Electron 冲突旅程通过；独立主 agent 查看重启截图；人工未验收，macOS / packaged 未执行 |
| IMP-FAST-002 | `library-service.ts:3040`、`:3813`、`:42854` | `tests/worker/import-acceleration.test.ts:75`、`:135`；checksum snapshot；完整资源库可用性 9 文件 / 234 项通过 / 1 跳过；`tests/e2e/asset-ingestion.test.ts:623` 完整进程退出 / 重启、路径对账及解码通过 | Windows Worker 与隔离 Electron 进程证据；人工未验收，macOS / packaged 未执行 |
| IMP-FAST-003 | `src/shared/image-sequence.ts:285`；`src/worker/image-sequence-import-discovery.ts:14`；`library-service.ts:13199`、`:13239`；`src/renderer/post-import-image-sequences.ts:61` | `tests/worker/image-sequence.test.ts:296`、`:327`；shared / renderer 与 Worker 4 文件共 50 项通过；`tests/e2e/image-sequence-import-preview.test.ts:29` 真实帧解码、范围 / FPS 及成组通过 | Windows Worker 与真实 Electron 序列旅程通过；人工未验收，macOS / packaged 未执行 |

测试由主 agent 串行协调。功能定向测试之后完整运行 `npm run test:library-availability`；执行真实 Electron 导入/冲突/序列/重启旅程，隔离 userData 并设 `SERPENT_E2E_HIDE_WINDOW=1` 后台运行。测试截图只用自有 fixture，检查真实图片 `naturalWidth > 0`。需要前台观察时另行询问；没有真实桌面能力时记录 Computer Use 未执行，不冒充人工验收。

A/B 使用固定基线与本轮工作树构建，交替运行、各自预热、相同 fixtures，至少覆盖 20k+400 与 20k+1；记录 prepare / apply / total、枚举与索引计划、成功数量。单独运行正式 20k 混合媒体性能基线，不将小文件合成库当作官方基线。原始样本与命令进入开发日志。测试完成后清理本轮临时库、构建副本和自有媒体。

最后由独立 agent 审查；主 agent 对最终共享工作树运行 `npm run verify:mainline`，失败必须记录实际门禁与范围，不能用局部通过冒充全绿。用户可操作项仅在实现、相应自动化及该范围阻断均收口后进入人类验收清单；独立审查及测试不替代用户确认。没有授权不提交、合并或推送。
