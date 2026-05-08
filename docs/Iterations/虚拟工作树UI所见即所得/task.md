# 虚拟工作树 UI 并发开发任务单

## 目标与范围

- 目标：在不破坏现有扩展行为的前提下，并发推进 3 条开发线（挂载工程、交互 IA、状态回滚），最终集成为可用的 VFS 弹窗能力。
- 范围：
  - 包含：`.extraMesButtons` 挂载、3 Tab 壳层、Tab1 主交互、Tab2 回滚、Tab3 日志、统一错误码与 toast 规范。
  - 不包含：后端协议重构、跨 chat 治理、非本迭代 UI 系统重构。
- 统一约束：
  - Vue 分层遵循 `src/app/structure.md`（`pure/business + composables`）。
  - 错误展示仅 `toastr.error` 带码，格式固定 `[E_<REASON>] 文案`。
  - 日志仅分页（20/页），默认手动刷新，消息编辑/收到消息触发自动单次刷新。

## Subagent 拆分

### Agent A（工程挂载与基础设施）

- 职责：
  - 实现 `.extraMesButtons` 幂等挂载、销毁清理、弹窗壳层生命周期。
  - 实现统一渲染与 sanitize 配置。
  - 实现日志分页与消息事件刷新钩子。
- 输入：
  - `spec-engineering-mount.md`
  - `plan-engineering-mount.md`
- 输出：
  - `bootstrap/*` 挂载逻辑
  - `screens-composables/useVfsEntryMount.ts`
  - `screens-composables/useVfsPopupLifecycle.ts`
  - `components-composables/useVfsMessageHooks.ts`
  - `components-composables/useVfsLogPagination.ts`
  - `services/vfs/renderPipeline.ts` + `sanitizeConfig.ts`

### Agent B（交互与信息架构）

- 职责：
  - 实现 Tab 壳层、Tab1 文件管理器、阅读/编辑/幻灯片流转。
  - 实现动作菜单按实体类型约束。
  - 实现编辑页“未保存确认 + 强制退出不保存”。
- 输入：
  - `spec-ui-ia.md`
  - `plan-ui-ia.md`
- 输出：
  - `screens/business-screens/VfsMainScreen.vue`
  - `screens/pure-screens/VfsTabShellScreen.vue`
  - `screens/pure-screens/ReaderScreen.vue`
  - `screens/pure-screens/EditorScreen.vue`
  - `screens/pure-screens/SlideshowScreen.vue`
  - `components/business-components/VfsFileManagerPanel.vue`
  - `components/business-components/VfsActionMenu.vue`

### Agent C（状态机与提交回滚）

- 职责：
  - 实现提交状态机与保存/回滚流程。
  - 实现 Tab2 提交记录与批量回滚联动刷新。
  - 落地错误码映射与状态域错误码矩阵。
- 输入：
  - `spec-state-history.md`
  - `plan-state-history.md`
- 输出：
  - `screens/business-screens/VfsHistoryScreen.vue`
  - `components/business-components/VfsCommitTab.vue`
  - `components/business-components/VfsHistoryPanel.vue`
  - `composables/screens-composables/useVfsHistoryStateMachine.ts`
  - `composables/components-composables/useVfsCommitActions.ts`
  - `composables/components-composables/useVfsRollbackActions.ts`
  - `services/vfs/commitService.ts` + `rollbackService.ts`
  - `constants/vfsErrorCodes.ts` + `utils/vfsErrorMapper.ts`

## 共享契约

### 接口契约

- `services/vfs/commitService.ts`
  - `saveCommit(payload): Promise<{ ok: boolean; errorCode?: string; message?: string }>`
- `services/vfs/rollbackService.ts`
  - `rollbackCommit(payload): Promise<{ ok: boolean; errorCode?: string; message?: string }>`
  - `rollbackBatch(payload): Promise<{ ok: boolean; errorCode?: string; message?: string }>`
- `services/vfs/logService.ts`
  - `fetchLogs({ page, pageSize }): Promise<{ items: unknown[]; total: number }>`

### 事件契约

- `VFS_LOG_REFRESH_REQUESTED`：请求刷新日志（手动触发）。
- `VFS_LOG_REFRESH_AUTO`：消息编辑/收到消息后自动刷新触发。
- `VFS_STATE_REFRESH_REQUIRED`：回滚成功后刷新文件树/阅读/编辑。
- `VFS_POPUP_OPENED` / `VFS_POPUP_CLOSED`：壳层生命周期事件。

### 错误码契约

- 错误码统一定义在 `constants/vfsErrorCodes.ts`，禁止各模块自行硬编码字符串。
- 首批固定错误码：
  - `E_VIEW_OPEN_FAILED`
  - `E_EDIT_OPEN_FAILED`
  - `E_STATUS_TOGGLE_FAILED`
  - `E_DELETE_FAILED`
  - `E_RENAME_FAILED`
  - `E_STRATEGY_APPLY_FAILED`
  - `E_SLIDESHOW_OPEN_FAILED`
  - `E_SAVE_FAILED`
  - `E_ROLLBACK_FAILED`
  - `E_BATCH_ROLLBACK_FAILED`
  - `E_LOG_FETCH_FAILED`
  - `E_RENDER_FAILED`

### 目录边界

- Agent A 只改：`bootstrap/`、挂载/日志/渲染相关 composables 与 services。
- Agent B 只改：`screens/*` 与 `components/*` 的 IA 流转与展示逻辑。
- Agent C 只改：状态机、提交服务、回滚服务、错误码常量与映射。
- 共享文件（需串行提交，禁止并发写）：
  - `constants/vfsErrorCodes.ts`
  - `screens/pure-screens/VfsTabShellScreen.vue`（若多方依赖）

## 执行顺序与依赖

1. **阶段 0（串行，先完成）**
   - 创建共享契约骨架文件（接口、事件名、错误码常量）。
   - 负责人建议：Agent A（基础设施先行）。
2. **阶段 1（并发）**
   - Agent A 完成挂载壳层与日志/渲染基础。
   - Agent B 完成 Tab1 与页面流转。
   - Agent C 完成状态机与 Tab2 回滚闭环。
3. **阶段 2（串行集成）**
   - 合并 Agent A -> B -> C（先基础再交互再状态）。
   - 执行集成测试与联调修复。

## DoD 与验收清单

- DoD（每个 agent 通用）：
  - 仅修改各自边界目录。
  - 关键路径有对应测试或可复现实测步骤。
  - 无新增 lint error。
  - 错误提示符合 `toastr.error + 错误码前置` 规范。

- 验收清单（集成后）：
  - 入口在 `.extraMesButtons` 单实例挂载，重复初始化不重复绑定。
  - 弹窗 3 Tab 正常；默认 Tab1。
  - 文件/文件夹动作按类型严格限制。
  - 阅读/编辑/幻灯片三条路径可进可退。
  - 编辑页未保存离开会提示；强制退出不保存。
  - Tab2 回滚成功会刷新文件树/阅读/编辑。
  - Tab3 日志分页为 20/页；手动刷新与事件自动刷新可用。
  - `toastr.error` 均带前置错误码。

## 合并与回滚策略

- 合并策略：
  - 每个 agent 先提交独立分支，按阶段顺序合并。
  - 出现共享文件冲突时，以“共享契约”定义为准，不在冲突现场临时改协议。
- 失败回滚：
  - 保留 feature flag，允许快速关闭新 VFS 入口。
  - 若集成后出现严重问题，按合并逆序回退（C -> B -> A）。
  - 渲染链路异常时回退到旧渲染 fallback。
