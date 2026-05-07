# 消息事件管线设计 设计方案

## 设计目标

- 在新项目中以“可维护、可测试、可扩展”为核心重建消息处理架构。
- 保持与当前持久化架构（Adapter/Schema/Store）一致的分层风格。
- 用控制器 + 事件适配层 + 处理管线替代旧式单体 manager。

## 复杂度取舍（为什么不是「只 eventSource.on 一下」）

事件注册本身确实就是挂载；分层不是为了「把 on 写得更炫」，而是为了在**业务变复杂**时守住几条线：

- **生命周期**：扩展热开关、重复 init、调试时反复挂载时，能 `start/stop` 成对、避免重复订阅与泄漏（旧项目单例里这是常见坑）。
- **可测性**：把「解析 / 校验 / 执行」放进 pipeline，单测不必伪造整套 `eventSource`。
- **失败隔离**：一条消息处理抛错时，不拖垮整条监听链；错误上下文可统一记录。
- **演进**：以后加事件类型或阶段，改 controller + pipeline，而不是在一个大回调里继续堆 if。

若第一版只有「收到消息 → 调一个函数」，可以**先**用极简 `on` + 一个 `handleMessage`，等出现第二条分支或需要启停时再拆层；本 plan 描述的是**目标形态**，不是第一行代码就必须四层文件。

## 总体方案

采用**核心三层 + 可选一层**：

1. **Event Adapter（事件接线层）**
   - 只负责事件注册、解绑、事件名映射。
2. **Controller（编排层）**
   - 只负责接收事件并调用 pipeline/store/ui updater。
3. **Message Pipeline（业务处理层）**
   - 负责解析、校验、执行、结果回写等纯业务步骤。
4. **（可选）运行态 / UI**
   - **持久化**仍只用现有的 `vfsPersistenceStore`（`extensionSettings` / `chatMetadata`）。
   - 消息管线若只有「收到事件 → 处理 → 结束」，**不必**再建 store；仅当需要**进程内**的可观测状态（最近错误、计数、调试面板数据源）时，才加 `message-runtime-store`（**不写磁盘**，与持久化 store 无关）。

关键原则：
- 事件回调不直接写复杂业务逻辑。
- 业务逻辑不直接持有事件系统引用。
- 处理失败可恢复，不影响其他事件继续处理。

## 最终项目结构

```text
src/
  infra/
    sillytarvern/
      events/
        st-event-adapter.ts
        st-event-types.ts
  app/
    controllers/
      message-controller.ts
    services/
      message/
        message-pipeline.ts
        message-parser.ts
        message-processor.ts
    stores/                    # 可选：仅当需要运行态/调试态时再建
      message-runtime-store.ts # 内存态，非 extensionSettings/chatMetadata
```

> **`message-runtime-store` 是什么**：不是「消息要持久化」的第二套持久化层，而是**可选的内存模块**（例如最近一次 pipeline 错误、处理次数），刷新页面即丢。与 `vfs-persistence-store` 的命名并列容易误解——若第一版不需要调试态，**可整目录省略**，controller 直接调 pipeline 即可。

> 目录命名可按现有项目约定微调，但职责边界保持不变。

## 变更点清单

1. 新增 `st-event-adapter.ts`
   - 提供 `start()` / `stop()`；
   - 统一 on/off 注册，避免重复订阅。

2. 新增 `message-controller.ts`
   - 事件入口统一在 controller；
   - 负责路由到 pipeline 与状态更新。

3. 新增 `message-pipeline.ts`
   - 定义处理阶段：`parse -> validate -> execute -> commit`；
   - 返回标准结果对象（成功/失败/错误上下文）。

4. （可选）新增 `message-runtime-store.ts`
   - 仅当需要内存态观测/调试时再建：最近错误、统计计数等；**不**承担 `extensionSettings` / `chatMetadata` 持久化。

5. 与现有 persistence/store 的衔接（不是额外「魔法」）
   - 聊天切换后 **`chatMetadata` 会随当前会话变化**是 SillyTavern 的既定语义；持久化 store 已在 `CHAT_CHANGED` 上做了 `reloadChatState()`（或等价逻辑），**消息管线侧只需在同一事件里清空/重载「本会话的运行态缓存」**（若有），并避免仍引用上一聊天的消息索引或中间结果。
   - **不要求**再为「chat 变了」单独做一套持久化开关；与 store 的衔接主要是：**读会话数据时始终走 `getContext()` / store，不长期缓存 `chatMetadata` 引用**。

6. （可选）消息管线总开关
   - 若产品需要「暂停自动处理消息」再单独加；**默认可不做**：扩展启用即注册事件，禁用扩展即不加载脚本。

## 详细实现步骤

1. **定义事件契约**
   - 建立事件名常量映射，兼容 `MESSAGE_EDITED`/`MESSAGE_UPDATED` 差异。

2. **实现 Event Adapter**
   - 完成 `registerAll()` 与 `unregisterAll()`；
   - 保障幂等：重复 `start()` 不重复绑定，`stop()` 后可重启。

3. **实现 Controller**
   - 接收 event payload；
   - 根据事件类型调用 pipeline；
   - 统一触发 UI 刷新与错误上报。

4. **实现 Pipeline**
   - 拆分 parser/processor；
   - 标准化错误对象（事件类型、消息 id、阶段、原始错误）。

5. **（可选）接入 Runtime Store**
   - 需要调试/指标时再实现；否则 pipeline 内 `console` 或返回值即可。

6. **（可选）接入配置开关**
   - 仅当需要「不卸载扩展但暂停消息管线」时再实现；否则可省略。

7. **补充测试**
   - 覆盖接线、处理链、异常分支、聊天切换行为。

## 测试策略

### 测试用例

1. **事件接线幂等**
   - `start()` 多次调用只注册一次；
   - `stop()` 后事件不再触发处理。

2. **事件路由正确性**
   - 不同事件类型路由到正确 controller 分支。

3. **处理链成功路径**
   - `MESSAGE_RECEIVED` 输入 -> pipeline 成功 -> 状态更新 + UI 刷新。

4. **处理链失败路径**
   - processor 抛错后仍不中断其他消息处理；
   - 错误上下文完整记录。

5. **聊天切换**
   - `CHAT_CHANGED` 触发后，相关状态正确重载。

6. **（可选）开关动态启停**
   - 若实现总开关：关闭后停止处理，开启后恢复；未实现则跳过。

## 风险与回滚方案

- 风险 1：事件名差异导致某些监听失效。
  - 缓解：事件映射集中管理并加兼容测试。
- 风险 2：处理链拆分初期可能出现边界遗漏。
  - 缓解：先保留旧逻辑对照测试，逐步替换。
- 风险 3：若引入动态总开关，可能与聊天切换并发触发。
  - 缓解：controller 层引入最小串行保护（如任务队列或互斥标记）；不引入开关则风险降低。

回滚方案：
- 保留旧消息处理入口一段时间（feature flag 控制）；
- 新架构异常时可快速回退到旧入口，保障功能可用。
