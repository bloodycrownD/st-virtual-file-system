# 持久化抽象重构 设计方案

> 执行上下文：本文件最初用于 v1 设计期；当前 `dev/persistence-abstraction` 分支按 v2 实现期执行该方案并补齐验证。

## 设计目标

- 在不增加不必要复杂度的前提下，建立一套“官方兼容 + 轻抽象”的持久化基础设施。
- 将持久化从业务逻辑中解耦，避免再出现单类大而全、时序复杂、引用失效等问题。
- 为后续 VFS 功能扩展提供稳定的状态读写骨架。

## 总体方案

采用“三层薄抽象”：

1. **ST Context Adapter（基础访问层）**
   - 负责唯一入口：`SillyTavern.getContext()` 访问与 save 调用。
   - 提供 `extensionSettings` / `chatMetadata` 的 get/set/save 方法。
   - 严格遵守：不长期缓存 `chatMetadata` 引用。

2. **Schema / Codec（数据模型层）**
   - 负责默认值、字段兼容、解析兜底、序列化与反序列化。
   - 持久层仅存 JSON 可序列化对象。

3. **Persistence Store（领域状态层）**
   - 对外提供明确命令式接口（如 `setEnabled`、`loadChatState`）。
   - 统一处理聊天切换重载与 UI 状态同步。
   - 避免隐式 Proxy 自动保存，改为可观测的显式保存流程。

## 最终项目结构

```text
src/
  infra/
    persistence/
      st-context-adapter.ts
      vfs-extension-settings.schema.ts
      vfs-chat-metadata.schema.ts
  app/
    stores/
      vfs-persistence-store.ts
```

> 注：本次仅产出方案文档，结构为下一迭代建议落地目录。

## 变更点清单

1. 新增 `st-context-adapter.ts`
   - 封装官方上下文访问与保存函数调用。
2. 新增两个 schema 文件
   - extension 级：默认值 + 解析 + 输出；
   - chat 级：默认值 + 解析 + 输出。
3. 新增 `vfs-persistence-store.ts`
   - 面向业务提供统一 API；
   - 处理 `CHAT_CHANGED` 重载流程。
4. 调整 UI 层调用方式（后续实现）
   - UI 只与 store 交互，不直接触达 `SillyTavern.getContext()`。

## 详细实现步骤

1. **定义数据模型**
   - 明确 extension/chat 两类状态接口与默认值。
2. **实现 Adapter**
   - 提供 `readExt`, `writeExt`, `saveExt`, `readChat`, `writeChat`, `saveChat`。
3. **实现 Schema/Codec**
   - `fromRaw(raw) -> normalized`
   - `toRaw(state) -> serializable`
4. **实现 Store**
   - `init()`：加载 extension + chat 状态；
   - `setXxx()`：更新状态并触发对应保存；
   - `onChatChanged()`：重载 chat 状态并通知 UI。
5. **接入 UI**
   - 当前开关配置页改用 store；
   - 验证刷新、切聊天、重复进入页面行为一致。
6. **补充测试与文档**
   - 单测覆盖 schema 与 store 关键路径；
   - 更新 memory 记录本次抽象决策。

## 测试策略

### 测试用例

1. **默认值回填**
   - 清空设置后启动，extension/chat 状态应按默认值加载。
2. **extensionSettings 持久化**
   - 修改开关 -> 刷新页面 -> 值保持一致。
3. **chatMetadata 持久化**
   - 在聊天 A 写入数据，切换聊天 B 不应读到 A 数据；切回 A 应恢复。
4. **聊天切换重载**
   - 触发 `CHAT_CHANGED` 后，store 状态应正确更新。
5. **异常数据兜底**
   - 注入非法/旧格式数据时，不崩溃并回退默认值。

## 风险与回滚方案

- 风险 1：初版抽象过度设计，增加接入成本。
  - 缓解：保持最小接口集，按需演进，不预埋过多通用能力。
- 风险 2：chat 切换监听处理不当导致状态抖动。
  - 缓解：统一单点监听与重载流程，避免多处订阅。
- 风险 3：历史数据兼容不足。
  - 缓解：schema 提供兜底解析与可选迁移函数。

回滚方案：
- 若新抽象在实现期不稳定，可临时回退到“官方 API 直连 + 最小保存逻辑”，保留 schema 层不回退，逐步恢复 store 抽象。
