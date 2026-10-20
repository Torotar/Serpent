# MCP 凭据 pepper 权限恢复独立审查

- 审查模型：6 Luna xhigh
- 审查范围：Windows ACL 恢复、pepper 保留、Main IPC 错误分类、Zod/Preload/Renderer 诊断、测试、隐私与 UI 文案规范

## Standards

未发现独立于规格缺陷之外的规范问题。审查未发现硬编码本机路径或凭据；恢复逻辑使用当前 Windows 用户 SID，并保留已有 pepper 内容。

## Spec

初审发现两项 P2，均已修复并由实现者复测：

1. pepper 所在目录创建失败原先未包装，设置页会收到通用 MCP 不可用错误。现返回 `MCP_CREDENTIAL_CREATE_FAILED`，包含密钥文件位置和系统错误码；单元测试覆盖 `EACCES`。
2. 无效长度 pepper 虽然不会被重建，但缺少对磁盘字节不变的直接断言。隔离 Electron E2E 现在在初始化失败后比较原文件字节。

## 复核结论

复核确认上述修改已完成；没有剩余阻断项。验证命令与范围见 [QA 报告](../qa/2026-10-20-mcp-credential-pepper-recovery-qa.md)。
