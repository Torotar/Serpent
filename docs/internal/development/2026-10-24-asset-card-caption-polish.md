# 资产卡片信息间距与圆角调整

## 顶部细线回归补充

用户澄清为图片与选中轮廓之间的细线，且同一行部分卡片有、部分没有。平铺整数宽度分配会让方图进入相差 1px 的矩形；`object-fit: contain` 产生半像素上下留白，随取整宽度和图片边缘颜色呈现不同强度。先前对选中 outline 的怀疑经逐像素对照未得到支持，候选改动已撤回。

复用既有平铺 slot 几何与源图比例，仅在横纵误差都不超过 1px 时发布 `--justified-thumbnail-fit: fill`。图片保留全部源像素，允许这一级取整造成的微小比例变化；真正的比例差异和未知比例仍用 contain。选中轮廓、卡片尺寸与 caption 不变。

- `node scripts/run-vitest-with-electron.mjs run tests/unit/virtual-browse-canvas.test.ts`：11 项通过，覆盖窄/等宽/宽 1px 的方图及真实比例差异。
- 隐藏 Electron 使用完整项目 CSS、隔离 userData、193×194 框与带顶部标记的方形 fixture，比较 contain/fill 的首行像素。顶部标记红色通道从 242 恢复为 255，computed object-fit 分别为 contain/fill，断言通过。探针和隔离数据在运行后清理。
- 实际用户窗口仍待复验；packaged、macOS 未执行。

## 用户反馈与原因

卡片信息区的上下留白偏大，尤其底部。关闭全部信息字段后，当前 islands 布局仍把预览层的底角设为直角，导致只有图片的卡片底部发方。

## 本次调整

- 在既有 `.asset-caption` 样式上使用上下各 6px 的内边距，并同步平铺、瀑布流的 caption 高度计算，避免文字贴底。
- 用户否定第一版的整体观感：仅调间距仍把单独的文件大小装在明显的底栏里。重新设计为图片配轻量说明：预览始终保持完整圆角，caption 使用透明背景，取消整个卡片的面板和边框感。
- 选中与键盘焦点边框移到图片内部，阴影跟随图片；自定义卡片表面色应用到图片舞台。隐藏信息不会再改变图片的底角。
- 复用现有卡片圆角变量和字体缩放变量，没有新增组件或硬编码颜色。

## 后续用户回归与根因

用户继续报告单行贴底、无信息底角发方、图片边缘轻微裁切，以及三行信息被截断。前一版只关注 islands 覆盖，没有检查通用样式的最终计算结果，判断不足。

隐藏 Electron 复现确认：后置的通用卡片规则恢复了 1px 边框，预览层超出预留高度；后置 caption 规则恢复 10px/12px 内边距和不匹配的行高；另一个后置规则强制预览底角为零。上述规则对旧版布局仍生效，而几何计算已使用缩小后的高度。已直接修正这些历史规则，同步字号缩放，取消额外边框占位与 caption 分隔线。平铺图片使用 contain，避免比例取整时 cover 裁去源图边缘。islands 的公共选择轮廓只留给文件夹，资产使用图片自身的轮廓。

`npx electron tmp/card-style-probe.cjs`：本次临时隔离样式探针检查 24 种组合通过（两种壳布局 × 两种排列 × 默认/大字号 × 0/1/3 行）。检查预览未越过卡片边界、底角半径非零、文字未越界、最后一行下方至少保留缩放后的 6px。窗口隐藏运行，未访问真实资源库；探针运行后删除。此证据是实际 Electron 样式和几何检查，不代表真实应用截图视觉验收通过。

## 验证与限制

### 选中高亮回归

用户在提交后报告选中高亮丢失。此前将整卡选择轮廓移动到图片内部，同时清空整卡背景，削弱了选中反馈。已恢复整卡 2px accent 外轮廓和选中背景，并覆盖 hover、键盘焦点组合。轮廓不占布局空间，保留 caption 高度与圆角修复。

`npx electron tmp/selection-probe.cjs`：隐藏 Electron 在 elevation 0/1 两种状态下验证整卡选中轮廓为 2px solid、布局边框宽为零，通过。使用隔离 userData，运行后清理探针和其数据目录。真实窗口高亮效果待用户复验。

- `node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/asset-caption-band.test.ts tests/unit/justified-caption-band.test.ts tests/unit/canvas-asset-layout.test.ts`：3 个文件、26 项通过。
- `npx eslint src/renderer/asset-caption-band.ts src/renderer/canvas-asset-layout.ts src/renderer/justified-caption-band.ts tests/unit/asset-caption-band.test.ts tests/unit/justified-caption-band.test.ts`：通过。
- `npm run typecheck`：通过。
- 第一版视觉方案已被用户否定。重新设计后的平铺和瀑布流真实窗口视觉效果待用户复验；当前自动化验证了几何计算，不能替代视觉验收。
