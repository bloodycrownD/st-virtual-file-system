# 虚拟工作树 UI 总览索引（精简版）

本文件仅保留跨文档统一约束与决策，不再承载详细需求正文。  
详细内容请以 3 份子 spec 为准。

## 子 Spec 索引

- 交互与信息架构：`docs/Iterations/虚拟工作树UI所见即所得/spec-ui-ia.md`
- 状态机与提交回滚：`docs/Iterations/虚拟工作树UI所见即所得/spec-state-history.md`
- 挂载与工程实现：`docs/Iterations/虚拟工作树UI所见即所得/spec-engineering-mount.md`

## 全局统一决策（跨文档）

- 挂载：`.extraMesButtons` + jQuery，采用幂等挂载检查与 on/off 成对清理。
- 交互：编辑页未保存离开必须提示；强制退出不保存。
- 日志：仅分页，默认每页 `20` 条；默认手动刷新，消息编辑/收到消息事件触发自动刷新一次。
- 渲染：阅读页与预览页共用链路，sanitize 默认 `loose`，高风险能力默认禁用。
- 回滚：不做前置冲突拦截，按执行阶段结果判定；回滚成功记为新提交。
- 错误反馈：统一官方 `toastr`；仅 `toastr.error` 展示错误码；格式固定为 `[E_<REASON>] 人类可读错误信息`；不提供重试按钮。
- 参考策略：仅参考 `st-better-database` 样式与交互文案，不复用其实现结构。

## 执行顺序建议

1. 先实现挂载与弹窗壳层（`spec-engineering-mount.md`）。
2. 再实现 Tab1 交互流转（`spec-ui-ia.md`）。
3. 最后补齐提交/回滚状态一致性（`spec-state-history.md`）。

## 仍需验证项

- `loose` sanitize 需通过安全样本联调回归验证。
