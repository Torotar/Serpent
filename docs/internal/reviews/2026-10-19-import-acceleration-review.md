# 导入加速第一阶段独立审查

日期：2026-10-20。范围：基线 `589d41aaa334c9b04c4623741ea7cdf45c4dafb3` 到当前未提交工作树，包含未跟踪文件；当前 HEAD 与基线相同，因此审查依据为 `git diff <基线> --` 加对新增文件的直接阅读。只审 IMP-FAST-001 / 002 / 003；不含阶段 2 / 3。

## Standards

- **[P2] 应用前守卫失败时可能留下导入暂存内容。** `src/worker/library-service.ts:45245` 在创建目标目录后检查最终目的地；若导入会新建子目录，而外部写入者在守卫前把文件放入该目录，守卫会拒绝应用。回滚尝试在 `:45174` 删除新目录，因其中已有外部文件而失败，`rollbackFiles` 因此不删除 `operationPath`；调用方在 `:45664` 只记录 `failed / IMPORT_APPLY_FAILED`。源暂存副本会留在 `.serpent/operations`，直到下一次打开资源库触发恢复，当前错误也没有给出清理提示或入口。这是可触发的失败路径，违反 `AGENTS.md`「临时文件有始有终」中失败时同一生命周期清理的要求。建议在目的地与备份均未被本操作接管时，独立清理操作暂存目录；保留外部文件和其目录，若暂存清理本身失败则明确暴露可恢复状态。
- 其余审查范围未发现文档标准硬违规。目录缓存封装在独立模块且按导入阶段新建；序列发现也抽到独立模块。新增 ESLint 忽略项只指向 Playwright 生成的 `test-results/`，Playwright 输出目录可按环境变量隔离；未发现由此屏蔽源码的情况。抽查新增文档、测试与夹具未发现本机绝对路径或用户名。

## Spec

- **[P2] Eagle / Billfish 遇到数据库未登记的磁盘孤儿时会让整批导入失败。** 规格 IMP-FAST-001 第 4 项要求未登记的 ASCII / Unicode / NFD 孤儿仍识别为名称冲突。`src/worker/library-service.ts:13031` 的 `managedDestinationIndex` 只从数据库构建索引；`lookupImportDestination` 在 `:13065` 对显式索引直接返回 `index.get(...)`，索引 miss 时不查磁盘。Eagle / Billfish 都传入这个索引并固定用 `nameConflict: 'keep-both'`（`:44369`、`:44632`）。因此，若目标名已被一个未登记文件占用，计划仍把原路径当作空闲；应用守卫在 `:45259` 才发现它并抛 `IMPORT_APPLY_FAILED`，而没有生成冲突后的副本名。批处理中只要一个目标命中，就会使该批注册失败。保留托管资产索引及其查询范围，在索引 miss 时用本阶段目录缓存查询磁盘候选，让孤儿进入 keep-both 路径；为 bulk 的 ASCII 与 Unicode/NFD 孤儿增加回归用例。

## 验证限制

本审查没有运行测试、E2E、基准或应用。主 agent 报告最新主线结果为 availability 9 files / 234 passed / 1 skipped、序列 4 files / 50 passed、内容/migration/trash 3 files / 99 passed / 2 skipped；本审查未独立核对输出，也未确认新加的两项定向用例包含在这些运行中。正式 20k 性能运行仍在进行。Windows 行为、packaged、Computer Use 和人工验收在本审查中均未执行。没有对阶段 2 / 3 作结论。

**初审结论：Standards 1 项 P2；Spec 1 项 P2。** 两项问题的当前复核状态见下文。

## 原 P2 修复复核（2026-10-20）

以下复核针对上面的两项发现，只做当前生产代码静态复核；不运行测试，也不扩大到阶段 2 / 3。

- **Standards P2：实现已修复，回归用例在工作树中，尚未由本审查执行。** `src/worker/library-service.ts:45679-45714` 对目标守卫失败且尚无备份或已放置文件的情况单独清理：按逆序尝试移除本次创建的空目录；目录已消失或因外部内容而非空时保留；其他目录清理错误会记录诊断并将结果标为失败。随后无论目录清理是否成功，都会独立尝试删除本次 operation 暂存目录，失败同样留下诊断。这样外部文件及其占用目录得以保留，未接管的暂存不再因目录回滚失败而必然滞留。`tests/worker/import-acceleration.test.ts:392-424` 增加了守卫发现新建子目录内外部文件的回归断言，覆盖外部文件/目录保留、暂存删除和 operation 状态；本审查未执行该测试。
- **Spec P2：实现已修复，回归用例在工作树中，尚未由本审查执行。** `src/worker/library-service.ts:13059-13075` 现在仅在 portable identity 索引命中时直接返回；索引 miss 会回退到 `portableDiskDestination`，并沿用调用方传入的短阶段 `ImportDestinationDirectoryCache`。bulk 调用在 `:43515` 等处对缺失路径段跳过额外 `lstat`，但实际存在的候选仍由磁盘查找识别；托管索引自身的 managed/active 查询范围未改变。`tests/worker/import-acceleration.test.ts:456-490` 覆盖 bulk 的 ASCII 大小写与 Unicode NFD 未登记孤儿；`tests/worker/eagle-import.test.ts:97-120` 覆盖 Eagle 的未登记孤儿。按静态路径，索引 miss 不再把这些磁盘占用误判为空闲，keep-both 可生成冲突副本。

**复核结论：两项原 P2 均由当前实现解决；本次没有新增 P1/P2。** 上述新增回归用例是否已纳入主 agent 报告的完整命令及其结果，仍由主 agent 对照实际测试输出确认。本审查未独立确认门禁、Windows、packaged、Computer Use 或人工验收结果。
