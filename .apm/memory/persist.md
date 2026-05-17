---
createdAt: '2026-05-16 20:10:47'
updatedAt: '2026-05-17 16:36:37'
---
仓库 st-virtual-file-system v1.0.5。文档唯一源 .apm/kb/docs/（Iterations、archive、Tools、Toolcall、persistence/tmp）；Git 跟踪，.gitignore 仅 .apm/kb/index/ 与 status.json。运行时 Agent 记忆 .apm/memory/（role/persist/dynamic）。架构 src/domain + src/app Vue3；YAML 前置元数据、预览全屏、工作树非根目录默认开。工具双通道：消息 virtual-tool-call + ST vfs_* Function Calling。克隆后 apm kb index rebuild。提交与 tag 仅用户明确要求。测试 npm run test:run。