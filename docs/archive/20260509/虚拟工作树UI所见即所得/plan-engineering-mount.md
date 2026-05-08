# 虚拟工作树 UI（挂载与工程实现）设计方案

## 设计目标

- 在 `.extraMesButtons` 稳定挂载 VFS 入口并避免重复注入/重复绑定。
- 提供可维护的弹窗壳层与生命周期管理机制。
- 落地统一渲染与 sanitize 策略（`loose` 默认 + 高风险禁用）。
- 实现日志分页与刷新策略，满足当前性能目标。

## 总体方案

- 采用“挂载层 -> 壳层 -> 业务层”三层结构：
  - 挂载层：负责入口注入、事件绑定、解绑、销毁。
  - 壳层：负责弹窗创建、Tab 容器、全局事件分发。
  - 业务层：承载具体页面逻辑（由其他 plan 细化）。
- 使用幂等初始化：
  - 初始化前检查是否已存在入口与监听器。
  - 销毁时严格执行 `off` 与引用清理。
- 渲染安全策略：
  - 阅读页/预览页共用同一链路。
  - 默认 `loose` 白名单，禁用高风险标签/属性/协议。

## 最终项目结构

```text
src/
  app/
    screens/
      business-screens/
        VfsEntryScreen.vue
      pure-screens/
        VfsPopupShellScreen.vue
    components/
      business-components/
        VfsPopupContainer.vue
      pure-components/
        VfsLogPagination.vue
    composables/
      screens-composables/
        useVfsEntryMount.ts
        useVfsPopupLifecycle.ts
      components-composables/
        useVfsMessageHooks.ts
        useVfsLogPagination.ts
    services/
      vfs/
        renderPipeline.ts
        sanitizeConfig.ts
        logService.ts
    bootstrap/
      mountVfsEntry.ts
      unmountVfsEntry.ts
```

## 变更点清单

- 新增 jQuery 挂载入口与生命周期管理模块。
- 新增弹窗壳层创建/销毁模块。
- 新增统一渲染管线与 sanitize 配置文件。
- 新增日志分页管理与刷新触发钩子。
- 新增统一错误提示适配（`toastr` + 错误码格式）。

## 详细实现步骤

1. 实现挂载幂等层
   - `mountVfsEntry.ts`：
     - 检查 `.extraMesButtons` 是否已存在按钮。
     - 仅在未挂载时插入入口。
   - `unmountVfsEntry.ts`：
     - 解绑事件、销毁弹窗、清理引用。
   - 验证：多次初始化后只有一个入口，点击只触发一次。

2. 实现弹窗壳层生命周期
   - `useVfsPopupLifecycle.ts` 负责创建容器、挂载 Tab 结构与销毁清理。
   - 验证：反复打开/关闭不出现幽灵弹窗和残留监听。

3. 实现渲染与 sanitize 管线
   - `renderPipeline.ts` 统一处理 markdown/html 渲染。
   - `sanitizeConfig.ts`：
     - 默认允许常用内容标签。
     - 移除脚本标签、内联事件、`javascript:` 协议。
     - 禁用 `style/iframe/object/embed/form` 等高风险能力。
   - 验证：常见 markdown 可正常显示；恶意样本被拦截。

4. 实现日志分页与刷新策略
   - `useVfsLogPagination.ts` 固定每页 20 条。
   - `useVfsMessageHooks.ts` 监听消息编辑/收到消息事件，触发一次自动刷新。
   - 保留手动刷新入口为默认刷新方式。
   - 验证：分页正确、自动刷新触发次数可控。

5. 实现统一错误反馈适配
   - `toastr.error` 使用固定格式：
     - `[E_<REASON>] 人类可读错误信息`
   - `warning/success` 不展示错误码。
   - 验证：error toast 全部带 code，且格式一致。

6. 完成工程接线与开关
   - 在扩展入口注入挂载初始化与销毁钩子。
   - 增加 feature flag 便于灰度。
   - 验证：flag on/off 可稳定切换。

## 测试策略

- 以集成测试覆盖生命周期与渲染安全，以手测覆盖 SillyTavern 真实挂载环境。
- 对“重复初始化、恶意输入、日志刷新风暴”做专项测试。

### 测试用例

- 重复执行初始化 10 次后，入口按钮仍为单实例。
- 打开/关闭弹窗 50 次，无重复监听、无显著内存增长。
- markdown/html 正常内容渲染一致，脚本注入样本被净化。
- 日志默认分页每页 20 条，翻页正确。
- 手动刷新可用；消息编辑/收到消息触发单次自动刷新。
- error toast 均为前置错误码格式，且无重试按钮。

## 风险与回滚方案

- 风险：SillyTavern 页面生命周期差异导致重复挂载。
  - 缓解：挂载前后都做实例检测，销毁时强制兜底清理。
- 风险：`loose` 白名单带来边界安全隐患。
  - 缓解：维护恶意样本集，联调时固定回归。
- 风险：日志自动刷新与手动刷新叠加导致短时请求尖峰。
  - 缓解：增加最短刷新间隔（throttle）与并发保护。
- 回滚方案：
  - feature flag 一键关闭新入口并回退旧入口。
  - 保留旧渲染策略 fallback，在新管线异常时切换。
