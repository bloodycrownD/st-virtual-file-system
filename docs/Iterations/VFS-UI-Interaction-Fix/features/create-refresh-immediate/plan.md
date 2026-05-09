# create-refresh-immediate 设计方案

## 设计目标

- 确保“新建文件/文件夹”成功后，当前目录列表即时更新。
- 明确本迭代只处理刷新时序，不引入失败路径新行为。
- 在 chat/template 与 desktop/mobile 中统一表现。

## 总体方案

### 1) 明确刷新触发点

- 以 `VfsMainScreen` 的创建成功分支为唯一刷新触发入口：
  - 创建成功后执行统一的视图同步逻辑（例如现有 `refreshAuthoritativeState` / `refreshAllViews` 路径）。
  - 保证目录项计算与列表渲染依赖的状态在同一时序内更新。

### 2) 保持目录上下文稳定

- 创建成功后仅更新当前目录内容与选择态，不变更 `currentDirectoryPath`。
- 维持现有“关闭创建弹窗”的成功行为，不引入额外跳转。

### 3) 失败路径不改

- 失败路径沿用当前基线实现，不在本迭代新增校验或错误映射变更。
- 创建失败时继续按既有行为处理；本迭代仅要求成功路径触发即时刷新。

## 最终项目结构

```text
docs/Iterations/VFS-UI-Interaction-Fix/features/create-refresh-immediate/
  spec.md
  plan.md

src/app/screens/business-screens/
  VfsMainScreen.vue         # 创建成功后刷新时序修复主入口（失败路径语义不在本迭代变更）

test/
  vfs-ui-cr-loop.spec.ts    # 新建后即时可见回归用例（失败行为断言仅验证基线不回归）
```

## 变更点清单

- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 修正创建成功后的状态刷新链路，确保列表即时反映
  - 保持 `currentDirectoryPath` 稳定，避免无关跳转
  - 不新增失败路径语义分支，保持当前基线逻辑

- `test/vfs-ui-cr-loop.spec.ts`
  - 增加/更新创建成功即时可见断言（文件/文件夹）
  - 覆盖 chat/template、desktop/mobile 关键路径
  - 失败路径仅做基线不回归验证，不新增语义预期

## 详细实现步骤

1. 审核创建成功分支中快照写入、选中态更新、界面刷新的调用顺序。
2. 将刷新收敛到统一函数并在成功路径显式调用，保证同 tick 可观测更新。
3. 验证 template scope 下同样触发即时刷新，不依赖重新挂载。
4. 补充回归测试：创建后立即断言列表中存在新项。
5. 运行目标测试与构建验证（以成功路径刷新时序为重点）。

## 测试策略

### 测试用例

- **TC-1 新建文件即时可见**
  - 在当前目录创建文件后，列表立即出现新文件名。

- **TC-2 新建文件夹即时可见**
  - 在当前目录创建文件夹后，列表立即出现新文件夹名。

- **TC-3 chat/template 一致**
  - 两个 scope 均不需要重进页面即可看到创建结果。

- **TC-4 desktop/mobile 一致**
  - 两种布局下都满足“成功即见”。

- **TC-5 失败路径不变**
  - 非法名称/冲突/异常仍维持当前基线报错与状态，不新增语义要求。

## 风险与回滚方案

- **风险**：刷新时序调整可能影响列表滚动或选中态稳定性。  
  - 缓解：仅在创建成功路径触发最小必要刷新，并补充选中态断言。
- **回滚**：
  - 若出现副作用，可回滚 `VfsMainScreen` 中创建后刷新时序相关改动，保留文档与测试变更分离处理。
