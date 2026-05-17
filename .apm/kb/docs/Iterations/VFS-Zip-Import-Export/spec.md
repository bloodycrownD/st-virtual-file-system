# VFS ZIP 导入/导出 技术规格（SPEC）

## 设计目标

- 在文件管理列表顶栏「覆盖」旁增加**导出 / 导入**图标按钮（chat 与 template 作用域均可用）。
- **导出**：将当前作用域 `VfsSnapshot` 中全部**文件节点**解码为 UTF-8 文本，按虚拟路径写入 ZIP，浏览器自动下载。
- **导入**：选择 ZIP → 二次确认 → **全量替换**当前作用域 VFS；chat 侧副作用与「覆盖」一致（清空 `chatVfsLogs`、`vfsPathVersionStore`、`vfsCheckpoints`）。
- **事务性**：ZIP 解析 / 路径校验 / 快照构建任一失败时，**不写 store**，现有 VFS 保持不变。
- **不新增 npm 依赖**：复用已有 `fflate`（`zipSync` / `unzipSync`）与 `DeflateContentCodec`。

## 总体方案

### 现状（代码锚点）

| 模块 | 路径 | 与本需求关系 |
|------|------|----------------|
| 列表顶栏按钮 | `VfsMainScreen.vue` `#actions` slot（约 L1233–1250） | 「覆盖」仅 `!isTemplateScope`；导出/导入两作用域均显示 |
| 快照读写 | `readSnapshotFromStore()` / `currentSnapshot` | 导出源；导入成功后写回 |
| 单次变更 | `applySnapshotMutation(mutator)` | 增量变更；**导入不用**，改为整快照替换 |
| 覆盖副作用 | `onConfirmDialogConfirm` → `action === 'overwrite'`（L1008–1030） | chat：`chatVfsSnapshot` + 清空 logs/versions/checkpoints + `workTree` 来自模板 |
| 模板覆盖服务 | `extension-vfs-template-service.ts` | 参考「整快照替换 + 清空 chat 历史」语义 |
| 路径规范 | `domain/vfs/path-utils.ts` `normalizePath` | ZIP 相对路径 ↔ VFS 绝对路径；拒绝 `..` 越界 |
| 内容编解码 | `DeflateContentCodec` + `VfsCore.readFile/writeFile` | 导出 decode；导入 encode 进新快照 |
| 快照结构 | `domain/vfs/types.ts`、`vfs-snapshot.schema.ts` | 仅文件节点进 ZIP；目录由 `writeFile({ createParents: true })` 隐式创建 |
| 确认弹窗 | `VfsActionConfirmDialog.vue` + `confirmDialogState` | 扩展 `action` 联合类型承载 `import-replace` |
| 持久化 | `vfs-persistence-store.ts` `updateChat` / `updateExtension` | 导入提交入口 |
| 刷新 UI | `refreshAllViews()` | 导入成功后调用；已处理「打开文件不存在」回列表 |
| 压缩库 | `package.json` → `fflate@0.8.2` | 当前仅用于 deflate 内容；ZIP 归档同样用此包 |

### 目标数据流

```text
[导出]
currentSnapshot (或 VfsCore.importSnapshot)
  → 遍历 file 节点 → codec.decode
  → Record<zipRelativePath, Uint8Array>  (UTF-8 bytes)
  → fflate.zipSync
  → Blob + <a download> → vfs-export-<timestamp>.zip

[导入]
<input type="file" accept=".zip">
  → ArrayBuffer → unzipSync
  → 校验每条 entry 路径 + UTF-8 文本
  → 内存 VfsCore: createEmpty → writeFile(…, { createParents: true, updatedBy: 'user' })
  → exportSnapshot() 成功
  → 确认框
  → updateChat / updateExtension（整快照 + chat 清空 logs/checkpoints）
  → refreshAllViews(); mode='list' if needed
```

### PRD 决策固化（SPEC 层）

| 议题 | 决策 |
|------|------|
| 空 VFS 导出 | **不下载**；`toastr.warning`「当前没有可导出的文件」 |
| 空 ZIP / 无可导入文件 | 导入失败，toast 错误，**不修改** store |
| 非法 ZIP 路径 | **整次失败并回滚**（不部分写入） |
| ZIP 内路径格式 | VFS `/notes/a.md` ↔ ZIP `notes/a.md`（去掉 leading `/`，统一 `/`） |
| 工作树配置 | **不**随 ZIP 导入/导出；导入后**保留**当前 `workTree`（与「覆盖」不同）；实现时**修剪** `fileInclusionByPath` / `directoryRule*` 中已不存在于新快照的路径键，避免悬空引用 |
| template 导入副作用 | 仅替换 `extensionTemplateVfsSnapshot`；无 chat logs/checkpoints |
| 文件类型 | ZIP 条目按 UTF-8 文本解码；解码失败视为非法条目 → 整次导入失败 |

## 最终项目结构

```text
src/app/services/vfs-archive/
  vfs-zip-path.ts          # zipPath ↔ vfsPath、entry 过滤、非法路径检测
  vfs-zip-archive.ts       # exportSnapshotToZipBytes / importZipBytesToSnapshot
  trigger-browser-download.ts  # Blob → object URL → <a download>（可测）

src/app/screens/business-screens/VfsMainScreen.vue
  # 顶栏按钮、hidden file input、confirm 分支、in-flight 状态

src/app/constants/vfsErrorCodes.ts   # 可选：E_EXPORT_FAILED / E_IMPORT_FAILED

tests/vfs-zip-archive.spec.ts      # 纯函数单测（路径、round-trip、非法 zip）
tests/vfs-zip-ui.spec.ts           # 可选：挂载 VfsMainScreen 断言按钮存在（轻量）
```

不新增 `plan.md`；步骤见下文。

## 变更点清单

| 文件 | 变更 |
|------|------|
| `src/app/services/vfs-archive/vfs-zip-path.ts` | **新建**：`vfsPathToZipEntryName`、`zipEntryNameToVfsPath`、`isIgnoredZipEntry`、`assertSafeZipEntryName` |
| `src/app/services/vfs-archive/vfs-zip-archive.ts` | **新建**：`exportSnapshotToZipBytes`、`importZipBytesToSnapshot`；依赖 `VfsSnapshot`、`DeflateContentCodec`、`VfsCore`、`zipSync`/`unzipSync`/`strToU8`/`strFromU8` |
| `src/app/services/vfs-archive/trigger-browser-download.ts` | **新建**：`downloadBlob(filename, blob)` |
| `VfsMainScreen.vue` | 顶栏增加导出/导入按钮；`zipTransferInProgress`；hidden `<input type="file">`；`confirmDialogState.action` 增加 `'import-replace'`；`pendingImportSnapshot` ref；`applyImportedSnapshot()` |
| `vfsErrorCodes.ts` | 增加 `EXPORT_FAILED`、`IMPORT_FAILED`（toast 映射可选） |
| `vfs-zip-archive.spec.ts` | **新建**单测 |
| `prd.md` | 无需改；空 VFS 行为以本 SPEC 为准 |

**不改动**：`ToolDispatcher`、Function Calling、工作树引擎规则、设置页 `App.vue`（模板入口仍用现有 `popup.open({ scope: 'template' })`）。

## 详细实现步骤

### 步骤 1：`vfs-zip-path.ts`

- `vfsPathToZipEntryName(path: string): string`  
  - `normalizePath` 后若仅为 `/` 则抛错（非文件）。  
  - 返回 `path.slice(1)`（`'/a/b.md'` → `'a/b.md'`）。
- `zipEntryNameToVfsPath(name: string): string`  
  - 拒绝：空、`\\`、以 `/` 开头、含 `\0`、仅空白段。  
  - `normalizePath('/' + name.replace(/\\/g, '/'))`；若 normalize 抛 `VfsInvalidPathError` 则向上传递。
- `isIgnoredZipEntry(name: string): boolean`  
  - 跳过：`__MACOSX/` 前缀、`.DS_Store`、以 `/` 结尾的目录占位（若 unzip 返回）、`Thumbs.db` 等（列表保持短小）。
- `assertSafeZipEntryName`：汇总校验，供 import 循环调用。

### 步骤 2：`vfs-zip-archive.ts`

**`exportSnapshotToZipBytes(snapshot, codec): Uint8Array`**

1. 收集 `Object.values(snapshot.nodes)` 中 `type === 'file'`。
2. 若长度为 0 → 抛自定义 `VfsZipExportEmptyError`（UI 捕获后 toast，不下载）。
3. 构建 `Zippable`：
   ```ts
   const files: Record<string, Uint8Array> = {}
   for (const node of fileNodes) {
     const name = vfsPathToZipEntryName(node.path)
     const text = codec.decode(node.content)
     files[name] = strToU8(text)
   }
   return zipSync(files, { level: 6 }) // level 可选，默认即可
   ```

**`importZipBytesToSnapshot(bytes, codec): VfsSnapshot`**

1. `unzipSync(bytes)` → `Unzipped`（`Record<string, Uint8Array>`）。
2. 过滤 `isIgnoredZipEntry`；若过滤后无条目 → 抛 `VfsZipImportEmptyError`。
3. **预检循环**（不写 VfsCore）：对每个 entry 执行 `assertSafeZipEntryName`；`strFromU8` 解码，失败则抛「非 UTF-8 文本」类错误。
4. **构建**：
   ```ts
   const core = new VfsCore(codec)
   core.importSnapshot(createEmptyVfsSnapshot())
   for (const [zipName, data] of entries) {
     const vfsPath = zipEntryNameToVfsPath(zipName)
     core.writeFile(vfsPath, strFromU8(data), { createParents: true, updatedBy: 'user' })
   }
   return core.exportSnapshot()
   ```
5. 任一步抛错 → 调用方不触碰 store（事务性由「先构建完整 snapshot 再一次性 commit」保证）。

### 步骤 3：`trigger-browser-download.ts`

- `downloadBlob(filename: string, blob: Blob): void`  
  - `URL.createObjectURL` → 临时 `<a download>` → `click()` → `revokeObjectURL`（`try/finally`）。
- 便于单测：可 mock `document.createElement` 或通过注入 `document`（Vitest jsdom 默认即可）。

### 步骤 4：`VfsMainScreen.vue` UI 与状态

**按钮（`#actions` slot，紧挨覆盖按钮）**

```html
<!-- 导出：fa-file-zip 或 fa-file-export -->
<button type="button" class="vfs-fm-icon-button" title="导出" aria-label="导出"
  :disabled="zipTransferInProgress" @click="handleExportZip" />
<!-- 导入：fa-file-import -->
<button type="button" class="vfs-fm-icon-button" title="导入" aria-label="导入"
  :disabled="zipTransferInProgress" @click="zipFileInputRef?.click()" />
<input ref="zipFileInputRef" type="file" accept=".zip,application/zip" hidden @change="handleZipFileSelected" />
```

- chat：`覆盖 | 导出 | 导入 | VfsActionMenu`  
- template：`导出 | 导入 | VfsActionMenu`（无覆盖，与 PRD 一致）

**`handleExportZip`**

1. `zipTransferInProgress = true`  
2. `exportSnapshotToZipBytes(currentSnapshot.value, codec)`  
3. `downloadBlob(\`vfs-export-${Date.now()}.zip\`, new Blob([bytes], { type: 'application/zip' }))`  
4. `toastr.success('已导出')`；捕获 empty → warning；其它 → `EXPORT_FAILED`  
5. `finally` 清 `zipTransferInProgress`

**`handleZipFileSelected`**

1. 取 `files[0]`，无则 return；`input.value = ''` 以便重复选同一文件。  
2. `arrayBuffer()` → `importZipBytesToSnapshot(new Uint8Array(buf), codec)` 在 **try** 中仅构建快照，存 `pendingImportSnapshot.value`。  
3. 打开 `confirmDialogState`：`action: 'import-replace'`，文案与覆盖类似但强调来源为 ZIP。  
4. 构建失败 → toast，**不**打开确认框。

**`onConfirmDialogConfirm` 扩展**

```ts
if (action === 'import-replace') {
  const next = pendingImportSnapshot.value
  if (!next) return
  if (isTemplateScope.value) {
    vfsPersistenceStore.updateExtension((d) => ({
      ...d,
      extensionTemplateVfsSnapshot: serializeVfsSnapshot(next),
    }))
    currentSnapshot.value = next
  } else {
    vfsPersistenceStore.updateChat((d) => ({
      ...d,
      chatVfsSnapshot: serializeVfsSnapshot(next),
      chatVfsLogs: [],
      vfsPathVersionStore: {},
      vfsCheckpoints: [],
      workTree: pruneWorkTreeForSnapshot(d.workTree, next),
    }))
  }
  pendingImportSnapshot.value = null
  activeContextPath.value = null
  requestModeChange('list')
  refreshAllViews()
  toastr.success('导入成功')
  return
}
```

**`pruneWorkTreeForSnapshot(workTree, snapshot)`**（同文件内私有函数或 `vfs-archive` 旁小 util）

- 对 `fileInclusionByPath`、`directoryRuleEnabledByPath`、`directoryRuleByPath` 删除 `getNodeByPath(snapshot, path)` 不存在的键。  
- `ensureWorkTreeConfig` 包装返回值。

### 步骤 5：错误码与 toast

- `VFS_ERROR_CODES.EXPORT_FAILED` / `IMPORT_FAILED`  
- `mapVfsMutationError` 可不扩展；ZIP 错误在 screen 层用固定中文 message + `toVfsErrorToast`。

### 步骤 6：测试

见「测试策略」。

## 测试策略

### 单元测试 `tests/vfs-zip-archive.spec.ts`

| ID | 用例 |
|----|------|
| T-ZIP-01 | `vfsPathToZipEntryName('/a/b.md')` → `'a/b.md'`；`'../x'` 类路径 normalize 失败 |
| T-ZIP-02 | 快照含 2 个文件 → `exportSnapshotToZipBytes` → `unzipSync` 条数与内容一致 |
| T-ZIP-03 | 仅 root、无文件 → `exportSnapshotToZipBytes` 抛 empty |
| T-ZIP-04 | 合法 zip bytes round-trip：export → import → `readFile` 内容一致 |
| T-ZIP-05 | zip 含 `../evil.md`（或以 `..` 拼接的名）→ import 抛错 |
| T-ZIP-06 | 损坏随机 bytes → import 抛错 |
| T-ZIP-07 | 空 zip（无文件条目）→ import 抛 empty |
| T-ZIP-08 | `__MACOSX/` 条目被忽略；仅剩忽略项 → empty |

### UI / 集成（可选，优先手工）

- chat 列表顶栏存在 `aria-label="导出"` / `"导入"`（`data-testid="vfs-zip-export"` / `vfs-zip-import` 建议加上）。  
- template popup 同样可见两按钮。  
- 导入确认取消后 `getState().chat.chatVfsSnapshot` 引用不变（深比较节点数）。

### 手工验收（对齐 PRD）

1. 建 `/notes/a.md`，导出，解压核对路径与内容。  
2. 删 chat 内文件后导入刚才 ZIP → 文件恢复，历史/检查点清空。  
3. 模板 scope 导出/导入不影响当前 chat。  
4. 导入中取消确认 → 无变化。

## 风险与回滚方案

| 风险 | 缓解 |
|------|------|
| 大 chat VFS 同步 zip/unzip 阻塞主线程 | 本迭代接受；后续可改 `zip`/`unzip` 异步 + 简单进度。PRD 不含进度条。 |
| 导入后 workTree 键残留 | `pruneWorkTreeForSnapshot` 删除无效路径键。 |
| ZIP 路径与 Windows 反斜杠 | 统一 `replace(/\\/g, '/')` 再 normalize。 |
| 用户误点导入 | 二次确认 + 明确文案；与覆盖同级破坏性。 |
| `fflate` 与现有 deflate 编码混淆 | ZIP 层仅处理**明文 UTF-8 文件字节**；快照内仍用 `DeflateContentCodec`。 |

**回滚**：删除 `vfs-archive` 目录与 `VfsMainScreen` 相关按钮/分支即可恢复；无持久化 schema 变更。

## 兼容性或迁移说明

- **无** `schemaVersion` 变更；导入生成的新快照仍走 `serializeVfsSnapshot` / `parseVfsSnapshot`。
- 与「覆盖」并存；不修改 `overwriteCurrentChatWithTemplate` 逻辑。
- 旧 chat 数据向前兼容；ZIP 为外部交换格式，非 ST 持久化格式。

## 分步骤实现顺序（建议）

1. `vfs-zip-path.ts` + 路径单测  
2. `vfs-zip-archive.ts` + round-trip / 失败单测  
3. `trigger-browser-download.ts`  
4. `VfsMainScreen.vue` 导出链路  
5. 导入选择文件 → 构建快照 → 确认 → commit + prune workTree  
6. 补 `data-testid`、错误码、手工验收

---

**请确认本 SPEC 后再进入编码。** 若需调整（例如空 VFS 仍下载空 zip、或导入时同时重置 workTree 为默认），请直接指出。
