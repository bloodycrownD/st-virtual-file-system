# 虚拟宏工作树渲染 需求说明

## 背景

当前项目已具备 chat 级 VFS、工具调用执行链路与基础持久化能力。为了在提示词中向 AI 提供可控文件上下文，需要新增宏能力：输出文件树与工作树内容。同时，工作树的可见内容应与未来 UI 的“所见即所得”策略一致，并支持 chat/ext 双份配置与模板克隆。

## 名词：chat VFS 快照

- **`chatVfsSnapshot`**：当前会话在 `chatMetadata` 中持久化的 **整棵虚拟文件树**（`VfsSnapshot`：根节点 + 节点表）。宏遍历与渲染都基于这份数据。
- **不变量**：扩展在完成该 chat 的 VFS 初始化（含模板注入或空树创建）后，**持久化层中的 `chatVfsSnapshot` 必须始终为非 null 的合法快照**（至少包含根目录 `/`）。不把「长期为 null」视为正常产品状态；若出现则视为初始化/持久化缺陷并修复，而非在宏里单独堆叠分支语义。

## 目标

- 在 `st-virtual-file-system` 扩展内新增并注册两个宏：
  - `{{VIRTUAL_FILE_TREE}}`
  - `{{VIRTUAL_WORK_TREE}}`
- `VIRTUAL_FILE_TREE` 输出 chat 级 VFS 的目录树字符串。
- `VIRTUAL_WORK_TREE` 按工作树配置输出 `<file ...>...</file>` 片段。
- 工作树配置与 VFS 一样，支持 chat/ext 双份存储与模板克隆。
- 在 UI 未接入前，后端先具备完整配置解释与渲染能力（可通过 mock 配置验证）。

## 范围

### 包含范围

- 宏注册位置在 `st-virtual-file-system`（不放到 `st-better-database`）。
- 实现 `VIRTUAL_FILE_TREE`：
  - 遍历当前 chat VFS。
  - 输出目录树（不包含正文）。
- 实现 `VIRTUAL_WORK_TREE`：
  - 基于配置渲染 `<file ...>` 片段。
  - 行号从 1 开始，格式为 `N|内容`。
- 文件输出标签格式：
  - `<file path="" updatedAt="yyyy-MM-dd hh:mm:ss" createdAt="yyyy-MM-dd hh:mm:ss" updatedBy="user|assistant">...</file>`
- 工作树规则支持：
  - 排序方式：名称 / 创建时间 / 更新时间
  - 排序方向：升序 / 降序
  - 头部读取：0~1000
  - 尾部读取：0~1000
  - 填充策略：文件名 / FrontMatter读取 / 不展示
- FrontMatter 读取仅针对 markdown 文件生效。
- 工作树配置模型采用：
  - 全局默认规则
  - 目录覆盖规则
  - 显式文件读取清单（selectedFiles）
- 显式文件读取与目录规则可并存，不冲突：
  - 显式文件读取优先
  - 路径去重后每个文件最多输出一次
- 最终输出顺序：严格按 UI 当前展示顺序（所见即所得）。
- 默认行为（UI 配置尚未写入时）：
  - `VIRTUAL_WORK_TREE` 输出空字符串。
- 配置生效域：
  - chat 配置：实际生效
  - extension 配置：模板来源，可克隆到 chat

### 不包含范围

- 本次不实现 UI 前端页面与交互。
- 本次不改动真实本地文件系统。
- 本次不实现宏配置可视化编辑器（仅后端结构与渲染能力）。

## 功能需求

1. **宏注册**
   - 在扩展启动时注册 `VIRTUAL_FILE_TREE` 与 `VIRTUAL_WORK_TREE`。
   - 宏调用时读取当前 chat 上下文对应的 VFS 与工作树配置。
   - 宏 handler 必须为同步函数：禁止 `async/await` 与 `Promise` 返回值。
   - 所需数据应在宏执行前准备到可同步读取的内存态；宏执行期仅做同步读取与字符串渲染。

2. **`VIRTUAL_FILE_TREE` 渲染**
   - 生成稳定的递归树形文本（目录/文件层级）。
   - 显示风格固定为 `tree` 风格，仅显示名称，路径通过层级关系推导（不额外展示完整路径字段）。
   - 不输出文件正文。

3. **`VIRTUAL_WORK_TREE` 渲染**
   - 根据工作树配置挑选文件并渲染 `<file ...>` 片段。
   - 行号从 1 开始。
   - 元数据包含 `path/updatedAt/createdAt/updatedBy`。

4. **目录规则解释**
   - 支持目录内排序、头尾读取、填充策略。
   - 目录规则用于计算“候选可见文件列表”。
   - 文件夹读取状态为一等状态，且**仅用于控制该文件夹上的目录规则是否生效**：处于“读取”时，对该文件夹配置的排序/头尾/填充策略参与计算；否则该文件夹的目录规则不参与计算。**不**将文件夹读取解释为「整棵子树一次性读取」或替代子目录自身规则；子目录仍各自依赖其自身的读取状态与规则。
   - UI 与后端均按同一排序规则计算最终顺序（名称/创建时间/更新时间 + 升降序），不引入额外 `orderedPaths` 顺序字段。

5. **显式文件读取优先级**
   - `selectedFiles` 始终高于目录规则。
   - 与目录规则重叠时仅输出一次，以显式读取语义为准。

6. **FrontMatter 填充策略**
   - 仅 markdown 文件尝试读取 FrontMatter。
   - 非 markdown 文件在该策略下不展示。
   - markdown 文件若 FrontMatter 不存在或解析失败，不展示。

7. **chat/ext 双配置与模板克隆**
   - chat 工作树配置实际生效。
   - extension 工作树配置可作为模板克隆到 chat 初始化。

8. **默认空配置行为**
   - 无 chat 配置时，`VIRTUAL_WORK_TREE` 返回空字符串。

9. **头尾读取与排序稳定性规则（已定稿）**
   - `headCount` 与 `tailCount` 的单项取值范围为 `0~1000`。
   - 当输入值超过 `1000` 时，按 `1000` 归一化处理（不报错）。
   - 当 `head` 与 `tail` 选中的文件区间重叠时，重叠部分按“覆盖即展示”处理：最终并集内文件全部展示。
   - `head/tail` 结果合并后按路径去重，同一路径最多输出一次。
   - 对于“名称排序”，同目录内文件名视为唯一，不额外引入 `path` 作为二级排序键。

10. **文件元数据强约束（开发期）**
   - `createdAt`、`updatedAt`、`updatedBy` 视为必填字段。
   - 渲染层不做缺失回填；若缺失视为实现缺陷并在开发/测试阶段暴露。

## 非功能需求

- **可维护性**：宏渲染逻辑、配置解析逻辑、持久化 schema 分层清晰。
- **一致性**：后端渲染顺序必须可与 UI 顺序字段严格对齐。
- **可扩展性**：后续新增填充策略或元数据字段不破坏现有协议。
- **稳定性**：异常配置或异常文件内容不会导致宏渲染崩溃。

## 验收标准

1. 在 `st-virtual-file-system` 内可调用两个宏：`VIRTUAL_FILE_TREE`、`VIRTUAL_WORK_TREE`。
2. `VIRTUAL_FILE_TREE` 能输出当前 chat VFS 树结构且不含正文。
3. `VIRTUAL_WORK_TREE` 在默认空配置下输出空字符串。
4. 有效配置下，`VIRTUAL_WORK_TREE` 能输出 `<file ...>`，且行号从 1 开始。
5. 显式文件读取与目录规则并存时不冲突：显式优先、路径去重。
6. 填充策略支持 文件名 / FrontMatter读取 / 不展示，并对 markdown FrontMatter 生效。
7. 输出顺序与 UI 顺序字段一致（所见即所得）。
8. 工作树配置支持 chat/ext 双份，并可从 extension 克隆到 chat。
9. `headCount/tailCount` 支持 `0~1000`，超限值按 `1000` 归一化。
10. `head/tail` 重叠场景下按并集展示且去重后不丢文件。
11. 名称排序在同目录文件名唯一前提下稳定生效。
12. `VIRTUAL_FILE_TREE` 以递归树形文本输出，固定为 `tree` 风格且仅显示名称。
13. FrontMatter 策略下，非 markdown 或 markdown 解析失败均不展示。
14. `createdAt/updatedAt/updatedBy` 缺失视为实现缺陷，不做回填兜底。
15. `updatedBy` 枚举严格为 `user|assistant`。
16. 文件夹未处于读取状态时，其目录规则不生效（读取态**仅**用于门控目录规则，非整树读取）。
18. chat 在 VFS 初始化完成后，`chatVfsSnapshot` 恒为合法非 null 快照（至少含根）；宏不依赖「长期 null」语义。

## 风险项

- `VIRTUAL_FILE_TREE` 的字符排版细节（缩进符号、连接线字符）需要在实现时固定为单一格式，避免测试快照抖动。
- UI 与后端排序实现需共用同一比较逻辑，避免“同配置不同序”的一致性偏差。
