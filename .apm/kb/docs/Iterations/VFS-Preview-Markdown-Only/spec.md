# VFS 预览仅 Markdown 渲染 技术规格（SPEC）

## 设计目标

- **仅 `.md`（大小写不敏感）** 走现有 Markdown + YAML front matter 渲染管线。
- **其它扩展名**（含 `.txt`、`.markdown`）在编辑器预览、只读阅读、幻灯片等所有 `ReaderScreen` 入口以**纯文本**展示（HTML 转义、保留换行），**不**调用 `marked`。
- **预览按钮保留**；非 `.md` 在预览/源码切换时正文一致，仅容器样式不同。
- **不修改** `work-tree-engine.ts` 的 `isMarkdownFile`（仍含 `.markdown`）；本迭代只约束 **UI 阅读路径**。

## 总体方案

### 现状（代码锚点）

| 模块 | 路径 | 现状问题 |
|------|------|----------|
| 渲染管线 | `renderPipeline.ts` | `renderSafeMarkdownDocument` 对任意字符串 `marked.parse` |
| 阅读组件 | `ReaderScreen.vue` | prop `html` 实为**源码**；始终 `renderSafeMarkdownDocument(props.html)` |
| 编辑器预览 | `EditorScreen.vue` L73–75 | `previewMode` 时 `<ReaderScreen :html="model" />`，无路径信息 |
| 主屏 | `VfsMainScreen.vue` L1499–1514 | `reader` / `editor`+`editorPreviewMode` / `slideshow` 三路由共用 `ReaderScreen`（经 Editor 或 Slideshow） |
| 幻灯片 | `SlideshowScreen.vue` L27 | `<ReaderScreen :html="currentPage.content" />`，无 path |
| 打开文件 | `loadViewerFileAt` L738–748 | 固定 `editorPreviewMode = true`、`requestModeChange('editor')` |
| 字数统计 | `previewCharacterCount` L715–719 | 一律 `splitYamlFrontMatter(...).body.length` |
| 工作树（不改） | `work-tree-engine.ts` L84–87 | `isMarkdownFile`: `.md` **与** `.markdown` |

**实际用户路径（v1.0.6）**：双击文件 → `initializeViewer` → `loadViewerFileAt` → **`mode === 'editor'` 且 `editorPreviewMode === true`**。模板中 `mode === 'reader'` / `'slideshow'` 分支仍存在，须在组件层一并修正，避免未来切回模式时回归。

### 目标架构

```text
filePath + raw source
        │
        ▼
isVfsMarkdownPreviewPath(path)   ← 仅 .md（domain 单点）
        │
   ┌────┴────┐
   │ yes     │ no
   ▼         ▼
renderSafeMarkdownDocument   renderPlainTextDocument
   │         │  (escapeHtml + pre-wrap, no marked)
   └────┬────┘
        ▼
   ReaderScreen (v-html safeHtml)
```

- **判定函数**放在 `domain/`，与 work-tree 的 `isMarkdownFile` **分离**，避免 PRD「仅 .md」与工作树「.md + .markdown」互相污染。
- **ReaderScreen** 增加必选 prop `filePath: string`（VFS 绝对路径），内部按路径选择渲染器。
- **EditorScreen** 增加 `filePath` 并传给预览区 `ReaderScreen`。
- **SlideshowScreen** 将 `page.path` 传给 `ReaderScreen`。
- **VfsMainScreen** 向 `EditorScreen` 传入 `activeContextPath`；`reader` 分支传入 `readerHtml` 同源 path。

## 最终项目结构

```text
src/domain/vfs/is-vfs-markdown-preview-path.ts   # 新建：UI 预览 Markdown 判定

src/app/services/vfs/renderPipeline.ts           # 新增 renderPlainTextDocument

src/app/screens/pure-screens/ReaderScreen.vue    # filePath + 分支渲染
src/app/screens/pure-screens/EditorScreen.vue    # 透传 filePath
src/app/screens/pure-screens/SlideshowScreen.vue # 透传 page.path

src/app/screens/business-screens/VfsMainScreen.vue  # filePath、previewCharacterCount

tests/is-vfs-markdown-preview-path.spec.ts       # 新建
tests/render-pipeline-plain.spec.ts              # 新建（或并入 vfs-ui-contracts）
tests/vfs-ui-contracts.spec.ts                   # 更新 ReaderScreen 用例
tests/vfs-preview-markdown-only.spec.ts          # 可选：EditorScreen 挂载 .txt
```

## 变更点清单

| 文件 | 变更 |
|------|------|
| `is-vfs-markdown-preview-path.ts` | **新建** `isVfsMarkdownPreviewPath(path): boolean` |
| `renderPipeline.ts` | **新增** `renderPlainTextDocument(raw)` |
| `ReaderScreen.vue` | props: `source`（或保留 `html` 别名）+ **`filePath`**；computed 分支 |
| `EditorScreen.vue` | prop `filePath` → 预览 `ReaderScreen` |
| `SlideshowScreen.vue` | `ReaderScreen` 增加 `:file-path="currentPage.path"` |
| `VfsMainScreen.vue` | `:file-path="activeContextPath ?? ''"`；调整 `previewCharacterCount` |
| 测试 | 见下文 |

**不改动**：`work-tree-engine.ts`、`ToolDispatcher`、ZIP、Function Calling。

## 详细实现步骤

### 步骤 1：`is-vfs-markdown-preview-path.ts`

```ts
import { basename } from '@/domain/vfs/path-utils'

/**
 * Whether UI read/preview surfaces should run the Markdown renderer.
 * PRD: extension `.md` only (case-insensitive). Not used by work-tree macro.
 */
export function isVfsMarkdownPreviewPath(path: string): boolean {
  const name = basename(path).toLowerCase()
  return name.endsWith('.md')
}
```

- 空路径 / 根：返回 `false`（`basename('/')` → `''`）。
- 单测覆盖：`/a.md`、`/a.MD`、`/a.markdown`、`/a.txt`、`/dir`（若 normalize 后无扩展名）。

### 步骤 2：`renderPlainTextDocument`（`renderPipeline.ts`）

```ts
/**
 * Plain read surface: escape HTML, preserve newlines. No marked, no YAML FM split.
 */
export function renderPlainTextDocument(raw: string): RenderResult {
  const escaped = escapeHtml(raw ?? '')
  const html = `<pre class="vfs-plain-text">${escaped.replace(/\n/g, '<br>')}</pre>`
  return { ok: true, html }
}
```

- 复用 `escapeHtml`（从 `markdown-frontmatter` 导入，已用于 FM 块）。
- **不对**非 `.md` 做 `splitYamlFrontMatter`（整文件即展示内容，与 PRD「与源码一致」一致）。

`ReaderScreen.vue` 增加样式：

```css
.vfs-reader :deep(.vfs-plain-text) {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, ...;
  font-size: 14px;
  line-height: 1.45;
  /* 无 h1/p 排版，避免误用 prose 标题样式 */
}
```

### 步骤 3：`ReaderScreen.vue`

**Props（破坏性但调用点可控）：**

```ts
const props = defineProps<{
  /** Raw file source (misnamed `html` historically). */
  html: string
  /** VFS absolute path used only to pick markdown vs plain renderer. */
  filePath: string
}>()
```

```ts
const safeHtml = computed(() => {
  if (!isVfsMarkdownPreviewPath(props.filePath)) {
    return renderPlainTextDocument(props.html).html ?? ''
  }
  const result = renderSafeMarkdownDocument(props.html)
  // ... existing error toast
})
```

- 非 Markdown 路径下 **不** toast `RENDER_FAILED`（plain 路径不应失败，除非未来扩展）。

### 步骤 4：`EditorScreen.vue`

```ts
defineProps<{
  filePath: string
  // ...existing
}>()
```

```html
<ReaderScreen :html="model" :file-path="props.filePath" />
```

### 步骤 5：`SlideshowScreen.vue`

```html
<ReaderScreen :html="currentPage.content" :file-path="currentPage.path" />
```

### 步骤 6：`VfsMainScreen.vue`

1. **EditorScreen**（约 L1501）：

```html
<EditorScreen
  ...
  :file-path="activeContextPath ?? ''"
/>
```

2. **ReaderScreen**（若启用 `mode === 'reader'`）：

```html
<ReaderScreen
  :html="readerHtml"
  :file-path="activeContextPath ?? ''"
/>
```

3. **`previewCharacterCount`**（L715–719）：

```ts
const previewCharacterCount = computed(() => {
  if (!shouldShowPreviewMetadata.value) return 0
  const path = mode.value === 'slideshow'
    ? (slideshowPages.value[viewerIndex.value]?.path ?? '')
    : (activeContextPath.value ?? '')
  const raw = mode.value === 'slideshow'
    ? (slideshowPages.value[viewerIndex.value]?.content ?? '')
    : editorContent.value
  if (!isVfsMarkdownPreviewPath(path)) return raw.length
  return splitYamlFrontMatter(raw).body.length
})
```

4. **预览按钮**：**不** `v-if` 隐藏；**不**强制在非 `.md` 时把 `editorPreviewMode` 置 false（PRD：按钮保留，预览=原文）。

5. **`loadViewerFileAt`**：保持 `editorPreviewMode = true`；非 `.md` 打开后预览区已是 plain，无需额外分支。

### 步骤 7：测试

#### `tests/is-vfs-markdown-preview-path.spec.ts`

| ID | 用例 |
|----|------|
| T-MD-01 | `/notes/a.md` → true；`/notes/a.MD` → true |
| T-MD-02 | `/notes/a.markdown` → false |
| T-MD-03 | `/notes/readme.txt` → false |

#### `tests/render-pipeline-plain.spec.ts`（或合并到 ui contracts）

| ID | 用例 |
|----|------|
| T-PLAIN-01 | `renderPlainTextDocument('# hi')` 含 `# hi` 或 `&lt;`，**不含** `<h1>` |
| T-PLAIN-02 | 换行保留为 `<br>` 或 `pre-wrap` 可见 |

#### 更新 `vfs-ui-contracts.spec.ts`

- 现有 Reader 用例补充 `filePath: '/x.md'`。
- 新增：`filePath: '/x.txt'`，`html: '# not heading'`，`expect(wrapper.html()).not.toMatch(/<h1/)`，`expect(wrapper.text()).toContain('# not heading')`。

#### 可选 `vfs-preview-markdown-only.spec.ts`

- mount `EditorScreen` with `filePath='/a.txt'`, `previewMode=true`，断言无 markdown 标题元素。

## 测试策略

- 实现后：`npm run test:run -- tests/is-vfs-markdown-preview-path.spec.ts tests/render-pipeline-plain.spec.ts tests/vfs-ui-contracts.spec.ts`
- 发布前：`npm run test:run` + `npm run build`

### 手工验收（对齐 PRD）

1. `/test.txt` 内容 `# 不是标题` → 预览与编辑区均显示字面文本。
2. `/test.md` 同内容 → 预览为 H1。
3. `/x.markdown` → 同 `.txt` 纯文本。
4. 目录幻灯片（若从 UI 进入）：`.md` 页渲染，`.txt` 页纯文本。

## 风险与回滚方案

| 风险 | 缓解 |
|------|------|
| `ReaderScreen` 新增必填 `filePath`，漏传导致全走 plain | TypeScript + 测试覆盖所有 mount 点；默认可考虑 `filePath` 缺省为 `''` → plain（安全侧） |
| `.markdown` 在 UI 不再渲染，与工作树宏不一致 | PRD 明确；SPEC 文档说明，不合并 `isMarkdownFile` |
| `reader`/`slideshow` 模式当前少用 | 仍改 SlideshowScreen / 模板 reader 分支，防死代码回归 |
| 非 `.md` 带 `---` YAML _fence 显示为原文 | 符合 PRD，不做 FM 拆分 |

**回滚**：删除 `is-vfs-markdown-preview-path` 与 `renderPlainTextDocument`，`ReaderScreen` 恢复始终 `renderSafeMarkdownDocument` 即可。

## 兼容性或迁移说明

- 无持久化 schema 变更。
- 对外 API（虚拟工具、宏）无变更。
- `.md` 渲染路径（含 YAML 顶栏、字数统计 body 口径）保持不变。

## 分步骤实现顺序（建议）

1. `is-vfs-markdown-preview-path.ts` + 单测  
2. `renderPlainTextDocument` + 单测  
3. `ReaderScreen` + 样式  
4. `EditorScreen` / `SlideshowScreen` / `VfsMainScreen` 传参  
5. `previewCharacterCount` 调整  
6. 全量 `npm run test:run`

---

**请确认本 SPEC 后再进入编码。**
