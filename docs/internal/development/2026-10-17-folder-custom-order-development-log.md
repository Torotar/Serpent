# 2026-10-17 侧栏文件夹与合集自定义排序

> 工单：`Serpent-5b7cb8`  
> 状态：实现完成，待人类验收  
> 分支：`dev`

## 需求

侧栏文件夹原本支持按名称 / 创建时间 / 数量排序。新增「自定义」排序并设为默认：在该模式下把文件夹拖到任意一行的上/下边缘，即可把它插入到该行前/后，跨层级时同时移动到目标行所在的父级；插入过程用一条带小三角的强调色插入线提示落点（参考用户提供的两张示意图）。合集沿用同一套交互与视觉。

## 实现

- `FolderTreeSortMode` 增加 `custom`；`sortManagedTreeEntries` 新增可选的 `customOrder` 映射，自定义模式按存储位置升序排列，未排序的文件夹按名称排在已排序项之后，并按父级分组，不影响深层结构。
- 文件夹与合集的默认排序都改为「自定义」；已保存过排序偏好的用户继续使用自己的选择。该模式隐藏升/降序单选（顺序由拖动决定）。
- 自定义顺序按资源库保存在 localStorage（文件夹 `serpent.folder-custom-order.v1.<libraryId>`、合集 `serpent.collection-custom-order.v1.<libraryId>`），与现有排序偏好一样是设备本地设置。
- 拖拽：自定义模式下，指针落在目标行上/下 30% 区域时显示插入线并将 drop 解释为「插入到该行前/后」；中间 50% 保持原有「拖到文件夹/合集上 = 移入该父级」。
- 跨层级：插入的目标父级取自悬停行的父级。若拖拽项来自其他父级，先按该父级移动，再把存储位置写成插入后的完整同级序列，因此可以一次完成「换层 + 定位」。文件夹与合集都复用 `insertBesideSibling`。
- 合法性：跨层级插入同样不允许把文件夹移动到自身或自己的后代；文件夹侧复用 `canMoveFoldersToParent`，合集侧检查目标父级是否位于拖拽项的子树中。
- 插入线：2px 主题强调色横线 + 左端小三角，`before` 贴行上沿、`after` 贴行下沿。`dragend` / 全局 `drop` 会清除残留指示。
- 顺序变化后立即写入偏好并重排，无需刷新。合集换层仍走既有 `onNestCollection` / `onMoveCollectionToRoot`，落位由本地自定义顺序接管。

## 2026-10-17 第二轮修复（用户验收反馈）

- **移动期间的错误位置**：自定义位置原先是一个按行 id 共享的扁平数字表。跨层级插入先把目标父级的新位置写入，但文件夹在文件系统移动完成前仍属于旧父级，旧父级会拿这个新数字重新排序，于是出现「还在加载，行已经跳走」。
  - 位置改为按父级作用域存储：`customOrderKey(parentId, rowId)`。目标父级的位置只会在行真正出现在该父级后生效；旧父级在移动期间保持原顺序。
  - 读取时优先作用域键，找不到再回退到第一版扁平键，已有本机顺序不会丢失。
  - 同父级重排、跨层级插入都通过 `applyFolderSiblingOrder(existing, parentId, sequence)` 写入；文件夹与合集共用。
- **落位后卡顿**：侧栏拖拽落位不再把全局 `uiState` 切到 `loading`。文件夹跨层级移动以非阻塞方式执行，磁盘移动与导航刷新期间界面保持可交互；移动进行中用 in-flight 标记忽略第二次移动，避免并发改树。合集跨层级插入同样以非阻塞方式更新。
- **插入线长度**：插入线从行按钮的起点开始（缩进 + 展开列 16px + 间距 2px），到行右边缘结束，和文件夹/合集的整行宽度对齐；不再从侧栏缩进槽的左端开始。

## 测试

| 命令 | 结果 |
| --- | --- |
| `npx vitest run --config vitest.config.ts tests/unit/folder-custom-order.test.ts tests/unit/unified-directory-nav.test.ts tests/unit/folder-sort-preferences.test.ts tests/unit/folder-drag-drop.test.ts` | 4 files / 61 passed |
| `NODE_OPTIONS=--localstorage-file=<临时文件> npx vitest run --config vitest.config.ts tests/unit/folder-custom-order.test.ts tests/unit/unified-directory-nav.test.ts tests/unit/folder-sort-preferences.test.ts tests/unit/folder-drag-drop.test.ts tests/unit/navigation-sidebar.test.ts` | 5 files / 101 passed（含跨层级文件夹插入、合集同级重排、合集跨层级插入、插入线与嵌套行对齐 4 条组件拖拽用例；纯函数用例覆盖移动期间旧父级顺序不变） |
| `npx eslint src/renderer/folder-custom-order.ts src/renderer/unified-directory-nav.ts src/renderer/folder-sort-preferences.ts src/renderer/NavigationSidebar.tsx src/renderer/folder-drag-drop.ts src/renderer/use-folder-drag-drop-handlers.ts src/renderer/App.tsx tests/unit/folder-custom-order.test.ts tests/unit/folder-sort-preferences.test.ts tests/unit/folder-drag-drop.test.ts tests/unit/navigation-sidebar.test.ts` | 0 error（`App.tsx` 仅有改动前已存在的 2 条 react-hooks warning） |
| `npx tsc --noEmit` | 通过 |

未执行：真实 Electron 拖拽 E2E、Computer Use、packaged。当前 Node 版本需要带 `--localstorage-file` 才能为组件测试提供 `globalThis.localStorage`；按上表命令运行后组件套件全部通过。

## 已知范围

- 只对托管文件夹行与合集行提供拖拽插入；链接文件夹仍不参与拖拽排序，在自定义模式下按名称排在已排序项之后。
- 顺序是本机偏好，不随资源库同步到其他设备。

