# MCP 凭据密钥权限恢复开发日志

## 状态

- 分支：`dev`
- 基线：`1bc246b2`
- 开始：2026-10-20 23:08 Asia/Shanghai
- 当前状态：实现、定向验证与独立审查复核完成
- 关联：GitHub #62；工单 `Serpent-d044de`

## 问题与验收范围

已有 `mcp-client-credential-pepper` 无法读取时，当前实现把任何读取错误都当作文件不存在，随后再次读取并以 MCP 初始化失败结束。设置 IPC 将服务未创建误记为 `unauthorized_sender`，Renderer 只看到通用不可用提示。

本次修复要求：

1. 只在文件确实不存在时创建新 pepper；拒绝覆盖或重建已有但无效/不可读的密钥文件。
2. Windows 访问拒绝时，通过当前用户 SID 为原文件补回访问权限并重读原内容；失败时明确报出访问错误、系统错误码和文件位置，保留原文件。
3. MCP 设置 IPC 分开报告未授权调用与服务初始化失败；设置页呈现具体诊断。
4. 覆盖不存在、权限拒绝/ACL 恢复、无效内容、服务不可用及 Renderer 错误文案的回归测试。

## 实施决定

- 使用 `whoami /user` 读取当前账户 SID，并将 SID 以 `*SID` 形式传给 `icacls`，避免依赖账户名解析。
- 自动恢复仅对已有文件的 `EACCES`/`EPERM` 触发，并只补当前用户 ACE；不删除、不重建或覆盖已有密钥内容。
- 失败信息使用稳定错误码和受限诊断字段通过现有 Zod IPC 契约传递；设置页提供中英文说明。
- 错误日志继续记录原始异常与恢复失败 cause。设置页显示 issue 要求的凭据文件位置。

## 实现与验证记录

- `src/main/mcp-client-credentials.ts` 现在只把 `ENOENT` 当作缺失；Windows 遇到 `EACCES`/`EPERM` 时，按当前账户 SID 为原文件补回访问权限并读取原字节。恢复失败会保留原文件并携带访问错误与 ACL 错误码。新建 pepper 仍在权限设置失败时清理未完成文件。
- Main IPC 只在 sender 未授权时返回 `unauthorized_sender`；MCP 初始化失败会返回稳定凭据错误码和受限诊断字段。设置页中英文分别解释原因、保留策略、错误码和文件位置。
- 单元命令 `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/mcp-client-credentials.test.ts tests/unit/mcp-settings-error.test.ts tests/unit/preload-mcp.test.ts`：3 files / 16 tests passed，包含 pepper 目录创建失败的诊断。
- Electron E2E 命令 `node scripts/run-e2e.mjs tests/e2e/automation-mcp-launcher.test.ts`：3 passed。Windows ACL 用例移除当前用户对隔离 pepper 的显式访问后启动应用；恢复后凭据 token 与原值相同。无效 pepper 用例确认返回 `MCP_CREDENTIAL_INVALID`、文件字节保持不变，而非 `unauthorized_sender`。每个用例使用临时 userData 并在 finally 中清理。
- 定向 ESLint 覆盖本次变更的 Main、shared、Renderer、语言包和测试文件：通过。主项目 TypeScript 检查在排除无关的未跟踪临时基准测试文件后通过；`tsconfig.extension.json` 检查通过。直接 `npm run typecheck` 会被该临时文件的 TS7017 阻断，本次没有修改该文件。
- 首次 E2E 暴露原测试仍把剪贴板连接说明按 JSON 解析；断言已按当前连接文本格式更新，随后完整文件复跑 3/3 通过。
- 独立审查（6 Luna xhigh）确认目录创建错误诊断和无效密钥保留断言已补齐；复核后无剩余阻断项。

## 待人类/平台验收

- 本机 Windows 隔离 Electron E2E 已验证 ACL 恢复和 token 保留；Windows packaged 构建尚未执行。
- 设置页文案由中英文 formatter 单测覆盖；真实 UI 截图检查未执行。
