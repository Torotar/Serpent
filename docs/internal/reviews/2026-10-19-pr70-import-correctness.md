# PR #70 独立审查：普通导入目的地索引

审查基线：`589d41aaa334c9b04c4623741ea7cdf45c4dafb3`
审查提交：`1fa2a49c79509aa95196b9fb78d6f0d105daae16`
范围：`git diff --ignore-space-at-eol`；对应工单 [#69](https://github.com/dolag233/Serpent/issues/69) 的第 1 项——普通导入接入目的地索引，同时保留 Assets 中 DB 未收录文件的同名冲突检测。

独立审查签署：Codex Luna（xhigh）。

## 验证证据

在 Windows 上，用 Electron 内置 Node ABI 执行命令 `$env:ELECTRON_RUN_AS_NODE='1'; & .\node_modules\.bin\electron.cmd .\scripts\repro-pr70-import-conflicts.mjs`。该命令运行[复现脚本](../../../scripts/repro-pr70-import-conflicts.mjs)，脚本从上述两个 Git ref 构建独立的 `LibraryService`，实际调用 Worker `importFolderAsLinked` / `prepareImport`。三组预期结果断言全部通过（3/3）。每个资源库、源文件和 bundle 都在脚本的 `finally` 中清理；未执行 `resolveImport`，所以这次没有应用导入，也没有发生或验证文件覆盖。

| 隔离 fixture | 基线冲突数 | PR 冲突数 |
| --- | ---: | ---: |
| Assets 孤儿文件为 NFD，导入名为 NFC | 1 | 0 |
| Assets 孤儿文件为 `Straße.png`，导入名为 `STRASSE.png` | 1 | 0 |
| 只有链接文件夹中存在 `same-name.png`，导入到托管库 | 0 | 1 |

## Standards

- **[P3，审查噪声]** `src/worker/library-service.ts` 的换行变化把原始 diff 放大到约 101k 行；`git diff --numstat --ignore-space-at-eol origin/dev...origin/pr-70` 显示实际变更为 86 处新增、5 处删除。建议保留文件原有换行格式，方便审查实际逻辑。

## Spec

- **[P1] 孤儿文件 fallback 把 portable identity 的精确路径 miss 当作不存在。** [library-service.ts:4198](https://github.com/dolag233/Serpent/blob/1fa2a49c79509aa95196b9fb78d6f0d105daae16/src/worker/library-service.ts#L4198) 在 `lstat` 报 `ENOENT` 时直接返回，因而跳过本来会按 `portablePathSegmentIdentity` 枚举目录的 `portableDiskDestination`。Windows fixture 证明，NFD 文件名与 NFC 候选、以及 `Straße` 与 `STRASSE` 的 portable identity 相同，但 identity 拼出的精确路径 `lstat` 返回 `ENOENT`；基线仍报冲突，PR 不报。普通导入会因此漏掉工单明确要求保留的孤儿冲突。应让 miss 路径识别 portable-equivalent 的实际名称，同时保留大批量导入的性能目标，并为这两种 orphan 情况增加 Worker 回归覆盖。
- **[P1] 新的普通导入索引把链接资产当成 Assets 目的地。** [library-service.ts:13069](https://github.com/dolag233/Serpent/blob/1fa2a49c79509aa95196b9fb78d6f0d105daae16/src/worker/library-service.ts#L13069) 将普通托管导入接到 `managedDestinationIndex`。该索引的查询只排除已删除行，没有 `location_kind = 'managed'` 条件；当前 schema 允许链接资产与托管资产共享 `path_identity`，且链接资产的唯一性按链接根分别约束。Worker fixture 中，只有链接根包含导入同名文件时，基线冲突数为 0，PR 变为 1。这样会为托管 `Assets/` 中并不存在的目标触发名称冲突；若用户选择跳过，导入可能被错误跳过。此 fixture 只确认冲突计划，未验证决策后的行为。索引应只收录托管资产，并增加链接根与托管目标同名的用例。

## 结论

**建议暂缓合并，修复并回归验证以上两项 P1。** 本审查没有判定全量 DB index 的小批量成本；该路径每次普通导入都会构建一次，需结合独立 A/B 性能数据评估。
