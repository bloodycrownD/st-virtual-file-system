# 虚拟工作树 UI（状态机与提交回滚）设计方案

## 设计目标

- 建立可实现的状态机模型，保证文件管理/阅读/编辑/提交记录一致。
- 落地手动回滚与批量回滚流程，并确保“回滚成功记为一次新提交”。
- 明确失败反馈机制：统一 `toastr.error` + 前置错误码。
- 形成动作到错误码的一对一映射，便于前后端联调。

## 总体方案

- 采用“状态机 + 事件驱动提交流水”：
  - UI 触发动作 -> 生成领域事件 -> 调用服务 -> 根据结果提交状态变更。
- 将“页面状态”和“提交状态”分离管理：
  - 页面状态：当前页面、当前路径、当前选中实体。
  - 提交状态：提交列表、当前执行任务、最近一次结果。
- 回滚策略遵循已确认约束：
  - 不做前置冲突拦截。
  - 以执行结果为准。
  - 成功回滚新增提交记录。

## 最终项目结构

```text
src/
  app/
    screens/
      business-screens/
        VfsHistoryScreen.vue
    components/
      business-components/
        VfsCommitTab.vue
        VfsHistoryPanel.vue
      pure-components/
        VfsCommitList.vue
        VfsCommitItem.vue
    composables/
      screens-composables/
        useVfsHistoryStateMachine.ts
      components-composables/
        useVfsCommitActions.ts
        useVfsRollbackActions.ts
    services/
      vfs/
        commitService.ts
        rollbackService.ts
    constants/
      vfsErrorCodes.ts
    utils/
      vfsErrorMapper.ts
```

## 变更点清单

- 新增状态机定义（页面状态 + 提交状态）。
- 新增编辑保存、手动回滚、批量回滚的动作处理器。
- 新增提交列表刷新与联动刷新机制（文件树/阅读页/编辑页）。
- 新增错误码映射与统一错误提示适配层。
- 新增提交相关错误码矩阵（状态与提交子域）。

## 详细实现步骤

1. 定义状态机与事件模型
   - 状态：`idle`、`saving`、`rollingBack`、`batchRollingBack`、`failed`、`succeeded`。
   - 事件：`SAVE_REQUEST`、`ROLLBACK_REQUEST`、`BATCH_ROLLBACK_REQUEST`、`*_SUCCESS`、`*_FAILED`。
   - 验证：状态转移图可覆盖全部操作路径。

2. 实现提交服务与回滚服务
   - 抽象 `commitService`、`rollbackService`，统一返回 `ok/errorCode/message`。
   - 回滚成功后触发“写入新提交记录”流程。
   - 验证：回滚成功后提交列表新增一条记录。

3. 实现批量回滚联动刷新
   - 回滚完成后统一广播刷新事件：
     - 文件树
     - 阅读页
     - 编辑页与历史面板
   - 验证：三处内容一致更新，无局部旧数据残留。

4. 落地错误码映射
   - 在 `vfsErrorCodes.ts` 中定义常量。
   - 在 `vfsErrorMapper.ts` 将服务错误映射为前端统一格式：
     - `[E_<REASON>] 人类可读错误信息`
   - 仅 `toastr.error` 展示错误码。
   - 验证：错误提示样式统一，且不出现无 code 的 error toast。

5. 完善动作唯一错误码矩阵（状态/提交域）
   - 批量回滚失败：`E_BATCH_ROLLBACK_FAILED`
   - 回滚失败：`E_ROLLBACK_FAILED`
   - 提交应用失败：`E_COMMIT_APPLY_FAILED`
   - 历史刷新失败：`E_HISTORY_REFRESH_FAILED`
   - 保存失败：`E_SAVE_FAILED`
   - 验证：每条动作仅映射一个主错误码。

6. 接入 Tab2 视图与操作反馈
   - 在 `VfsCommitTab.vue` / `VfsHistoryPanel.vue` 中展示提交记录并触发回滚。
   - 进行中/成功/失败状态反馈。
   - 验证：Tab2 可完整执行一次批量回滚流程。

## 测试策略

- 以状态机单测 + 服务层单测 + UI 集成测试组合验证。
- 对关键路径（保存、回滚、批量回滚）做失败注入测试。

### 测试用例

- 编辑保存成功后，提交列表新增记录。
- 手动回滚成功后，新增一条来源明确的回滚提交。
- 批量回滚成功后，文件树/阅读页/编辑页一致更新。
- 回滚失败时只出现 `toastr.error`，且文案前置错误码。
- 并发保存与回滚时，以后端返回结果为准，不出现前端状态卡死。
- 历史刷新失败时返回 `E_HISTORY_REFRESH_FAILED` 并保持已有视图可用。

## 风险与回滚方案

- 风险：多异步动作并发导致状态抖动。
  - 缓解：对同一文件写操作加串行队列或互斥锁。
- 风险：错误码映射遗漏导致“裸错误”提示。
  - 缓解：`errorMapper` 提供兜底 `E_UNKNOWN`，并记录日志。
- 回滚方案：
  - 新旧提交流程并行保留一段时间（灰度开关）。
  - 若新状态机异常，可切回旧提交流程并保留数据结构兼容。
