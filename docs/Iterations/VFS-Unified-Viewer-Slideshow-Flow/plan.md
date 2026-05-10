# VFS-Unified-Viewer-Slideshow-Flow 设计方案

## 设计目标

- 将文件“查看效果（open）”与目录“幻灯片（open-slideshow）”统一到一个内容查看 UI（统一 preview shell）。
- 顶部按钮统一为：返回 / 编辑 / 预览 / Prev / Next。
- `Prev/Next` 固定在当前目录文件序列内翻页。
- 引入“入口来源上下文”并保障返回行为：从哪里进入就回哪里。

## 总体方案

基于当前 `VfsMainScreen` 已有的统一预览容器（`.vfs-preview-stack + .vfs-preview-top-bar`）继续收敛，不新增新页面组件：

1. **统一模式为一个“浏览态”入口**
   - 保留内部 `mode` 枚举，但将文件打开与目录幻灯片都路由到同一预览交互主干。
   - `open`（file）和 `open-slideshow`（directory）进入后都初始化同一套“当前目录文件序列 + 当前文件游标”。

2. **单一数据模型驱动 UI**
   - 用统一状态管理“目录上下文、文件序列、当前文件、来源上下文”：
     - `viewerDirectoryPath`
     - `viewerFilePaths[]`
     - `viewerIndex`
     - `viewerOrigin`（file-open / dir-slideshow）
   - `EditorScreen` 与 `SlideshowScreen` 都由同一个当前文件内容源驱动，避免模式间数据不一致。

3. **返回路由由来源上下文控制**
   - 进入预览时记录 `viewerOrigin` 和返回所需参数（例如来源目录/来源实体 path）。
   - 返回时按 origin 精确回落；若 origin 上下文失效，降级到文件列表（`list`）。

## 最终项目结构

- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 统一入口与状态源（open/open-slideshow）
  - 顶部按钮集合统一渲染
  - 来源上下文记录与返回路由实现
- `src/app/screens/pure-screens/SlideshowScreen.vue`
  - 继续作为“渲染当前页内容”的轻组件（不承载路由/来源逻辑）
- `src/app/components/business-components/VfsActionMenu.vue`
  - 保持动作入口语义；必要时仅调整 label/触发行为注释
- `src/app/composables/components-composables/useVfsFileManagerModel.ts`
  - 如需新增/收敛 action 语义，在此同步约束
- `test/vfs-ui-cr-loop.spec.ts`
  - 增加统一流与返回路由回归用例

## 变更点清单

1. **统一预览顶部按钮**
   - 当前代码里 `mode === 'editor'` 与 `mode === 'slideshow'` 使用不同按钮子集。
   - 调整为统一按钮集合（返回/编辑/预览/Prev/Next），仅按状态启用/禁用。

2. **open / open-slideshow 入口对齐**
   - `handleEntityAction('open')` 当前直接进 editor。
   - `handleEntityAction('open-slideshow')` 当前直接进 slideshow。
   - 改造为都初始化同一 viewer 状态，并进入统一 preview 主链路。

3. **当前目录序列翻页**
   - 复用 `listDirectoryEntries(...)` 与 snapshot 数据，构建当前目录文件列表（保持排序一致）。
   - `Prev/Next` 仅在该列表内移动游标，边界禁用。

4. **返回来源追踪**
   - 新增来源上下文结构（建议）：
     - `kind: 'file-open' | 'dir-slideshow'`
     - `originPath`
     - `originDirectoryPath`
   - Back 逻辑先尝试回到 origin；origin 失效（节点不存在/目录失效）时 fallback 到 `list`。

5. **编辑/预览语义统一**
   - “编辑/预览”固定映射到 `EditorScreen` 的 `preview-mode` 开关（源码 textarea <-> 渲染）。
   - 从 slideshow 进入后点击“编辑/预览”也进入同一语义，而非跳到另一套模式逻辑。

## 详细实现步骤

1. 在 `VfsMainScreen.vue` 增加 viewer 统一状态与 `viewerOrigin` 类型定义。
2. 抽取“以某 path 初始化 viewer”方法：
   - 解析目录
   - 生成文件序列
   - 定位当前 index
   - 同步 `activeContextPath/editorContent/savedContent/isDirty`
3. 重写 `open` 与 `open-slideshow` 分支，调用统一初始化函数并设置 origin。
4. 重构顶部栏模板：
   - 统一渲染返回/编辑/预览/Prev/Next
   - 根据当前状态控制按钮禁用与 aria/title
5. 改写 Back 行为：
   - 先走 origin restore
   - 失败降级 `requestModeChange('list')`
6. 让 `SlideshowScreen` 继续仅负责展示当前页（不引入路由行为）。
7. 编写/更新测试后执行 `npm test` 与 `npm run build`。

## 测试策略

- 以 `VfsMainScreen` 集成为主，覆盖入口、按钮、翻页、返回四类行为。
- 保留现有 `SlideshowScreen` 纯展示测试，不在该层验证路由。

### 测试用例

1. **入口统一**
   - 从文件 `open` 与目录 `open-slideshow` 进入后，均出现统一按钮集合。

2. **翻页范围**
   - 在 `/docs` 中从 `docs.md` 进入，Next 到 `other.md`，Prev 回 `docs.md`。
   - 不会跨目录跳转文件。

3. **返回路由**
   - file-open 入口返回到 file-open 来源上下文。
   - dir-slideshow 入口返回到 dir-slideshow 来源上下文。
   - 来源失效时回退到 list（保护性用例）。

4. **编辑/预览语义**
   - 统一按钮中的“编辑/预览”切换 `EditorScreen` 的 `preview-mode`，不触发额外模式漂移。

5. **回归**
   - 现有 unsaved guard、save 成功写回、template scope 规则不回退。

## 风险与回滚方案

- **风险 1：状态耦合增加**
  - `mode + editorPreviewMode + slideshowPageIndex + activeContextPath` 已较复杂，新增 `viewerOrigin` 可能引入状态竞争。
  - **缓解**：集中化初始化函数，禁止多处散写；关键分支补注释。

- **风险 2：返回逻辑回归**
  - 当前返回固定到 list，改为 origin-based 后，容易在边界数据失效时卡住。
  - **缓解**：明确 fallback 到 list，添加 origin 失效测试。

- **风险 3：模板 scope 行为偏移**
  - template scope 的 tab 与 commit 行为有既有限制。
  - **缓解**：在 `scope: template` 下复跑统一入口与保存相关用例。

- **回滚方案**
  - 以单独提交拆分：①状态建模②顶部栏统一③返回路由④测试；
  - 出现严重回归时优先回滚“返回路由提交”，保留 UI 统一提交，减少影响面。

