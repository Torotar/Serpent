# AI 分析多 API 配置方案

日期：2026-10-21。状态：实现完成，等待用户验收（工单 `Serpent-906fed`）。关联：GitHub Issue #44。

## 1. 结论

将 AI 连接信息改为**可命名、可新增/编辑/删除的全局配置档案**，并提供唯一的「当前使用」档案。用户可保存多个供应商、代理地址或本地兼容服务的配置，然后显式切换；切换只影响后续发起的 AI 请求。

把「连接到哪个模型」与「AI 分析如何工作」拆成两类设置：档案只保存接口协议、地址、模型和凭据；标签、描述、评分、提示词、语言、并发、自动分析和披露确认等行为设置保持全局，不因切换档案而改变。尤其「强制使用已有标签」是分析策略，不应复制到每个模型档案中。

第一阶段实现档案 CRUD、设为当前、逐档测试连接/获取模型、旧配置迁移和所有 AI 请求改用当前档案。自托管地址仍须使用现有支持的 API 协议和鉴权方式；匿名免 Key 接口需要扩展协议能力，暂不隐式纳入本工单。暂不做工具栏快捷切换、配置文件导入导出和 CC Switch 互操作；这些可在基本流程稳定后另行评估。

## 2. Issue 范围与当前实现

Issue #44 提出的核心问题是：单份全局配置在切换强弱模型、供应商或代理地址时需要反复改写；最低验收要求是保存至少两份配置、切换后无需重输、后续分析使用当前配置。Issue 中的工具栏快捷切换、连接状态持久展示、导入导出属于可选增强。

当前 `AiConfig` 将 `apiFormat`、`baseUrl`、`model` 与分析行为保存在同一份全局配置中，API Key 单独加密保存。该配置除了图片/视频资产分析，也供 AI 自然语言搜索规划、连接测试和模型列表请求使用。因此本次要替换的是共同的连接选择入口，不能只改设置对话框而遗漏搜索规划或自动分析。

现有实现可复用的边界：

- 自定义语义搜索服务已有全局服务目录、稳定 ID、增删改、按 ID 使用 `safeStorage` 加密的凭据文件、脱敏的 `hasCredential` 摘要、typed Main/Preload 请求，以及设置页服务列表。主要参照 `src/main/embedding-service-registry.ts`、`src/main/library-request/embedding-models.ts` 和 `src/renderer/EmbeddingServiceSettings.tsx`。
- MCP 的凭据管理展示了独立的新增/撤销生命周期和凭据摘要，但 MCP token 的单次签发语义不同；不应直接复用它的 token store 作为 AI API Key 存储。
- `src/shared/ai-endpoints.ts` 已定义支持的 API 协议、默认地址及模型，也已兼容 CC Switch 的协议格式。新档案继续以 `apiFormat` 表示线协议，不以供应商品牌或模型名猜测协议。
- ADR-0005 已决定 AI 配置为应用级全局配置，适用于所有资源库；模型结果保存在资源库中，模型档案和凭据不应进入资源库数据库或同步数据。

## 3. 数据模型与持久化

建议由 Main 独占一个 `AiProfileStore`，档案目录与分析行为设置分开校验和保存。档案摘要通过 Renderer API 返回时永远不包含明文 Key。

```ts
type AiConnectionProfile = {
  id: string;
  name: string;
  apiFormat: AiApiFormat;
  baseUrl: string; // 空值仍表示采用该协议的官方默认地址
  model: string;
  // 密钥本身不进入 renderer DTO；DTO 只返回 hasCredential
};

type AiProfileCatalog = {
  version: 1;
  activeProfileId: string | null;
  profiles: AiConnectionProfile[];
};

type AiAnalysisPreferences = {
  enabledFields: { description: boolean; tags: boolean; rating: boolean };
  analysisSettings: AiAnalysisSettings; // 包含 forceExistingTags、提示词和输出限制
  languages: AiLanguageId[];
  concurrencyLimit: number;
  maxAnalysisImageEdgePx: number;
  reliabilitySettings: AiReliabilitySettings;
  autoAnalyzeEnabled: boolean;
  disclaimerAccepted: boolean;
};
```

档案列表和 `activeProfileId` 放在应用用户数据目录的版本化 JSON 中，使用原子写入和严格 schema 校验；Key 继续使用 Electron `safeStorage` 加密，并以稳定档案 ID 分开存放。凭据读写、档案删除和目录更新由 Main 中一个串行化存储服务协调。删除凭据或持久化失败必须显式报错并允许重试；启动时检查孤立的档案 Key 文件，清理失败不得静默忽略。禁止将 Key 返回 Renderer、写入普通 JSON、日志、工单或资源库。

分析行为设置独立持久化，例如 `ai-analysis-settings.json`，并继续使用当前默认值和标准化函数。语言、强制已有标签、描述/标签/评分开关、提示词、图像边长、队列并发、重试参数、自动分析和披露状态都留在这里。这样切换模型不会改变用户的分析策略；档案切换也不会触发资源库索引重建。

`activeProfileId` 为空时表示尚未选择可用模型，所有需要模型的功能显示未配置状态并保持可恢复；不自动挑选其它档案，也不静默将自动分析任务改发给另一供应商。删除当前档案时，在同一操作里清除活动 ID 并删除其 Key，要求显式确认；剩余档案由用户主动设为当前。若保存档案时 Key 输入留空，默认保留原 Key；清除 Key 使用单独、明确的操作。

## 4. API 与界面设计

增加专用的 profile 请求/响应，不继续把档案 CRUD 塞进现有 `ai.config.set` 大对象：

| 操作 | 行为 |
| --- | --- |
| list/get profiles | 返回档案字段、`hasCredential` 和当前档案 ID，不返回 Key |
| save profile | 新建或更新名称、协议、地址、模型；可选提交新 Key，校验名称和字段 |
| delete profile | 二次确认当前档案；清理对应凭据；活动档案删除后清空活动 ID |
| activate profile | 仅激活存在且可用的档案；可选 Key 的配置允许保存但不得用于请求，界面标记未完成 |
| test profile / list models | 以档案 ID 读取配置和加密 Key，在 Main 中执行既有测试/列表逻辑；新输入的 Key 只在此次请求中使用，成功保存后再更新档案 |

协议使用现有 `RendererRequest` / `RendererResult` 的 Zod schema、Main 请求处理、Preload 显式桥接和共享 API 类型；Renderer 不获得文件路径、safeStorage 或任意读写能力。统一复用现有 endpoint 解析、连接测试和模型列表代码，避免把 URL 规则复制到新的档案服务。

设置中心的 AI 页面分成清楚的两块（可用同页分组，也可拆成两个设置子页，最终依现有设置导航结构落地）：

1. **模型配置**：档案列表、当前档案标记、新建/编辑/删除、测试连接与获取模型；当前档案可见地显示名称、协议、模型和脱敏 Key 状态。
2. **分析设置**：描述/标签/评分开关、强制使用已有标签、语言、提示词及高级分析选项、自动分析与披露设置。这里不再出现 API Key、API 地址或协议编辑控件。

新建档案可从当前已选档案复制协议、地址和模型作为初始值，但不复制 Key，避免用户无意中把凭据复制到另一档案。设置档案只负责管理和激活；分析动作仍由资产菜单/任务入口触发，职责与当前产品结构一致。

## 5. 请求切换与运行语义

实现一个 Main 侧解析函数，在每个 AI 操作开始时读取一次活动档案、其 Key 和全局分析设置，形成不可变的运行快照。资产分析、批量分析、自动分析、自然语言搜索规划、测试连接和模型列表全部使用各自指定的档案；生产请求使用活动档案，档案管理中的测试/模型列表可按目标档案执行。

AI 队列在一个实际处理批次开始时固定该快照。用户在任务进行中切换档案，不中断已发送请求，也不改变正在运行的批次；之后启动的批次使用新的活动档案。排队但尚未发出的任务在开始处理时使用当时的活动档案。模型名称和版本仍传给现有 AI 写入路径，确保资产记录反映真正执行的模型。凭据仅按现有 Worker 调用路径在 Main 需要时解密并传递，不进入 Renderer 响应或日志。

自动分析在没有活动档案、Key 无法解密或档案配置不完整时不发请求；用户手动触发时返回可理解的未配置提示。披露确认与自动分析开关作为全局分析偏好保留，本轮不改变现有披露范围或授权语义；若产品后续要做到按供应商单独授权，应单独设计确认状态及迁移。

## 6. 旧配置迁移

对既有 `ai-config.json` 与加密 Key 做一次幂等迁移：

1. 读取并按当前代码规则标准化旧协议、模型、地址、分析设置和兼容字段；旧配置中有有效连接信息或 Key 时，生成一个稳定 ID 的初始档案（显示名可由协议推导，用户可改），并将其设为当前档案。
2. 旧的描述/标签/评分开关、强制已有标签、提示词、语言、并发、图像尺寸、重试、自动分析和免责声明原样迁到分析偏好。
3. Key 通过 Main 内部迁入新 ID 对应的加密存储。迁移完成后重新读取档案和 Key，验证旧配置可按原行为发起请求，再写入迁移完成标志。
4. 迁移验证只检查新档案、偏好及 Key 的解密可读性，不在启动时自动向供应商发请求。若任一步失败，保留旧文件并继续用旧读取路径恢复，不清空或覆盖用户现有配置；下次启动可安全重试。只有目标数据完整验证并标记迁移成功后，才删除已废弃的旧配置和 Key 文件；删除失败应留下可诊断、可重试的清理状态。
5. 不触碰任何资源库数据库、语义索引、用户模型文件或其他设置。已迁移过的安装再次启动不得重复创建档案或重置当前选择。

## 7. 分阶段实施

| 阶段 | 交付 | 关键验证 |
| --- | --- | --- |
| A. 存储和迁移 | 新的档案目录/凭据 Store、独立分析设置、默认值与旧配置幂等迁移 | 存储往返、损坏/权限/加密失败、迁移中断重启、旧值完整保留、密钥不出 DTO |
| B. Typed API 和模型调用 | Main/Preload typed CRUD、激活、测试连接、模型列表；所有 AI 分析及搜索规划读取活动档案 | schema 拒绝非法 ID/协议；各 API 使用指定 Key；切换后新请求选新模型；请求和日志无 Key |
| C. 设置 UI | 档案增删改/测试/激活与分析偏好分区，补齐中英文案和状态反馈 | 至少两个档案往返保存、切换、重启后保持；Key 留空保留、显式清除；删除当前配置恢复为未配置 |
| D. 收口 | 人工可操作流程、开发日志、QA 和代码审查 | 完整验收矩阵通过后才把 #44 标为可关闭；用户验收按清单记录 |

## 8. 验收矩阵

| 需求 | 实现位置（预期） | 自动化证据（预期） | 人工/平台证据 |
| --- | --- | --- | --- |
| 可保存至少两个不同供应商/地址/模型档案 | Main `AiProfileStore`、AI 设置模型配置区 | 新增/编辑/列表/删除单测与 typed API 测试 | AI 设置中建立两个档案并确认摘要与活动状态 |
| 一键启用档案且重启保持 | profile catalog 的 `activeProfileId`、激活 API | 激活、重启加载、缺失 ID 与删除当前档案单测 | 切换后重启，当前配置仍正确 |
| 新分析使用已选档案，进行中的请求保持快照 | Main AI 请求与队列调度 | 单条/批量/自动分析/搜索规划的模型和 Key 选择测试；切换竞态测试 | 用可区分模型的测试端点确认切换前后请求；活动请求不中断 |
| 模型配置与分析行为分离 | 独立持久化 schema、设置 UI 分区 | 迁移保留 forceExistingTags 与提示词；切换档案不改行为设置 | 切换档案前后确认「强制使用已有标签」状态不变 |
| 旧用户配置无损升级 | Main 启动迁移 | 空配置、完整配置、历史 provider 值、坏 Key、写失败、重复启动/中断恢复测试 | 从旧版本配置启动后验证连接和分析偏好 |
| 凭据安全与显式删除 | safeStorage 凭据 Store、Main-only secret resolution | 返回 DTO/日志无 Key；更新保留、清除、删除及失败恢复测试 | UI 仅显示已配置状态，不回显原 Key |

## 10. 实施与验收追踪

| 需求 | 实现位置 | 自动化测试 | 人工/平台证据 |
| --- | --- | --- | --- |
| 多份档案的保存、更新、激活、删除、未完成档案不抢占当前项 | `src/main/ai-profile-store.ts:112`；`src/main/library-request/ai.ts:336`；`src/renderer/AiConfigDialog.tsx:447` | `tests/unit/ai-profile-store.test.ts:17`；`tests/e2e/ai-profile-switching.test.ts:113` | Windows 开发窗口仅检查到无活动资源库的起始页，未进入 AI 设置；待用户按清单验收 |
| 分析行为与连接档案分离，旧设置无损迁移 | `src/main/ai-analysis-preferences.ts:31`；`src/main/index.ts:1586`；`src/main/ai-profile-legacy-config.ts:32` | `tests/unit/ai-analysis-preferences.test.ts:5`；`tests/unit/ai-profile-legacy-config.test.ts:15` | force-existing-tags、语言、分析字段及保存后重启行为待用户验收 |
| 新 AI 分析使用当前档案；应用重启后恢复当前选择和凭据 | `src/main/library-request/ai.ts:31`；`src/main/index.ts:3097`；`src/main/index.ts:3126` | `tests/e2e/ai-profile-switching.test.ts:113`；`tests/e2e/ai-inspector-refresh.test.ts:87`；`tests/e2e/ai-inspector-refresh.test.ts:237` | 隔离 Electron E2E 已验证配置切换、单项/批量分析和重启后连接探测；真实供应商与真实窗口待用户验收 |
| 分析进行中固定连接快照 | `src/main/ai-profile-store.ts:179`；`src/main/index.ts:3097` | `tests/unit/ai-profile-store.test.ts:87` 验证不可变快照；没有覆盖 Main 真实请求期间切换的端到端竞态 | 用户可用两个可区分的端点验证；自动分析及请求运行期间切档的直接请求测试尚缺 |
| AI 搜索规划读取活动档案的模型、地址和凭据 | `src/main/library-request/ai.ts:521` | `tests/unit/main-ai-owned-request.test.ts:197` 用隔离 fetch 断言 URL、Bearer 凭据、模型和解析结果 | 自动化覆盖通过；搜索设置和切档后的实际服务请求待用户验收 |
| 迁移、目录与凭据写入失败可恢复，Renderer 不接触明文凭据 | `src/main/ai-profile-transaction.ts:28`；`src/main/ai-profile-store.ts:202`；`src/preload/bridge/library.ts:1917` | `tests/unit/ai-profile-transaction.test.ts:53`；`tests/unit/ai-profile-legacy-config.test.ts:15`；`tests/unit/ai-profile-store.test.ts:17` | 自动化已检查异常恢复与档案摘要；packaged 和 Windows 故障恢复未执行 |

本次定向 E2E 命令为 `node scripts/run-e2e.mjs --workers=1 tests/e2e/ai-profile-switching.test.ts tests/e2e/ai-inspector-refresh.test.ts`，3 项通过。`npm run verify:mainline` 已执行，但在 `npm run test` 阶段遇到两个与本功能无关的失败，后续性能、全量 E2E 与快捷键门禁未运行；详见开发日志和 QA 报告。该结果不构成主线全绿或功能验收通过。

涉及 Main/Preload/Worker 请求和 AI 设置 UI，实施时同步更新受影响单测及真实 Electron E2E。由于配置存于应用用户数据而不是资源库，本功能不应触发语义索引或资源库 schema 迁移；只有实现意外触及资源库打开/关闭或 Worker 协议时，才按资源库可用性门禁扩大测试。

## 9. 暂不纳入第一阶段

- 主工具栏的模型快速切换入口；先验证设置中心切换与任务快照语义。
- CC Switch 配置导入/导出及其版本兼容；当前协议值与 URL 拼接已兼容其主要协议形态，但这不等同于配置文件兼容。
- 多个档案同时启用、按资源库或任务类型绑定不同档案、自动故障转移。首版只有一个全局当前档案，避免排队任务和自动分析在无提示时换供应商或产生费用。
- 按档案保存分析策略或输出 prompt；这会导致切模型时策略意外变化，且不符合本方案要求的职责分离。
