# VFS 文本编辑行号 — 实施计划（plan）

轻量计划文档，与 `prd.md` / `spec.md` 一致；用于归档迭代范围与验证顺序。

## 阶段与产出

| 阶段 | 内容 | 产出 |
|------|------|------|
| 1 | 组件与源码集成 | `LineNumberGutter.vue` + `EditorScreen` 仅源码分支 |
| 2 | 阅读/预览不展示行号 | `ReaderScreen` 无 gutter；幻灯片继承 |
| 3 | 视觉收敛 | VS Code 风格：透明底、无竖条、等宽淡色数字 |
| 4 | 测试与构建 | `vfs-line-numbers.spec.ts`、`vfs-ui-cr-loop.spec.ts`；`npm run build` |

## 验证清单（合并前）

- [ ] `npm run test -- test/vfs-line-numbers.spec.ts test/vfs-ui-cr-loop.spec.ts`
- [ ] `npm run build`
- [ ] 手工：源码 ↔ 预览切换，确认仅源码有行号、预览无行号条

## 集成

- 本迭代文稿已落盘于 `docs/archive/20260511/VFS-Text-Edit-Read-Line-Numbers/`（与 `prd.md` / `spec.md` / `plan.md` 同目录快照）。
