# VFS-Style-Optimization 设计方案

## 设计目标

- 在不改动现有文件浏览/切换交互链路的前提下，提升预览界面的信息层次与阅读体验。
- 为预览态补充创建时间/更新时间并采用本地化短日期格式。
- 统一标题、正文容器与排版风格，修复换行导致的右侧异常留白。
- 改动覆盖 VFS 文件管理相关面板中的内容展示区域（Reader/Editor 预览/Slideshow 复用链路）。

## 总体方案

基于当前代码结构，样式优化按“数据补全 + 预览壳层布局调整 + 阅读组件排版增强”三层实施：

1. **数据层（VfsMainScreen）**
   - 复用现有 `getNodeByPath`、`activeContextPath` 与 `currentSnapshot`，新增当前预览文件的时间元信息计算。
   - 时间格式通过 `Intl.DateTimeFormat`（`dateStyle: 'short', timeStyle: 'short'`）生成本地化文本；缺值时按约定降级展示。

2. **壳层层（VfsMainScreen 预览区）**
   - 在 `vfs-preview-top-bar` 保留现有返回/操作按钮结构，仅增强标题字重字号。
   - 在 `vfs-preview-body` 内增加“元信息行（右下角优先）+ 正文容器边框层”，避免影响现有 `ReaderScreen` / `EditorScreen` / `SlideshowScreen` 的挂载方式。

3. **内容层（ReaderScreen）**
   - 保留 `renderSafeContent` 渲染路径，增强排版（段落间距、行高、长词换行、宽度策略）。
   - 去除导致右侧留白的固定阅读宽度约束（当前 `max-width: 78ch`），改为容器自适应与安全换行策略。

## 最终项目结构

- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 新增：当前预览文件时间元信息计算与格式化。
  - 调整：预览标题样式、正文容器包裹层、元信息展示区。
- `src/app/screens/pure-screens/ReaderScreen.vue`
  - 调整：阅读排版与换行策略、容器宽度策略。
- `test/vfs-ui-cr-loop.spec.ts`
  - 新增/更新：标题样式类、时间元信息可见性、正文容器边框类、右侧空白回归（通过 class/DOM 断言与布局约束断言）。

## 变更点清单

1. **预览标题强化**
   - 文件：`VfsMainScreen.vue`
   - 现状：`.vfs-preview-file-title` 仅 `opacity` 与省略，未显式强调字重与字号。
   - 变更：增加更高字重（如 600/700）与略大字号（如 `1.05rem ~ 1.1rem`），保持居中与截断行为。

2. **创建/更新时间展示**
   - 文件：`VfsMainScreen.vue`
   - 现状：`listDirectoryEntries` 已携带 `ctime/mtime`，但预览区未展示。
   - 变更：
     - 基于当前预览目标（`activeContextPath`）读取文件节点 `ctime/mtime`。
     - 新增小号字体元信息块，布局优先右下角；在高度受限时降级到正文容器底部右对齐。

3. **正文边框隔离**
   - 文件：`VfsMainScreen.vue`（预览容器外层）+ `ReaderScreen.vue`（内层细节）
   - 现状：正文直接落在页面上，隔离感不足。
   - 变更：新增与现有主题一致的边框+轻背景容器（延续项目中 `rgba(255,255,255,0.12)` / `rgba(0,0,0,0.18~0.25)` 体系）。

4. **文本换行与右侧空白修复**
   - 文件：`ReaderScreen.vue`
   - 现状：`max-width: 78ch` 容易在宽容器下产生右侧大面积空白；长串文本换行策略不够强。
   - 变更：
     - 取消固定 `max-width` 上限或改为响应式上限策略。
     - 增加 `overflow-wrap: anywhere; word-break: break-word; white-space` 合理策略（不破坏原有段落语义）。
     - 保留类 Markdown 排版（标题、段落、代码块、引用等）并适度增强行距/段距。

5. **复用链路兼容性**
   - 文件：`EditorScreen.vue`、`SlideshowScreen.vue`（仅确认，无结构改造）
   - 说明：两者都复用 `ReaderScreen`；本次重点避免破坏 editor 预览与 slideshow 的滚动行为。

## 详细实现步骤

1. 在 `VfsMainScreen.vue` 新增 `computed`：
   - 当前预览文件节点（file-only）。
   - `createdAtText` / `updatedAtText`（`Intl.DateTimeFormat` 本地化格式化）。
2. 在预览模板中插入元信息展示区：
   - 仅在存在预览文件时显示。
   - 默认右下角小字样式（次级信息层级）。
3. 强化 `vfs-preview-file-title` 样式：
   - 增加字重与字号，保持 ellipsis 与中心定位逻辑。
4. 给预览正文增加统一容器（边框/圆角/内边距/背景）：
   - 包裹 `ReaderScreen`、`EditorScreen` 和 `SlideshowScreen` 的内容区，确保视觉一致。
5. 在 `ReaderScreen.vue` 调整排版：
   - 修复宽度与换行策略，增强类 Markdown 可读性。
6. 回归验证 `EditorScreen` 与 `SlideshowScreen`：
   - 确认按钮区、内容区滚动、切页逻辑无回归。
7. 更新测试：
   - 补充 UI 用例，覆盖标题层级、时间信息、边框容器、换行空白相关断言。

## 测试策略

- **单测/组件集成测试**：在 `test/vfs-ui-cr-loop.spec.ts` 增加预览样式与元信息断言。
- **回归测试重点**：
  - 文件列表进入预览、返回列表、切页、保存流程保持可用。
  - `ReaderScreen` 在超长文本（无空格长串）下不撑出异常空白。
  - `template` 与 `chat` 两个 scope 下表现一致。

### 测试用例

1. 打开文件预览后，顶部标题存在并使用强化样式类（或样式属性断言）。
2. 预览区显示“创建时间/更新时间”两项，文本为本地化短日期时间格式。
3. 正文外围存在边框容器类，且 Reader/Editor 预览均复用。
4. 输入超长连续字符内容时，正文区域不产生明显右侧空白（宽度利用正常）。
5. 切换到 slideshow 后同样保持边框和排版策略，不影响前后页导航按钮可用性。

## 风险与回滚方案

- 风险 1：不同系统 locale 导致时间字符串长度差异，可能挤压顶部布局。  
  - 缓解：元信息放在正文区右下角，不占用顶部按钮主行。
- 风险 2：换行策略过强影响代码块可读性。  
  - 缓解：仅对正文段落与普通文本强化换行，`pre/code` 维持独立滚动策略。
- 风险 3：新增容器导致嵌套滚动体验变化。  
  - 缓解：保持现有 `min-height:0` 与 `overflow:auto` 约束链，不改动导航交互。

- 回滚方案：
  1. 若排版/滚动回归，先回滚 `ReaderScreen.vue` 的宽度与换行改动；
  2. 若仅视觉争议，保留时间数据逻辑，回滚边框/字号样式改动；
  3. 通过独立提交拆分（数据逻辑 vs 样式）保证可快速选择性回退。
