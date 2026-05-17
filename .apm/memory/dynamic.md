---
createdAt: '2026-05-16 20:10:47'
updatedAt: '2026-05-17 16:36:26'
---
【状态】v1.0.5 已发布（tag v1.0.5）：YAML/字数、全屏、目录规则默认开、ST Function Calling（vfs_* 七工具）。文档树已迁入 .apm/kb/docs/ 并纳入 Git；仓库根 docs/、memory/ 已删除。

【知识库】唯一文档源：.apm/kb/docs/（Iterations、archive、Tools、Toolcall、persistence、tmp）。.gitignore 仅忽略 .apm/kb/index/ 与 .apm/status.json；克隆后 apm kb index rebuild。

【工作流】PRD/SPEC → .apm/kb/docs/Iterations/<名>/；复盘 → .apm/kb/docs/persistence/；归档 → .apm/kb/docs/archive/。改 md 后 rebuild 索引。运行时记忆仍在 .apm/memory/（role/persist/dynamic）。

【代码锚点】vfs-function-tool-registry、subscribeVfsFunctionToolGateSync、markdown-frontmatter、useVfsPreviewFullscreen。

【下一步】新需求开 feature 分支；会话 apm read；skills 路径已改为 .apm/kb/docs。