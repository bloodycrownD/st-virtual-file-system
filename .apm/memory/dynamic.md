---
createdAt: '2026-05-16 20:10:47'
updatedAt: '2026-05-17 20:14:19'
---
【状态】v1.0.7 已发布并推送：feature/vfs-preview-markdown-only 已 fast-forward 合并 master，远程 tag v1.0.7。上一版 v1.0.6 已含 ZIP 全库导入/导出（vfs-archive、VfsMainScreen 确认框）。

【本版交付】预览分流：isVfsMarkdownPreviewPath 仅认 .md；renderPlainTextDocument 输出 div.vfs-plain-text（避免 Reader 对 pre 的 code-block 暗底）。EditorScreen/ReaderScreen/SlideshowScreen/VfsMainScreen 传递 filePath。源码行号栏 VS Code 风格：editor-line-mirror 同步 textarea 文本列宽，resolveEditorVisualRowCounts 计软换行视觉行数，LineNumberGutter 续行留空、首行显示行号，栏宽 flex 0 0 35px；composable useEditorLineHeightSync.ts。

【知识库】Iterations/VFS-Preview-Markdown-Only/prd+spec；ZIP 文档 VFS-Zip-Import-Export/。

【下一步】无阻塞；新迭代从 PRD/SPEC 起。会话开始 apm read；发布前 npm run test:run；批量改 .apm/kb/docs 后 apm kb index rebuild。
