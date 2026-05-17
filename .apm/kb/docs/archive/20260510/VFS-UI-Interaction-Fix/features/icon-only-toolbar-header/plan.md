# icon-only-toolbar-header 设计方案

## 设计目标

- 删除文件管理面板头部的冗余文字标题位，但保留面板图标入口。
- 将 files tab 调整为 icon-only（去掉可见文字标签）。
- 保持现有 icon-only 交互模型，不引入新的文本入口。
- 确保调整后 desktop/mobile 布局稳定、紧凑、可读。

## 总体方案

### 1) 头部结构保留图标、移除文字

- 在 `VfsFileManagerPanel.vue` 中定位 panel-title 对应节点。
- 仅移除“文件管理器”可见文字节点，保留现有 panel icon。
- 保留 Up 按钮与 `VfsActionMenu` 按钮组，不改其交互逻辑。

### 2) Tab 文案改为 icon-only

- 定位 files tab 中“文件管理器”可见文字来源。
- 移除该可见文字，保留 tab 图标与交互行为。
- 不调整其它 tab 的语义与结构。

### 3) 布局回收

- 调整 header 内部 flex 分布，避免标题移除后出现空洞：
  - 若当前为“左组(标题+Up) / 右组(更多)”结构，改为“左组(Up+路径) / 右组(更多)”。
  - 统一 gap、align-items、min-height 等关键样式，保持视觉平衡。

### 4) 作用域控制

- 样式修改优先放在组件 scoped 样式或现有 VFS 弹窗作用域内。
- 避免改动全局 `menu_button/mes_button` 通用规则，防止外溢影响。

## 最终项目结构

```text
docs/Iterations/VFS-UI-Interaction-Fix/features/icon-only-toolbar-header/
  spec.md
  plan.md

src/app/components/business-components/
  VfsFileManagerPanel.vue   # 头部保留图标 + 移除标题文字 + 布局回收
...                         # files tab 对应组件（移除可见文字）
```

## 变更点清单

- `src/app/components/business-components/VfsFileManagerPanel.vue`
  - 删除“文件管理器”标题文字 DOM（panel-title）
  - 保留 panel icon 可见
  - 调整 header 分组/间距样式，消除冗余占位

- files tab 对应组件
  - 移除“文件管理器”可见文字，保留 tab 图标
  - 验证 desktop/mobile 下 tab 对齐与点击行为不变

- （可选）`test/vfs-ui-cr-loop.spec.ts`
  - 增加断言：头部图标保留且不再出现“文件管理器”可见文案
  - 增加断言：files tab 为 icon-only 且可交互
  - 增加断言：Up 与更多操作仍可见并可交互

## 详细实现步骤

1. 移除 `VfsFileManagerPanel` 的“文件管理器”可见文字，保留 panel icon。
2. 调整 files tab 为 icon-only（去掉可见文字）。
3. 调整 header / tab 的 flex/gap/对齐样式，保证无空位与错位。
4. 回归验证 desktop/mobile 布局。
5. （若已有对应测试）补充或更新断言，覆盖“头部保留图标 + files tab icon-only + 操作入口保留”。

## 测试策略

### 测试用例

- **TC-1 无文字标题**
  - 打开文件管理面板，头部不出现“文件管理器”可见文字，且 panel icon 可见。

- **TC-2 files tab icon-only**
  - files tab 不出现“文件管理器”可见文字，图标可见可点击。

- **TC-3 操作可用**
  - Up 与更多操作图标仍可点击，功能不回归。

- **TC-4 布局平衡**
  - desktop/mobile 下头部与 tab 无异常留白、无错位，间距一致。

## 风险与回滚方案

- **风险**：移除可见文字后，用户对区域语义更依赖图标与 tooltip。
  - 缓解：确保 panel icon/files tab/Up/更多操作保留稳定 `title/aria-label`。
- **回滚**：
  - 单文件回滚 `VfsFileManagerPanel.vue` 即可恢复标题位。
