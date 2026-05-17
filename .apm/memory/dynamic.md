---
createdAt: '2026-05-16 20:10:47'
updatedAt: '2026-05-17 17:09:04'
---
【状态】v1.0.5 已发布。进行中：VFS-Zip-Import-Export（PRD+SPEC 已定稿，待用户确认 SPEC 后编码）。

【迭代要点】文件列表顶栏「覆盖」旁增导出/导入；全 VFS 文件树↔ZIP（仅文本文件）；导入=全量替换+确认框；chat 清空 logs/checkpoints（同覆盖）；template 仅换 extensionTemplateVfsSnapshot；ZIP 不含 workTree；空库导出不下载。

【实现锚点】src/app/services/vfs-archive/（vfs-zip-path、vfs-zip-archive、trigger-browser-download）；VfsMainScreen 导出/导入+import-replace 确认；pruneWorkTreeForSnapshot。

【知识库】唯一源 .apm/kb/docs/；.gitignore 仅 index/ 与 status.json；改 md 后 apm kb index rebuild。

【下一步】确认 spec.md → feature 分支实现 → npm run test:run。