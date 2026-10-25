# 2026-10-24 下拉菜单统一

打开的下拉列表之前走系统 `<select>`。系统弹层不吃主题，深色下会分别呈现白底、灰底或米色，当前项用系统蓝，关闭控件还可能带系统橙色焦点圈。

标准控件是 `src/renderer/ui/primitives/Select.tsx`：关闭时是按钮，展开时是 `ui-menu-surface`。背景、文字、悬停和当前项分别用 `--ui-surface-overlay`、`--ui-content-primary`、`--ui-action-hover`、`--ui-action-selected`。工具栏上的显示模式、色彩空间和 EXR 通道用 `appearance="inline"`，关闭后的尺寸和边框仍跟旁边的工具栏按钮对齐。设置和对话框用字段样式。

插件小组件的下拉改为调用同一个控件。字体语言、字重、视频倍速和模型环境列表本来就是这套菜单，没有再做一套。

`tests/unit/standard-select.test.ts` 确认展开层是这套菜单，页面里没有 `<select>`。关闭态文字左对齐，单行放不下时在框内省略，不再折到描边外面。和输入框放在一起的下拉沿用 `.text-field` 的边框、圆角和高度。依赖 `selectOption` 或 `option:checked` 的 Electron 测试改成先点按钮，再点 `role="option"`。完整 Electron 套件未跑。真实画面、packaged 与 macOS 未执行。验收项 `DROPDOWN-UI-01` 于 2026-10-25 由用户确认通过。packaged 与 macOS 未执行。
