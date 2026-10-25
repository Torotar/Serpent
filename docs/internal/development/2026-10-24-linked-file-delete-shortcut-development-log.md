# 链接文件强制删除快捷键开发记录

> 工单：`Serpent-3d5f76`
> 分支：`dev`；基线：`e439ab52`；当前提交：工作树未提交
> 日期：2026-10-24；状态：实现与自动化验证完成，待用户验收

## 已实现行为

- 修复浏览区强制删除键盘目标筛选：已选链接资产与托管资产一样进入既有的删除确认和执行流程；仍保留菜单 skip report 对回收站资产和范围外资产的既有筛选。
- 单资产、多资产和侧栏文件夹的强制删除命令共用同一快捷键定义：Windows 为 `Shift+Delete`，macOS 为 `⌥⌘Delete`。多选菜单现在显示和单选菜单相同的快捷键。
- 未改变链接文件强制删除的确认、源文件永久删除、记录清理及进度反馈语义，也未新增 IPC 或 Worker 协议。

## 根因与实现选择

右键菜单和底层删除 action 已支持链接资产，但 `App.tsx` 为浏览区键盘事件再次筛选 `report.trash.processAssetIds` 时只保留了托管资产，悄悄丢弃链接资产 ID。将这项资格判断提取为纯函数，并允许托管/链接两类资产，避免菜单能力与快捷键能力再次分叉。快捷键和弦则集中定义，单资产、多资产和文件夹命令共用，确保菜单标签与匹配的组合键保持一致。

## 验证

- `npx vitest run tests/unit/asset-commands.test.ts tests/unit/asset-multi-commands.test.ts tests/unit/browse-command-keyboard.test.ts tests/unit/menu-skip-report.test.ts`：4 个文件、133 项通过。
- `npm run typecheck`：通过。
- `npm run lint`：退出码 0；有 7 条 React Hook 依赖警告，涉及 App、预览模态框和浏览会话代码。
- `node scripts/run-e2e.mjs tests/e2e/linked-folders.test.ts`：5 项通过。链接文件测试现在实际按 Windows `Shift+Delete` 或 macOS `Alt+Meta+Delete`，验证出现强制删除确认并删除隔离临时样本源文件；同时验证右键菜单快捷键标签。
- `git diff --check`：通过。

## 后续

人类验收条目 `LINKED-FILE-DELETE-SHORTCUT-01` 已加入清单，等待用户在应用中检查单选与混合多选。macOS 和 packaged 构建未执行。本次改动较小，不启动独立双轴审查 agent；实现者已对照快捷键定义、菜单 action 和键盘目标做自查。
