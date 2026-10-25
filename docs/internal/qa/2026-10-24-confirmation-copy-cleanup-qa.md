# 危险操作确认文案清理 QA

- 日期：2026-10-24
- 分支与代码基线：`dev` / `e439ab52`，测试当前工作树
- 环境：Windows Electron；隔离临时 userData 与临时资源库
- 结果：界面源码扫描、typecheck、lint 和文案断言通过；一次合并 Electron E2E 出现两个资源库/链接目录加载超时，单独重跑对应场景通过。时序问题未形成稳定复现，按疑似 flaky 记录，不能宣称整组 E2E 无条件全绿。

## 扫描追溯

| 用户界面 | 实现位置 | 检查方式 | 本次结论 |
| --- | --- | --- | --- |
| 删除资源库确认 | `src/main/index.ts` 的 `confirmCriticalLibraryDeletion` | Electron E2E 精确检查 `.dialog-body-copy` | 保留不可撤销及关联文件夹源目录不会删除；删除确认策略说明 |
| 删除文件夹、链接文件夹、链接资产、托管资产、永久删除资产、清空回收站 | `src/main/index.ts` 的 `criticalRendererCopy` | 全路径源码扫描；链接文件夹 Electron E2E 精确检查链接源文案 | 当前均只说明删除范围、可恢复性及文件去向，无“不能记住/不能绕过”临时约束文案 |
| MCP 权限摘要 | `src/renderer/i18n/catalogs/zh-CN.ts`、`src/renderer/i18n/catalogs/en.ts` | 中英文目录扫描与修改 | 改成用户可执行的权限范围说明 |
| MCP 完全权限确认 | `src/main/mcp-full-access-confirmation-copy.ts`；`src/main/index.ts` 的 `confirmEnableAllMcpPermissions` | `tests/unit/mcp-full-access-confirmation-copy.test.ts` | 去除内部实现列表；对齐危险操作仍需 Agent 二次确认的实际行为 |

## 自动化结果

- `node scripts/run-e2e.mjs tests/e2e/critical-confirmation.test.ts tests/e2e/linked-folders.test.ts`：7 tests 中 5 passed、2 failed。资源库确认文案断言通过；两项失败都在创建托管文件夹/显示链接目录阶段，尚未进入确认弹窗。
- `node scripts/run-e2e.mjs tests/e2e/critical-confirmation.test.ts tests/e2e/linked-folders.test.ts --grep "cancelling a folder disk delete|imports a linked folder, reconciles"`：2 passed。失败场景隔离后通过；这不构成关闭 flaky 的证据，尚未定位稳定时序耦合。
- `node scripts/run-e2e.mjs tests/e2e/critical-confirmation.test.ts --grep "uses the in-app dialog"`：1 passed，复核资源库删除确认弹窗文案。
- 曾尝试从 Electron E2E 通过 MCP 设置接口创建测试客户端并打开完全权限确认窗；桥接调用 120 秒内未返回。移除该不稳定驱动，改由纯文案 builder 单测验证；不将该尝试归因于产品运行时，也不记为通过。
- `npx vitest run tests/unit/mcp-full-access-confirmation-copy.test.ts`：1 file、2 passed。
- `npm run typecheck`：通过。
- `npm run lint`：exit 0，0 errors、7 React Hook dependency warnings。
- 界面源码扫描上述临时政策文案：无匹配。
- `git diff --check`：通过。

## 未执行项

- 真实 Computer Use、macOS、packaged app 与中英文实际界面逐项检查尚未执行；`CONFIRM-COPY-01` 保持待人类验收。
