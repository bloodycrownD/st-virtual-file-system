# YAML 展示优化与正文字数统计 技术规格（SPEC）

## 设计目标

- **对齐 PRD**：元数据区与正文分层、长摘要可控；右下角展示「正文全字符数（含空白标点，不含 front matter）」；不对键名做任何数据层改写。
- **对齐现状代码**：在现有 `marked` + `sanitizeLoose` + `ReaderScreen` / `VfsMainScreen` 预览栈上增量演进，避免第二套渲染器分叉。

## 总体方案

### 根因（代码侧已验证）

`ReaderScreen` 将整段 Markdown（`props.html` 实际为 **Markdown 源码**，见 `VfsMainScreen` 中 `readerHtml = computed(() => editorContent.value)`）交给 `renderSafeContent` → `marked.parse`。对典型 front matter：

```text
---
a: 1
b: 2
---
正文
```

`marked`（v18，GFM）会输出类似 `<hr><h2>a: 1<br>b: 2</h2><p>正文</p>`，即 **整块元数据被合成一个 `h2`**，再叠加宿主/`.prose` 样式即出现「标题级、抢眼」的元数据区（与 PRD 截图现象一致）。  
**结论**：仅靠 CSS 微调 `h2` 无法稳定满足「键值层次 + 长字段可控」；应在进入 `marked` 之前 **剥离** 首段 YAML fence，并对剥离段做 **受控 HTML 拼装**，正文仍走 `marked` + `sanitizeLoose`。

### 架构

1. **纯函数层（新建）**：`splitYamlFrontMatter(raw)`  
   - 判定规则与 `work-tree-engine.ts` 内 `frontMatterDisplayLines` **一致**：首行 trim 为 `---`；自下一行起寻找下一行 trim 为 `---` 的闭合行；命中则中间为 front matter 文本，其后（自闭合行下一行起，含前导换行规则在实现中一次性定义）为 **body**。  
   - 未命中则 `frontMatter: null`，`body = raw`（与当前行为兼容）。

2. **渲染层（扩展 `renderPipeline` 或紧邻新模块）**：  
   - 输入：整段 Markdown 字符串。  
   - 若有 front matter：生成 **仅含白名单标签** 的 HTML 片段（建议外层 `div.vfs-md-frontmatter`，内层行式结构），**所有用户文本经 HTML escape** 后再拼接；正文部分 `marked.parse(body)`，与现有 `sanitizeLoose` 拼接或分段 sanitize 后拼接（见下文 DOMPurify 约束）。  
   - 若无 front matter：行为与当前 `renderSafeContent` 一致。

3. **展示层（`ReaderScreen.vue`）**：  
   - 将 `safeHtml` 的计算从「仅 `renderSafeContent(props.html)`」改为调用上述「Markdown + optional FM」入口，保持对外 props 名 **`html` 不变**（避免大面积重命名；可在 SPEC/代码注释中标明实为 Markdown）。

4. **字数统计（`VfsMainScreen.vue`）**：  
   - 新增 `computed`：对 **当前预览所依据的 Markdown 字符串** 取 `splitYamlFrontMatter` 的 `body`，`body.length` 即为 PRD 口径（UTF-16 code unit 长度，与 JS `String#length` 一致；与本项目存储的 JS 字符串一致）。  
   - **reader / editor（预览开）**：使用 `editorContent`。  
   - **slideshow**：使用 `slideshowPages[viewerIndex]?.content`（与 `SlideshowScreen` 当前页一致），**不**使用可能未打开的其它页缓存。  
   - **editor 源码模式**（`shouldShowPreviewMetadata === false`）：页脚不展示，无需计算（与现逻辑一致）。

5. **页脚样式**：在 `.vfs-preview-meta` 增加第三段「字数」展示；为满足 PRD「窄窗可换行、信息完整」，需放宽当前 `white-space: nowrap` 策略，改为 `flex-wrap: wrap` + `justify-content: flex-end` + `row-gap`，并视需要微调 `vfs-preview-content-frame--meta-anchored` 的 `padding-bottom`。

### DOMPurify 白名单约束（必须）

`sanitizeConfig.ts` 的 `ALLOWED_TAGS` **不含** `aside`、`details`、`summary` 等。  
**因此** front matter 容器与交互元素必须优先使用已允许标签（**`div`/`span`/`br`/`p` 等**）。若确需 `details`/`summary` 做折叠，必须把对应标签 **加入** `ALLOWED_TAGS` 并在 `ALLOWED_ATTR` 中保持最小属性集；否则实现阶段会发现内容被剥离。

## 最终项目结构

```
src/
  app/
    screens/
      business-screens/
        VfsMainScreen.vue          # 页脚文案 + character count computed + 样式类微调
      pure-screens/
        ReaderScreen.vue           # 调用新渲染入口；:deep 样式针对 .vfs-md-frontmatter*
    services/
      vfs/
        renderPipeline.ts          # 扩展：导出「含 FM 的 Markdown → HTML」主入口（或内部调用新文件）
        sanitizeConfig.ts          # 按需扩展 ALLOWED_TAGS（仅当采用 details/summary 等）
    …
  domain/
    markdown/
      markdown-frontmatter.ts      # 新建：splitYamlFrontmatter +（可选）buildFrontMatterRows / escapeHtml
  …
tests/
  markdown-frontmatter.test.ts     # 新建：拆分、字数、marked 不再生成 FM 的 h2
  vfs-ui-cr-loop.spec.ts           # 更新：meta 区段断言改用 data-testid，避免 span 顺序脆弱
```

（可选后续）将 `work-tree-engine.ts` 内 `frontMatterDisplayLines` 的 fence 扫描改为调用 `splitYamlFrontMatter`，消除重复算法；**非本需求阻塞**，属整洁度重构。

## 变更点清单

| 区域 | 文件 | 变更摘要 |
|------|------|----------|
| 领域纯函数 | `src/domain/markdown/markdown-frontmatter.ts` | 新建：`splitYamlFrontMatter`；供渲染、字数、未来 work-tree 复用 |
| 渲染 | `src/app/services/vfs/renderPipeline.ts` | 新增 `renderSafeMarkdownDocument`（名称以最终实现为准）：FM HTML + `marked` body + `sanitizeLoose` |
| 读屏 | `src/app/screens/pure-screens/ReaderScreen.vue` | 使用新渲染入口；scoped `:deep` 定义 `.vfs-md-frontmatter` 卡片/键值/长文折叠或 line-clamp |
| 预览壳 | `src/app/screens/business-screens/VfsMainScreen.vue` | 页脚增加「字数: N」；`title` 属性同步；`computed` 绑定上述字数；为 meta 子项加 `data-testid` |
| 安全 | `src/app/services/vfs/sanitizeConfig.ts` | 仅在实际采用新标签时扩展白名单 |
| 测试 | `tests/markdown-frontmatter.test.ts` | 覆盖 split、计数、渲染无 `<h2>` 误伤 |
| 测试 | `tests/vfs-ui-cr-loop.spec.ts` | 更新「localized datetime」等依赖 `span` 下标的用例 |

**不在本 SPEC 默认范围内**：`SlideshowScreen.test.ts` 中 props 名为 `content` 且示例传 HTML —— 与生产一致传 Markdown 的命名/注释可顺手澄清，但非功能必需。

## 详细实现步骤

1. **实现 `splitYamlFrontMatter(raw: string)`**  
   - 返回 `{ frontMatterText: string | null, body: string }` 或等价结构。  
   - 边界：`---` 后无闭合 → 视为无 FM。  
   - 与 `frontMatterDisplayLines` 行为对齐（同一输入下 fence 判定一致）。

2. **实现 FM → HTML（安全字符串）**  
   - 将 `frontMatterText` 按行解析为展示行：  
     - 首版推荐：`^\s*([^:\n]+?)\s*:\s*(.*)$` 识别键值行；不匹配的非空行作为 **上一键值的续行**（`'\n' + line` 拼接），以支持多行摘要。  
     - **不**引入 YAML 库；不解析 `|`、`>`、`#` 等 YAML 语法。  
   - 每键、每值 `escapeHtml`；结构用 `div`/`span`。  
   - 长值：CSS `-webkit-line-clamp` + 「展开」：`details/summary`（若加白名单）或纯 CSS `max-height` + `button`（需 JS 则改为 Vue 内组件 — **本 SPEC 优先无状态 HTML + CSS/details**，避免在 `renderPipeline` 内引入 Vue）。

3. **扩展 `renderPipeline`**  
   - 组合：`fmHtml + sanitizeLoose(marked.parse(body))`（若 `fmHtml` 已仅含安全字符，可仍整体 `sanitizeLoose` 一次以统一钩子）。  
   - 保持现有错误处理与 `RenderResult` 形状。

4. **更新 `ReaderScreen.vue`**  
   - `safeHtml` 调用新入口。  
   - `:deep(.vfs-md-frontmatter)`：较小字号、弱化色、边框/背景与 `.vfs-reader` 正文区分；键 `font-weight`、值 `opacity`/颜色层级。

5. **更新 `VfsMainScreen.vue`**  
   - `previewCharacterCount`（命名以代码风格为准）：按模式选择字符串 → `splitYamlFrontMatter` → `.body.length`。  
   - 模板：`字数: {{ previewCharacterCount }}`（或「字符」若产品 copy 已定）；`data-testid="vfs-preview-meta-char-count"`。  
   - `:title` 拼接第三段，便于 hover 全览。

6. **页脚布局 CSS**  
   - 调整 `.vfs-preview-meta`：允许换行、右对齐、列间距；校验 `meta-anchored` / `meta-flow` 两种模式。  
   - 视换行高度增加 `vfs-preview-content-frame--meta-anchored` 的 `padding-bottom`，避免遮挡。

7. **（可选）work-tree 去重**  
   - 抽出公共 fence 逻辑后替换 `frontMatterDisplayLines` 内部扫描。

## 测试策略

### 测试用例

**单元（`markdown-frontmatter.test.ts`）**

1. **无 FM**：`body === raw`，`frontMatterText === null`。  
2. **标准 FM**：三段式样本，`body` 不含 fence 内文本；`frontMatterText` 含键行。  
3. **字数口径**：`body` 含空格/换行/标点时，`body.length` 等于预期常数。  
4. **渲染回归**：对同一样本调用渲染入口，输出 HTML **不包含** `strory_time` 等与 FM 绑在一起的 `<h2>`（可断言无 `<h2>` 或断言 FM 键出现在 `vfs-md-frontmatter` 容器内而不在 `h2`）。  
5. **续行**：`key: line1` 下一行无冒号时并入 value。

**组件/集成（`vfs-ui-cr-loop.spec.ts`）**

1. `renders preview metadata...`：断言存在 `data-testid="vfs-preview-meta-char-count"` 且文本含 `字数`。  
2. `renders localized datetime...`：改为通过 `data-testid`（新建）定位创建/更新，**禁止**依赖 `span` 固定下标。  
3. **窄窗 meta flow**（已有）：仍通过；必要时断言第三段在可视结构中存在。

**手动走查（PRD）**

- 典型中文 FM + 长摘要：首屏层次、展开/折行可读。  
- editor 预览开关：预览开时字数随 `editorContent` 变化；关时页脚消失。

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| DOMPurify 剥离新 FM 标签 | 优先只用已允许标签；集成后快照一段 FM HTML 跑 sanitize | 收紧标签集 |
| `splitYamlFrontMatter` 与 work-tree 判定漂移 | 单测对照同一夹具；可选抽共享函数 | 恢复独立实现并文档标注 |
| 续行启发式与真 YAML 不完全一致 | PRD 已排除复杂 YAML；README/注释说明限制 | 无 |
| 页脚换行后遮挡正文 | 调大 anchored padding；flow 模式测高 | 恢复较小 padding |

---

**编码前请确认本 `spec.md`**。若你希望页脚固定顺序为「字数 | 创建 | 更新」或 copy 使用「字符」而非「字数」，确认后实现阶段一次性对齐文案与测试。
