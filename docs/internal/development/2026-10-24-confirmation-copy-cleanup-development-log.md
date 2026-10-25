# 危险操作确认文案清理开发记录

> 工单：`Serpent-4d3b0e`
> 分支：`dev`；基线：`e439ab52`；当前提交：工作树未提交
> 日期：2026-10-24；状态：文案扫描、修改与验证完成，待用户验收

## 扫描范围与结论

检查了 Main 生成的资源库、文件夹、链接文件夹、链接资产、托管资产、回收站永久删除/清空确认文案，以及 MCP 权限设置页面和完全权限确认文案，并搜索了中英文用户界面源代码中的重复确认、记忆决定和绕过权限表述。

- 资源库删除确认额外解释了“必须每次确认、不能记住、不能由 MCP 权限绕过”。这些是内部策略，删掉；保留不可撤销和关联源目录不会被删除的实际影响。
- 文件夹、链接文件夹、链接资产、回收站和托管资产确认只说明删除范围、是否可恢复、是否进入回收站；这些是用户决策所需信息，保留。
- MCP 权限摘要原来使用“Full Access 不能绕过边界”；改成说明可以在此设置每个客户端可直接执行的操作范围。完全权限确认中的精确目标、路径边界、版本检查、幂等和 Worker 检查属于内部实现细节，改成说明设置只影响当前客户端且可以在设置中更改/移除。
- 完全权限确认原文暗示危险操作开启后不再询问，与 Auto/Full Access 的实际说明“危险操作仍需 Agent 二次确认”矛盾。现已修正文案以匹配行为。
- MCP 完全权限确认文案提取为纯数据 builder，新增中英文单测锁定可执行范围和设置入口。尝试从 Electron E2E 直接建立 MCP 客户端并打开确认窗时，设置桥接调用超时；移除此不稳定的 E2E 驱动，改用 builder 单测覆盖。MCP 权限实现本身未修改。
- 内部规格、开发记录和产品决策仍保留策略背景；它们不是显示给用户的弹窗文案。

## 已实现改动

- 两种语言的资源库删除确认移除了重复的确认策略解释，保留资源库删除与链接源目录范围。
- MCP 权限提示改用用户能直接理解的可执行范围说明；完全权限确认移除内部检查列表，并改正危险操作行为描述。
- 关键 Electron E2E 对资源库、链接资产和链接文件夹确认文案做精确断言，防止实现约束重新混入用户提示。
- 人类验收条目 `CONFIRM-COPY-01` 已加入清单。

## 验证

- `node scripts/run-e2e.mjs tests/e2e/critical-confirmation.test.ts tests/e2e/linked-folders.test.ts`：首次合并运行 7 项中 5 项通过，2 项在资源库创建/链接目录展示前因“资源库正在打开或切换”超时；库删除文案断言通过。隔离运行 `--grep "cancelling a folder disk delete|imports a linked folder, reconciles"` 后 2 项通过，其中包含链接资产确认文案精确断言。初次超时未形成稳定复现，按疑似时序问题记录，不计作整组无条件全绿。
- `node scripts/run-e2e.mjs tests/e2e/critical-confirmation.test.ts --grep "uses the in-app dialog"`：1 项通过，验证资源库删除确认弹窗的最终文案。
- 曾尝试从 Electron E2E 通过 MCP 设置接口创建测试客户端并打开完全权限确认窗；桥接调用 120 秒内未返回。移除该不稳定驱动，改由纯文案 builder 单测验证；不将该尝试归因于产品运行时，也不记为通过。
- `npx vitest run tests/unit/mcp-full-access-confirmation-copy.test.ts`：1 个文件、2 项通过。
- `npm run typecheck`：通过。
- `npm run lint`：退出码 0；7 条既有 React Hook 依赖警告，0 errors。
- 全仓界面源码搜索 `cannot be remembered|每次操作都必须确认|不能记住此决定|MCP 权限或.*绕过|cannot be bypassed by MCP|Full Access does not bypass|精确目标、路径边界`：无匹配。
- `git diff --check`：通过。

## 限制

删除确认文案通过 Windows Electron 自动化检查；MCP 完全权限文案由中英文 builder 单测覆盖。仍需真实操作验收观感，macOS 与 packaged app 未验证。无需改权限实现或危险操作确认逻辑。
