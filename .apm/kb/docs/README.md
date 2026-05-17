# 项目文档（知识库）

本仓库的 Markdown 文档统一放在 **`.apm/kb/docs/`**（纳入 Git）。检索索引 `.apm/kb/index/` 为本地生成，已加入 `.gitignore`。

## 目录说明

| 路径 | 用途 |
|------|------|
| `Iterations/` | 进行中的迭代 PRD / SPEC |
| `archive/` | 已归档迭代快照 |
| `persistence/` | 长期结论与复盘（原 `memory/persistence`） |
| `tmp/` | 阶段性临时记录（原 `memory/tmp`） |
| `Tools.md` | 虚拟工具（消息标签）使用者说明 |
| `Toolcall.md` | SillyTavern Function Calling API 说明 |

## Agent / 开发者

```bash
apm read                  # 角色 + 记忆 + 联想区
apm kb index rebuild      # 克隆后重建索引（若联想区提示 missing index）
apm kb write --path docs/Iterations/foo/prd.md --text "…"  # 写入须相对 kb/docs
```

新迭代 PRD/SPEC 路径：`.apm/kb/docs/Iterations/<需求名称>/prd.md` / `spec.md`。
