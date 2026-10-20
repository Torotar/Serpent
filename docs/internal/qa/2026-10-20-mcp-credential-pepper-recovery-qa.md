# MCP 凭据 pepper 权限恢复 QA

## 范围

验证已有 MCP 客户端凭据 pepper 不可读时的安全恢复、初始化错误分类和设置页诊断。本次测试使用隔离 userData 与临时文件，不触及用户配置。

## 结果

- 单元：`node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/mcp-client-credentials.test.ts tests/unit/mcp-settings-error.test.ts tests/unit/preload-mcp.test.ts` — 3 files / 16 tests passed，覆盖 pepper 目录创建错误诊断。
- Windows Electron E2E：`node scripts/run-e2e.mjs tests/e2e/automation-mcp-launcher.test.ts` — 3 passed。覆盖 MCP HTTP 客户端连接、Windows ACL 故障恢复后保留原 token、无效 pepper 错误分类及原文件字节不变。
- 静态检查：本次修改文件的 ESLint 通过。主项目 TypeScript 检查在排除无关的未跟踪临时基准测试文件后通过；扩展项目 TypeScript 检查通过。直接运行 `npm run typecheck` 被该临时文件中的 TS7017 阻断，未修改该文件。
- 独立审查：6 Luna xhigh 完成复核；首次指出的目录创建诊断与原密钥字节保留断言均已修复并通过重测，没有剩余阻断项。
- [独立审查记录](../reviews/2026-10-20-mcp-credential-pepper-recovery-review.md)
- UI 截图和 Windows packaged 构建：未执行。

## 结论

隔离 Windows Electron 自动化验证通过。该证据覆盖开发态启动与凭据恢复，不代表 packaged 构建或实际用户配置目录的人工验收。独立审查提出的目录创建失败诊断缺口和无效文件保留断言已修复并复测。
