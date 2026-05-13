<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import VfsActionConfirmDialog from '@/app/components/business-components/VfsActionConfirmDialog.vue'
import VfsActionInputDialog from '@/app/components/business-components/VfsActionInputDialog.vue'
import VfsListboxField from '@/app/components/pure-components/VfsListboxField.vue'
import VfsUnsavedEditorDialog from '@/app/components/business-components/VfsUnsavedEditorDialog.vue'
import {
  createVfsCommitHistoryStore,
  type VfsCommitHistoryRecord,
} from '@/app/composables/components-composables/useVfsCommitHistory'
import {
  isActionTriggerable,
  type VfsEntityAction,
  type VfsGlobalAction,
  type VfsManagerEntity,
} from '@/app/composables/components-composables/useVfsFileManagerModel'
import VfsFileManagerPanel from '@/app/components/business-components/VfsFileManagerPanel.vue'
import VfsCreateEntityModal from '@/app/components/business-components/VfsCreateEntityModal.vue'
import {
  useVfsMessageHooks,
  VFS_POPUP_BEFORE_CLOSE,
  VFS_STATE_REFRESH_REQUIRED,
} from '@/app/composables/components-composables/useVfsMessageHooks'
import VfsHistoryScreen from '@/app/screens/business-screens/VfsHistoryScreen.vue'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import SlideshowScreen from '@/app/screens/pure-screens/SlideshowScreen.vue'
import VfsTabShellScreen from '@/app/screens/pure-screens/VfsTabShellScreen.vue'
import WorkTreeScreen from '@/app/screens/pure-screens/WorkTreeScreen.vue'
import { useVfsCheckpointRollback } from '@/app/composables/components-composables/useVfsCheckpointRollback'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { vfsPersistenceStore, vfsCheckpointService } from '@/app/stores/vfs-store-singleton'
import type { VfsSnapshot } from '@/domain/vfs/types'
import type { VfsBrowserEntity } from '@/app/components/business-components/VfsFileManagerPanel.vue'
import { dirname, normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { VfsCore } from '@/domain/vfs/vfs-core'
import {
  DEFAULT_ROOT_DIRECTORY_RULE,
  type DirectoryRule,
  type WorkTreeConfig,
  type WorkTreeFileInclusionMode,
  ensureWorkTreeConfig,
} from '@/domain/work-tree/work-tree.types'
import {
  getWorkTreeFileInclusionMode,
  isFileIncludedInWorkTree,
  renderVirtualWorkTree,
} from '@/domain/work-tree/work-tree-engine'
import { mapVfsMutationError, toVfsErrorToast } from '@/app/utils/vfsErrorMapper'
import { createEmptyVfsSnapshot, serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

type VfsScreenScope = 'chat' | 'template'
type VfsScreenTab = 'files' | 'history' | 'worktree'
type ViewerOriginKind = 'file-open' | 'dir-slideshow'
type ViewerOriginContext = {
  kind: ViewerOriginKind
  originPath: string
  originDirectoryPath: string
}
type PendingEditorLeave =
  | { kind: 'mode'; next: 'list' | 'reader' | 'editor' | 'slideshow' }
  | { kind: 'tab'; next: VfsScreenTab }
  | { kind: 'popup-close' }
type VfsTabShellExposed = { forceSwitchTab: (tab: VfsScreenTab) => void }
const props = withDefaults(
  defineProps<{
    scope?: VfsScreenScope
    tabs?: VfsScreenTab[]
  }>(),
  {
    scope: 'chat',
    tabs: () => ['files', 'history', 'worktree'],
  },
)

const mode = ref<'list' | 'reader' | 'editor' | 'slideshow'>('list')
const editorContent = ref('')
const savedContent = ref('')
const isDirty = ref(false)
const viewRefreshToken = ref(0)
const layoutMode = ref<'mobile' | 'desktop'>(window.innerWidth >= 1024 ? 'desktop' : 'mobile')
const viewportHeight = ref(window.innerHeight)
const activeTab = ref<VfsScreenTab>('files')
const history = createVfsCommitHistoryStore()
const historyMachine = createVfsHistoryStateMachine()
const saveRequestsInFlight = ref(0)
const rollbackRequestsInFlight = ref(0)
const saveInProgress = ref(false)
const rollbackInProgress = ref(false)
const currentDirectoryPath = ref<string>(ROOT_PATH)
/** Active document / preview target — not list selection (list rows no longer emit selected). */
const activeContextPath = ref<string | null>(null)
const viewerDirectoryPath = ref<string>(ROOT_PATH)
const viewerFilePaths = ref<string[]>([])
const viewerIndex = ref(0)
const viewerOrigin = ref<ViewerOriginContext | null>(null)
// WHY: store `getState()` reads are non-reactive; mirror workTree into a ref so row status icons rerender.
const currentWorkTree = ref<WorkTreeConfig>(ensureWorkTreeConfig(vfsPersistenceStore.getState().chat.workTree ?? null))
const createModalOpen = ref(false)
const createKind = ref<'file' | 'directory'>('directory')
const codec = new DeflateContentCodec()
const tabShellRef = ref<VfsTabShellExposed | null>(null)
const unsavedDialogOpen = ref(false)
const pendingEditorLeave = ref<PendingEditorLeave | null>(null)
/** Preview vs source toggle for editor mode; lifted here so back + preview + save share one top bar. */
const editorPreviewMode = ref(false)
const confirmDialogState = ref<null | { title: string; message: string; action: 'overwrite' | 'delete' }>(null)
const inputDialogState = ref<
  null | {
    title: string
    fields: Array<{
      key: string
      label: string
      value: string
      type?: 'text' | 'select' | 'range-number'
      options?: Array<{ label: string; value: string }>
      min?: number
      max?: number
      step?: number
      placeholder?: string
    }>
    action: 'rename' | 'apply-strategy'
  }
>(null)
const pendingEntityActionContext = ref<VfsManagerEntity | null>(null)
const inputDialogError = ref('')

const readerHtml = computed(() => editorContent.value)
const editorHistoryRecords = computed<VfsCommitHistoryRecord[]>(() => history.records.value)
/** Header rollback control: bound to editor checkpoint listbox; cleared when history list no longer contains the id. */
const editorRollbackCheckpointId = ref('')
const isTemplateScope = computed(() => props.scope === 'template')
const resolvedTabs = computed<VfsScreenTab[]>(() => {
  if (isTemplateScope.value) return ['files']
  return props.tabs
})
function readSnapshotFromStore(): VfsSnapshot {
  if (isTemplateScope.value) {
    return vfsPersistenceStore.getState().extension.extensionTemplateVfsSnapshot ?? createEmptyVfsSnapshot()
  }
  return vfsPersistenceStore.getState().chat.chatVfsSnapshot
}
const currentSnapshot = ref<VfsSnapshot>(readSnapshotFromStore())
const renderedWorkTreeText = computed(() => renderVirtualWorkTree(currentSnapshot.value, currentWorkTree.value))

let disposeMessageHooks: (() => void) | null = null

const updateLayout = () => {
  layoutMode.value = window.innerWidth >= 1024 ? 'desktop' : 'mobile'
  viewportHeight.value = window.innerHeight
}

function readScopedWorkTreeFromStore(): WorkTreeConfig {
  const state = vfsPersistenceStore.getState()
  if (isTemplateScope.value) {
    return ensureWorkTreeConfig(state.extension.workTreeTemplate)
  }
  return ensureWorkTreeConfig(state.chat.workTree)
}

function updateScopedWorkTree(mutator: (config: WorkTreeConfig) => WorkTreeConfig): void {
  if (isTemplateScope.value) {
    vfsPersistenceStore.updateExtension((draft) => ({
      ...draft,
      // WHY: template scope should persist strategy defaults in extension bucket only; never leak into chat metadata.
      workTreeTemplate: mutator(ensureWorkTreeConfig(draft.workTreeTemplate)),
    }))
    return
  }
  vfsPersistenceStore.updateChat((draft) => ({
    ...draft,
    workTree: mutator(ensureWorkTreeConfig(draft.workTree)),
  }))
}

function syncReactiveWorkTree(): void {
  currentWorkTree.value = readScopedWorkTreeFromStore()
}

function getNodeByPath(snapshot: VfsSnapshot, path: string) {
  const p = normalizePath(path)
  return Object.values(snapshot.nodes).find((candidate) => candidate.path === p) ?? null
}

function resolveDirectoryListRule(config: WorkTreeConfig, directoryPath: string): DirectoryRule {
  if (directoryPath === ROOT_PATH) {
    return { ...DEFAULT_ROOT_DIRECTORY_RULE, ...config.directoryRuleByPath[ROOT_PATH] }
  }
  // WHY: list order matches engine list pass — disabled non-root dirs sort by name asc only (SPEC).
  if (config.directoryRuleEnabledByPath[directoryPath] !== true) {
    return { ...DEFAULT_ROOT_DIRECTORY_RULE, sortField: 'name', sortDirection: 'asc' }
  }
  return { ...DEFAULT_ROOT_DIRECTORY_RULE, ...config.directoryRuleByPath[directoryPath] }
}

function listDirectoryEntries(snapshot: VfsSnapshot, directoryPath: string, config: WorkTreeConfig): VfsBrowserEntity[] {
  const dirNode = getNodeByPath(snapshot, directoryPath)
  if (!dirNode || dirNode.type !== 'directory') return []
  const rule = resolveDirectoryListRule(config, dirNode.path)
  const direction = rule.sortDirection === 'desc' ? -1 : 1

  const getSortValue = (entry: VfsBrowserEntity): string | number => {
    if (rule.sortField === 'name') return entry.name
    if (rule.sortField === 'ctime') return entry.ctime ?? 0
    return entry.mtime ?? 0
  }

  return dirNode.children
    .map((id) => snapshot.nodes[id])
    .filter(Boolean)
    .map((node) => ({
      path: node.path,
      name: node.name,
      kind: (node.type === 'file' ? 'file' : 'directory') as 'file' | 'directory',
      ctime: node.type === 'file' ? node.ctime : undefined,
      mtime: node.mtime,
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      const va = getSortValue(a)
      const vb = getSortValue(b)
      let cmp = 0
      if (typeof va === 'number' && typeof vb === 'number') cmp = va === vb ? 0 : va < vb ? -1 : 1
      else cmp = String(va).localeCompare(String(vb))
      if (cmp === 0) cmp = a.path.localeCompare(b.path)
      return cmp * direction
    })
}

function isEntityRowLit(entity: VfsBrowserEntity): boolean {
  const config = currentWorkTree.value
  if (entity.kind === 'file') return isFileIncludedInWorkTree(currentSnapshot.value, config, entity.path)
  if (entity.path === ROOT_PATH) return true
  return config.directoryRuleEnabledByPath[entity.path] === true
}

/** FA icons + copy fixed in SPEC/prd — keep in sync with `getWorkTreeFileInclusionMode` / `directoryRuleEnabledByPath`. */
function workTreeFileRowBadge(mode: WorkTreeFileInclusionMode): Pick<
  VfsBrowserEntity,
  'rowBadgeIconClass' | 'rowBadgeLabel' | 'rowBadgeTitle' | 'rowBadgeAria'
> {
  if (mode === 'explicit-include') {
    return {
      rowBadgeIconClass: 'fa-solid fa-bookmark',
      rowBadgeLabel: '纳入',
      rowBadgeTitle: '纳入方式：显式纳入工作树',
      rowBadgeAria: '纳入方式：显式纳入工作树',
    }
  }
  if (mode === 'explicit-exclude') {
    return {
      rowBadgeIconClass: 'fa-solid fa-ban',
      rowBadgeLabel: '排除',
      rowBadgeTitle: '纳入方式：显式排除，不纳入工作树',
      rowBadgeAria: '纳入方式：显式排除，不纳入工作树',
    }
  }
  return {
    rowBadgeIconClass: 'fa-solid fa-sitemap',
    rowBadgeLabel: '随目录',
    rowBadgeTitle: '纳入方式：随父目录规则（由当前目录纳入规则决定）',
    rowBadgeAria: '纳入方式：随父目录规则（由当前目录纳入规则决定）',
  }
}

function directoryRuleRowBadge(ruleOn: boolean): Pick<
  VfsBrowserEntity,
  'rowBadgeIconClass' | 'rowBadgeLabel' | 'rowBadgeTitle' | 'rowBadgeAria'
> {
  if (ruleOn) {
    return {
      rowBadgeIconClass: 'fa-solid fa-toggle-on',
      rowBadgeLabel: '规则·开',
      rowBadgeTitle: '目录纳入规则：已启用',
      rowBadgeAria: '目录纳入规则：已启用',
    }
  }
  return {
    rowBadgeIconClass: 'fa-solid fa-toggle-off',
    rowBadgeLabel: '规则·关',
    rowBadgeTitle: '目录纳入规则：未启用',
    rowBadgeAria: '目录纳入规则：未启用',
  }
}

function readFileContentFromSnapshot(snapshot: VfsSnapshot, path: string): string {
  const node = getNodeByPath(snapshot, path)
  if (!node || node.type !== 'file') return ''
  return codec.decode(node.content)
}

function applySnapshotMutation(mutator: (core: VfsCore) => void): void {
  const core = new VfsCore(codec)
  core.importSnapshot(currentSnapshot.value)
  mutator(core)
  const next = core.exportSnapshot()
  if (isTemplateScope.value) {
    vfsPersistenceStore.updateExtension((draft) => ({
      ...draft,
      extensionTemplateVfsSnapshot: next,
    }))
    // WHY: template and chat use the same list renderer and both require immediate local snapshot reactivity.
    currentSnapshot.value = next
    return
  }
  vfsPersistenceStore.updateChat((draft) => ({ ...draft, chatVfsSnapshot: next }))
  // WHY: keep snapshot reactive locally; store getState() is non-reactive for computed list dependencies.
  currentSnapshot.value = next
}

function replaceWorkTreePaths(oldPath: string, newPath: string): void {
  // WHY: rename/delete must not leave dangling path references inside macro configuration.
  updateScopedWorkTree((config) => {
    const fileInclusionByPath: Record<string, WorkTreeFileInclusionMode> = {}
    for (const [k, v] of Object.entries(config.fileInclusionByPath)) {
      fileInclusionByPath[k === oldPath ? newPath : k] = v
    }
    const directoryRuleEnabledByPath: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(config.directoryRuleEnabledByPath)) {
      directoryRuleEnabledByPath[k === oldPath ? newPath : k] = v
    }
    const directoryRuleByPath: Record<string, DirectoryRule> = {}
    for (const [k, v] of Object.entries(config.directoryRuleByPath)) {
      directoryRuleByPath[k === oldPath ? newPath : k] = v
    }
    return {
      ...config,
      fileInclusionByPath,
      directoryRuleEnabledByPath,
      directoryRuleByPath,
    }
  })
  syncReactiveWorkTree()
}

function removeWorkTreePaths(removedPath: string): void {
  updateScopedWorkTree((config) => {
    const fileInclusionByPath = { ...config.fileInclusionByPath }
    delete fileInclusionByPath[removedPath]
    const directoryRuleEnabledByPath = { ...config.directoryRuleEnabledByPath }
    delete directoryRuleEnabledByPath[removedPath]
    const directoryRuleByPath = { ...config.directoryRuleByPath }
    delete directoryRuleByPath[removedPath]
    return { ...config, fileInclusionByPath, directoryRuleEnabledByPath, directoryRuleByPath }
  })
  syncReactiveWorkTree()
}

function refreshAuthoritativeState(): void {
  const state = vfsPersistenceStore.getState()
  currentSnapshot.value = readSnapshotFromStore()
  syncReactiveWorkTree()
  if (isTemplateScope.value) {
    history.replaceRecords([])
  } else {
    const path = activeContextPath.value
    if (!path) {
      history.replaceRecords([])
    } else {
      const normalizedPath = normalizePath(path)
      history.replaceRecords(
        state.chat.vfsCheckpoints
          .filter((cp) => Object.prototype.hasOwnProperty.call(cp.treeVersion, normalizedPath))
          .map((cp) => ({
            checkpointId: cp.id,
            time: cp.time,
            operator: 'checkpoint',
            actionType: cp.source,
            scope: normalizedPath,
          })),
      )
    }
  }

  const normalizedDir = (() => {
    try {
      return normalizePath(currentDirectoryPath.value || ROOT_PATH)
    } catch {
      return ROOT_PATH
    }
  })()
  currentDirectoryPath.value = normalizedDir

  if (activeContextPath.value) {
    const node = getNodeByPath(currentSnapshot.value, activeContextPath.value)
    if (!node) activeContextPath.value = null
  }

  const node = activeContextPath.value ? getNodeByPath(currentSnapshot.value, activeContextPath.value) : null
  if (!node || node.type !== 'file') return
  const source = readFileContentFromSnapshot(currentSnapshot.value, node.path)
  editorContent.value = source
  savedContent.value = source
  isDirty.value = false
}

const refreshAllViews = () => {
  // WHY: keep all screens synced to persisted state after rollback/save side effects.
  refreshAuthoritativeState()
  viewRefreshToken.value += 1
}

function withWriteScopeGuard(scope: string, action: 'save' | 'rollback', task: () => Promise<void>): Promise<void> {
  // WHY: do not short-circuit concurrent operations; execution result is authoritative per spec.
  void scope
  if (action === 'save') {
    saveRequestsInFlight.value += 1
    saveInProgress.value = saveRequestsInFlight.value > 0
  } else {
    rollbackRequestsInFlight.value += 1
    rollbackInProgress.value = rollbackRequestsInFlight.value > 0
  }
  return task().finally(() => {
    if (action === 'save') {
      saveRequestsInFlight.value = Math.max(0, saveRequestsInFlight.value - 1)
      saveInProgress.value = saveRequestsInFlight.value > 0
    } else {
      rollbackRequestsInFlight.value = Math.max(0, rollbackRequestsInFlight.value - 1)
      rollbackInProgress.value = rollbackRequestsInFlight.value > 0
    }
  })
}

function closeHostVfsPopupIfPresent(): void {
  document.querySelector<HTMLDialogElement>('#st-vfs-popup')?.close?.()
}

function applyPendingEditorLeave(): void {
  const pending = pendingEditorLeave.value
  pendingEditorLeave.value = null
  if (!pending) return
  if (pending.kind === 'mode') {
    mode.value = pending.next
    return
  }
  if (pending.kind === 'tab') {
    tabShellRef.value?.forceSwitchTab(pending.next)
    return
  }
  closeHostVfsPopupIfPresent()
}

function openUnsavedEditorLeave(intent: PendingEditorLeave): void {
  if (unsavedDialogOpen.value) {
    pendingEditorLeave.value = intent
    return
  }
  pendingEditorLeave.value = intent
  unsavedDialogOpen.value = true
}

function handlePopupBeforeClose(event: Event): void {
  if (mode.value !== 'editor' || !isDirty.value) return
  event.preventDefault()
  openUnsavedEditorLeave({ kind: 'popup-close' })
}

async function onUnsavedEditorDialogSave(): Promise<void> {
  await handleEditorSaveRequested()
  if (isDirty.value) return
  unsavedDialogOpen.value = false
  applyPendingEditorLeave()
}

function onUnsavedEditorDialogDiscard(): void {
  discardEditorDraft()
  unsavedDialogOpen.value = false
  applyPendingEditorLeave()
}

function onUnsavedEditorDialogCancel(): void {
  unsavedDialogOpen.value = false
  pendingEditorLeave.value = null
}

function handleTabChanged(nextTab: VfsScreenTab): void {
  activeTab.value = nextTab
}

function overwriteCurrentChatWithTemplate(): void {
  if (isTemplateScope.value) return
  pendingEntityActionContext.value = null
  confirmDialogState.value = {
    action: 'overwrite',
    title: '确认覆盖',
    message: '此操作将用模板覆盖当前 chat 目录，并清空日志与检查点历史。此操作不可恢复，确认继续？',
  }
}

watch(mode, (next, prev) => {
  if (prev === 'editor' && next !== 'editor') {
    editorPreviewMode.value = false
  }
})

onMounted(() => {
  window.addEventListener(VFS_POPUP_BEFORE_CLOSE, handlePopupBeforeClose)
  if (!isTemplateScope.value) {
    window.addEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)
  }
  window.addEventListener('resize', updateLayout)
  if (!isTemplateScope.value) disposeMessageHooks = useVfsMessageHooks()
  refreshAuthoritativeState()
})

onUnmounted(() => {
  window.removeEventListener(VFS_POPUP_BEFORE_CLOSE, handlePopupBeforeClose)
  if (!isTemplateScope.value) {
    window.removeEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)
  }
  window.removeEventListener('resize', updateLayout)
  disposeMessageHooks?.()
  disposeMessageHooks = null
})

function discardEditorDraft(): void {
  editorContent.value = savedContent.value
  isDirty.value = false
}

function requestModeChange(nextMode: 'list' | 'reader' | 'editor' | 'slideshow'): void {
  if (mode.value === nextMode) return
  if (nextMode === 'editor' && mode.value !== 'editor') {
    savedContent.value = editorContent.value
  }
  if (mode.value !== 'editor' || nextMode === 'editor' || !isDirty.value) {
    mode.value = nextMode
    return
  }
  openUnsavedEditorLeave({ kind: 'mode', next: nextMode })
}

const directoryEntries = computed(() => {
  const cfg = currentWorkTree.value
  return listDirectoryEntries(currentSnapshot.value, currentDirectoryPath.value, cfg).map((entry) => {
    const lit = isEntityRowLit(entry)
    if (entry.kind === 'file') {
      // WHY: badge reads sparse `fileInclusionByPath` via engine export so keys match `normalizePath` + defaults.
      const mode = getWorkTreeFileInclusionMode(cfg, entry.path)
      return {
        ...entry,
        enabled: lit,
        statusHintTitle: lit ? '已纳入工作树' : '未纳入工作树',
        statusHintAria: lit ? '状态：已纳入工作树' : '状态：未纳入工作树',
        ...workTreeFileRowBadge(mode),
      }
    }
    const ruleOn = entry.path === ROOT_PATH || cfg.directoryRuleEnabledByPath[entry.path] === true
    return {
      ...entry,
      enabled: ruleOn,
      statusHintTitle: ruleOn ? '目录纳入规则：已启用' : '目录纳入规则：未启用',
      statusHintAria: ruleOn ? '状态：目录纳入规则已启用' : '状态：目录纳入规则未启用',
      ...directoryRuleRowBadge(ruleOn),
    }
  })
})
const selectedEntity = computed<VfsManagerEntity | null>(() => {
  if (!activeContextPath.value) return null
  const node = getNodeByPath(currentSnapshot.value, activeContextPath.value)
  if (!node || (node.type !== 'file' && node.type !== 'directory')) return null
  return {
    id: node.id,
    name: node.name,
    kind: (node.type === 'file' ? 'file' : 'directory') as 'file' | 'directory',
    path: node.path,
  }
})

const slideshowPages = computed(() => {
  const snapshot = currentSnapshot.value
  return viewerFilePaths.value.map((path) => {
    const node = getNodeByPath(snapshot, path)
    return {
      path,
      title: node?.name ?? path.split('/').at(-1) ?? path,
      content: readFileContentFromSnapshot(snapshot, path),
    }
  })
})
const currentViewerFileTitle = computed(() => {
  const path = activeContextPath.value
  if (!path) return ''
  const node = getNodeByPath(currentSnapshot.value, path)
  return node?.name ?? path.split('/').at(-1) ?? path
})
const currentViewerFileNode = computed(() => {
  const path = activeContextPath.value
  if (!path) return null
  const node = getNodeByPath(currentSnapshot.value, path)
  if (!node || node.type !== 'file') return null
  return node
})
function formatShortDateTime(timestamp?: number): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(timestamp)
}
const currentViewerCreatedAtText = computed(() => formatShortDateTime(currentViewerFileNode.value?.ctime))
const currentViewerUpdatedAtText = computed(() => formatShortDateTime(currentViewerFileNode.value?.mtime))

function formatEditorSnapshotOptionLabel(record: VfsCommitHistoryRecord): string {
  const parsed = Date.parse(record.time)
  const when = Number.isFinite(parsed)
    ? new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(parsed)
    : record.time
  const status =
    record.actionType === 'tool-batch' ? '工具批次' : record.actionType === 'editor-save' ? '保存' : '检查点'
  return `${when} · ${status}`
}

const editorSnapshotListboxOptions = computed(() =>
  editorHistoryRecords.value
    .filter((record): record is VfsCommitHistoryRecord & { checkpointId: string } => Boolean(record.checkpointId))
    .map((record) => ({
      value: record.checkpointId,
      label: formatEditorSnapshotOptionLabel(record),
    })),
)

watch(
  [editorHistoryRecords, mode, activeContextPath],
  () => {
    const ids = new Set(
      editorHistoryRecords.value.map((row) => row.checkpointId).filter((id): id is string => Boolean(id)),
    )
    if (editorRollbackCheckpointId.value && !ids.has(editorRollbackCheckpointId.value)) {
      editorRollbackCheckpointId.value = ''
    }
  },
  { deep: true },
)
const shouldShowPreviewMetadata = computed(() => {
  if (!currentViewerFileNode.value) return false
  // WHY: source-edit mode should stay focused on editing only; metadata belongs to rendered preview experience.
  if (mode.value === 'editor') return editorPreviewMode.value
  return mode.value === 'reader' || mode.value === 'slideshow'
})
const shouldUseFlowPreviewMeta = computed(() => layoutMode.value === 'mobile' || viewportHeight.value < 680)
const canGoPrevSlideshowPage = computed(() => viewerIndex.value > 0)
const canGoNextSlideshowPage = computed(() => viewerIndex.value < viewerFilePaths.value.length - 1)
// WHY: list stage is intentionally single-pane across desktop/mobile to maximize file-manager workspace.
const isListStage = computed(() => mode.value === 'list')
// WHY: reader/editor/slideshow use one full-width preview stack (no desktop sidebar); return to list for the file tree.
const isPreviewStage = computed(() => mode.value !== 'list')

function buildDirectoryFilePaths(directoryPath: string): string[] {
  return listDirectoryEntries(currentSnapshot.value, directoryPath, currentWorkTree.value)
    .filter((entry) => entry.kind === 'file')
    .map((entry) => entry.path)
}

function loadViewerFileAt(index: number): void {
  const targetPath = viewerFilePaths.value[index]
  if (!targetPath) return
  const source = readFileContentFromSnapshot(currentSnapshot.value, targetPath)
  viewerIndex.value = index
  activeContextPath.value = targetPath
  editorContent.value = source
  savedContent.value = source
  isDirty.value = false
  editorPreviewMode.value = true
  requestModeChange('editor')
  // WHY: `history` is derived from persisted snapshots + `activeContextPath`; refresh so header select matches store without waiting for save/rollback.
  refreshAuthoritativeState()
}

function initializeViewer(
  entryPath: string,
  originKind: ViewerOriginKind,
  originDirectoryPath: string,
  originPath: string,
): void {
  const directoryPath = dirname(entryPath)
  const filePaths = buildDirectoryFilePaths(directoryPath)
  const entryIndex = filePaths.findIndex((path) => path === entryPath)
  if (entryIndex < 0) return
  // WHY: back must restore where the user entered from, not a fixed list root.
  viewerOrigin.value = {
    kind: originKind,
    originPath,
    originDirectoryPath,
  }
  viewerDirectoryPath.value = directoryPath
  viewerFilePaths.value = filePaths
  loadViewerFileAt(entryIndex)
}

function initializeViewerFromDirectory(
  directoryPath: string,
  originDirectoryPath: string,
  originPath: string,
): void {
  const filePaths = buildDirectoryFilePaths(directoryPath)
  viewerOrigin.value = {
    kind: 'dir-slideshow',
    originPath,
    originDirectoryPath,
  }
  viewerDirectoryPath.value = directoryPath
  viewerFilePaths.value = filePaths
  if (filePaths.length === 0) {
    requestModeChange('list')
    return
  }
  loadViewerFileAt(0)
}

function goToPrevSlideshowPage(): void {
  if (!canGoPrevSlideshowPage.value) return
  loadViewerFileAt(viewerIndex.value - 1)
}

function goToNextSlideshowPage(): void {
  if (!canGoNextSlideshowPage.value) return
  loadViewerFileAt(viewerIndex.value + 1)
}

function restoreViewerOriginOrFallbackToList(): void {
  const origin = viewerOrigin.value
  if (!origin) {
    requestModeChange('list')
    return
  }
  const originDirectory = getNodeByPath(currentSnapshot.value, origin.originDirectoryPath)
  const originTarget = getNodeByPath(currentSnapshot.value, origin.originPath)
  if (originDirectory?.type === 'directory' && originTarget) {
    currentDirectoryPath.value = origin.originDirectoryPath
    activeContextPath.value = origin.originPath
  } else {
    currentDirectoryPath.value = ROOT_PATH
    activeContextPath.value = null
  }
  requestModeChange('list')
}

function onOpened(path: string): void {
  currentDirectoryPath.value = path
  activeContextPath.value = null
  requestModeChange('list')
}

function onUpRequested(): void {
  if (currentDirectoryPath.value === ROOT_PATH) return
  currentDirectoryPath.value = dirname(currentDirectoryPath.value)
  activeContextPath.value = null
  requestModeChange('list')
}

function openCreateModal(kind: 'file' | 'directory'): void {
  createKind.value = kind
  createModalOpen.value = true
}

function closeCreateModal(): void {
  createModalOpen.value = false
}

function refreshCurrentDirectoryAfterCreate(targetPath: string): void {
  // WHY: create already updates reactive snapshot; only selection/path guards are needed here.
  // Avoid global view token bumps so the file-manager instance keeps scroll/focus state.
  const normalizedDir = (() => {
    try {
      return normalizePath(currentDirectoryPath.value || ROOT_PATH)
    } catch {
      return ROOT_PATH
    }
  })()
  currentDirectoryPath.value = normalizedDir
  activeContextPath.value = getNodeByPath(currentSnapshot.value, targetPath) ? targetPath : null
}

function handleCreateConfirm(name: string): void {
  if (!name) {
    toastr.error('名称不能为空')
    return
  }
  // WHY: create modal accepts *name only*; path separators would silently turn into nested paths.
  if (/[\\/／＼∕∖⧵]/u.test(name)) {
    toastr.error('名称不能包含路径分隔符')
    return
  }
  // WHY: "." and ".." are relative path segments; create flow accepts literal names only.
  if (name === '.' || name === '..') {
    toastr.error('名称不能为 . 或 ..')
    return
  }
  const targetPath = normalizePath(`${currentDirectoryPath.value}/${name}`)
  try {
    if (createKind.value === 'directory') {
      applySnapshotMutation((core) => core.mkdir(targetPath, { recursive: true }))
    } else {
      applySnapshotMutation((core) => core.writeFile(targetPath, '', { createParents: true }))
    }
    // WHY: keep create-success refresh narrow (current dir + selection) to avoid keyed remount churn.
    refreshCurrentDirectoryAfterCreate(targetPath)
    requestModeChange('list')
    closeCreateModal()
  } catch (error) {
    // WHY: preserve domain exception intent so users see specific reasons instead of a generic failure.
    const mapped = mapVfsMutationError(error, VFS_ERROR_CODES.SAVE_FAILED)
    toastr.error(toVfsErrorToast(mapped.code, mapped.message))
  }
}

function handleGlobalAction(action: VfsGlobalAction): void {
  // WHY: global actions intentionally ignore selection so "more actions" remains useful in empty state.
  if (action === 'create-directory') {
    openCreateModal('directory')
    return
  }
  if (action === 'create-file') {
    openCreateModal('file')
    return
  }
  if (action === 'apply-strategy') {
    openDisplayStrategyDialogForCurrentDirectory()
  }
}

function openDisplayStrategyDialogForCurrentDirectory(): void {
  const currentDirectory = currentDirectoryPath.value
  const config = readScopedWorkTreeFromStore()
  const rule = { ...DEFAULT_ROOT_DIRECTORY_RULE, ...config.directoryRuleByPath[currentDirectory] }
  pendingEntityActionContext.value = {
    id: currentDirectory,
    name: currentDirectory.split('/').at(-1) || '/',
    kind: 'directory',
    path: currentDirectory,
  }
  inputDialogError.value = ''
  inputDialogState.value = {
    action: 'apply-strategy',
    title: '目录纳入规则',
    fields: [
      {
        key: 'sortField',
        label: '排序方式',
        value: rule.sortField,
        type: 'select',
        options: [
          { label: '文件名称', value: 'name' },
          { label: '创建时间', value: 'ctime' },
          { label: '更新时间', value: 'mtime' },
        ],
      },
      {
        key: 'sortDirection',
        label: '排序方向',
        value: rule.sortDirection,
        type: 'select',
        options: [
          { label: '升序', value: 'asc' },
          { label: '降序', value: 'desc' },
        ],
      },
      { key: 'headCount', label: '头部读取', value: String(rule.headCount), type: 'range-number', min: 0, max: 1000, step: 1 },
      { key: 'tailCount', label: '尾部读取', value: String(rule.tailCount), type: 'range-number', min: 0, max: 1000, step: 1 },
      {
        key: 'fill',
        label: '填充策略',
        value: rule.fill,
        type: 'select',
        options: [
          { label: '文件名', value: 'filename' },
          { label: '头信息', value: 'frontmatter' },
          { label: '不展示', value: 'omit' },
        ],
      },
    ],
  }
}

function closeActionDialogs(): void {
  confirmDialogState.value = null
  inputDialogState.value = null
  pendingEntityActionContext.value = null
  inputDialogError.value = ''
}

function validateEntityName(name: string): string | null {
  if (!name) return '名称不能为空'
  if (/[\\/／＼∕∖⧵]/u.test(name)) return '名称不能包含路径分隔符'
  if (name === '.' || name === '..') return '名称不能为 . 或 ..'
  return null
}

function handleEntityAction(action: VfsEntityAction, entityOverride?: VfsManagerEntity | null): void {
  const entity = entityOverride ?? selectedEntity.value
  if (!isActionTriggerable(entity, action)) return
  if (!entity) return
  switch (action) {
    case 'open': {
      if (entity.kind === 'directory') {
        onOpened(entity.path)
        return
      }
      initializeViewer(entity.path, 'file-open', currentDirectoryPath.value, entity.path)
      return
    }
    case 'open-slideshow': {
      if (entity.kind !== 'directory') return
      initializeViewerFromDirectory(entity.path, currentDirectoryPath.value, entity.path)
      return
    }
    case 'toggle-status': {
      const path = entity.path
      updateScopedWorkTree((config) => {
        if (entity.kind === 'file') {
          const currentMode = config.fileInclusionByPath[path] ?? 'follow-parent'
          const cycle: WorkTreeFileInclusionMode[] = ['follow-parent', 'explicit-include', 'explicit-exclude']
          const idx = cycle.indexOf(currentMode)
          const nextMode = cycle[(idx + 1) % cycle.length]
          const fileInclusionByPath = { ...config.fileInclusionByPath }
          if (nextMode === 'follow-parent') delete fileInclusionByPath[path]
          else fileInclusionByPath[path] = nextMode
          return { ...config, fileInclusionByPath }
        }
        if (path === ROOT_PATH) return config
        const enabled = config.directoryRuleEnabledByPath[path] === true
        return {
          ...config,
          directoryRuleEnabledByPath: { ...config.directoryRuleEnabledByPath, [path]: !enabled },
        }
      })
      syncReactiveWorkTree()
      requestModeChange('list')
      return
    }
    case 'delete': {
      pendingEntityActionContext.value = entity
      confirmDialogState.value = {
        action: 'delete',
        title: '确认删除',
        message: `确定删除 ${entity.path} 吗？`,
      }
      return
    }
    case 'rename': {
      pendingEntityActionContext.value = entity
      inputDialogError.value = ''
      inputDialogState.value = {
        action: 'rename',
        title: '重命名',
        fields: [{ key: 'name', label: '名称', value: entity.name, placeholder: '请输入新名称' }],
      }
      return
    }
    case 'apply-strategy': {
      if (entity.kind !== 'directory') return
      currentDirectoryPath.value = entity.path
      openDisplayStrategyDialogForCurrentDirectory()
      return
    }
    default:
      requestModeChange('list')
  }
}

function onConfirmDialogCancel(): void {
  closeActionDialogs()
}

function onConfirmDialogConfirm(): void {
  const action = confirmDialogState.value?.action
  const entity = pendingEntityActionContext.value
  closeActionDialogs()
  if (!action) return
  if (action === 'overwrite') {
    const state = vfsPersistenceStore.getState()
    const template = state.extension.extensionTemplateVfsSnapshot
    if (!template) {
      toastr.error(toVfsErrorToast(VFS_ERROR_CODES.SAVE_FAILED, '模板为空，无法覆盖'))
      return
    }
    try {
      const nextWorkTree = ensureWorkTreeConfig(state.extension.workTreeTemplate)
      // WHY: overwrite is treated as chat re-initialization; clear logs/versions to avoid stale history after reset.
      vfsPersistenceStore.updateChat((draft) => ({
        ...draft,
        chatVfsSnapshot: serializeVfsSnapshot(template),
        chatVfsLogs: [],
        vfsPathVersionStore: {},
        vfsCheckpoints: [],
        templateInitialized: true,
        workTree: nextWorkTree,
      }))
      refreshAllViews()
    } catch {
      toastr.error(toVfsErrorToast(VFS_ERROR_CODES.SAVE_FAILED, '模板覆盖失败'))
    }
    return
  }
  if (!entity) return
  try {
    applySnapshotMutation((core) => core.delete(entity.path, { recursive: true }))
    removeWorkTreePaths(entity.path)
    activeContextPath.value = null
    requestModeChange('list')
  } catch {
    toastr.error(toVfsErrorToast(VFS_ERROR_CODES.DELETE_FAILED, '删除失败'))
  }
}

function onInputDialogCancel(): void {
  closeActionDialogs()
}

function onInputDialogConfirm(payload: Record<string, string>): void {
  const action = inputDialogState.value?.action
  const entity = pendingEntityActionContext.value
  if (!action || !entity) {
    closeActionDialogs()
    return
  }
  if (action === 'rename') {
    const nextName = (payload.name ?? '').trim()
    const error = validateEntityName(nextName)
    if (error) {
      inputDialogError.value = error
      return
    }
    const oldPath = entity.path
    try {
      applySnapshotMutation((core) => core.rename(oldPath, nextName))
      const parent = dirname(oldPath)
      const nextPath = normalizePath(`${parent}/${nextName}`)
      replaceWorkTreePaths(oldPath, nextPath)
      activeContextPath.value = nextPath
      requestModeChange('list')
      closeActionDialogs()
    } catch {
      toastr.error(toVfsErrorToast(VFS_ERROR_CODES.RENAME_FAILED, '重命名失败'))
    }
    return
  }
  const headCount = Number(payload.headCount ?? '0')
  const tailCount = Number(payload.tailCount ?? '0')
  const sortField = payload.sortField === 'ctime' || payload.sortField === 'mtime' ? payload.sortField : 'name'
  const sortDirection = payload.sortDirection === 'desc' ? 'desc' : 'asc'
  const fill = payload.fill === 'filename' || payload.fill === 'frontmatter' || payload.fill === 'omit' ? payload.fill : 'omit'
  try {
    updateScopedWorkTree((config) => {
      const nextRule: DirectoryRule = {
        sortField,
        sortDirection,
        // WHY: dialog accepts free-form number input; enforce schema bounds only at commit time per spec.
        headCount: Number.isFinite(headCount) ? Math.max(0, Math.min(1000, Math.floor(headCount))) : 0,
        tailCount: Number.isFinite(tailCount) ? Math.max(0, Math.min(1000, Math.floor(tailCount))) : 0,
        fill,
      }
      const directoryRuleByPath = { ...config.directoryRuleByPath, [entity.path]: nextRule }
      if (entity.path === ROOT_PATH) {
        return { ...config, directoryRuleByPath }
      }
      return {
        ...config,
        directoryRuleByPath,
        directoryRuleEnabledByPath: { ...config.directoryRuleEnabledByPath, [entity.path]: true },
      }
    })
    syncReactiveWorkTree()
    requestModeChange('list')
    closeActionDialogs()
  } catch {
    toastr.error(toVfsErrorToast(VFS_ERROR_CODES.STRATEGY_APPLY_FAILED, '目录纳入规则应用失败'))
  }
}

function handleRowEntityActionRequested(payload: { entity: VfsManagerEntity; action: VfsEntityAction }): void {
  activeContextPath.value = payload.entity.path
  handleEntityAction(payload.action, payload.entity)
}

function guardTabChange(nextTab: VfsScreenTab): boolean {
  if (nextTab === 'files' || mode.value !== 'editor' || !isDirty.value) return true
  openUnsavedEditorLeave({ kind: 'tab', next: nextTab })
  return false
}

async function handleEditorCheckpointRollback(payload: { checkpointId: string }): Promise<void> {
  const scope = selectedEntity.value?.path ?? '/'
  await withWriteScopeGuard(scope, 'rollback', async () => {
    const ok = await useVfsCheckpointRollback(payload.checkpointId)
    if (!ok) return
    // WHY: rollback result must rehydrate all visible states from persistence as the single source of truth.
    refreshAuthoritativeState()
  })
}

async function handleEditorSaveRequested(): Promise<void> {
  const scope = selectedEntity.value?.path ?? '/'
  await withWriteScopeGuard(scope, 'save', async () => {
    // WHY: Save transitions stay explicit for auditability and predictable async status.
    historyMachine.dispatch({ type: 'SAVE_REQUEST' })
    const targetPath = selectedEntity.value?.kind === 'file' ? selectedEntity.value.path : null
    if (!targetPath) {
      historyMachine.dispatch({
        type: 'SAVE_FAILED',
        errorCode: VFS_ERROR_CODES.SAVE_FAILED,
        message: 'Save failed',
      })
      toastr.error(toVfsErrorToast(VFS_ERROR_CODES.SAVE_FAILED, '没有可保存的文件'))
      return
    }
    try {
      if (isTemplateScope.value) {
        // WHY: template scope has no per-chat checkpoints; keep the existing single-bucket write path.
        applySnapshotMutation((core) => core.writeFile(targetPath, editorContent.value))
      } else {
        // WHY: one `updateChat` commits post-save checkpoint + file bytes so rollback metadata cannot drift from disk state.
        vfsCheckpointService.persistEditorSaveWithCheckpoint(targetPath, editorContent.value)
        currentSnapshot.value = vfsPersistenceStore.getState().chat.chatVfsSnapshot
      }
    } catch (error) {
      const mapped = mapVfsMutationError(error, VFS_ERROR_CODES.SAVE_FAILED)
      historyMachine.dispatch({
        type: 'SAVE_FAILED',
        errorCode: mapped.code,
        message: mapped.message,
      })
      toastr.error(toVfsErrorToast(mapped.code, mapped.message))
      return
    }
    historyMachine.dispatch({ type: 'SAVE_SUCCESS' })
    savedContent.value = editorContent.value
    isDirty.value = false
    refreshAllViews()
    toastr.success('已保存')
  })
}
</script>

<template>
  <VfsTabShellScreen
    ref="tabShellRef"
    :tabs="resolvedTabs"
    :before-tab-change="guardTabChange"
    @tab-changed="handleTabChanged"
  >
    <template #tabs-trailing="{ activeTab: tabsStripTab }">
      <div
        v-if="!isTemplateScope && tabsStripTab === 'files' && isPreviewStage && mode === 'editor'"
        class="vfs-tabs-editor-snapshot-tools"
        data-testid="editor-snapshot-toolbar-tabs"
      >
        <VfsListboxField
          v-model="editorRollbackCheckpointId"
          density="compact"
          dropdown-width="match-trigger"
          class="vfs-tabs-snapshot-listbox"
          :options="editorSnapshotListboxOptions"
          placeholder="检查点…"
          :disabled="!activeContextPath || editorHistoryRecords.length === 0"
          ariaLabel="选择检查点以回滚"
          data-testid="editor-snapshot-listbox-trigger"
        />
        <button
          type="button"
          class="menu_button vfs-tabs-snapshot-rollback-button"
          data-testid="editor-history-rollback-submit"
          title="回滚到所选检查点"
          aria-label="回滚到所选检查点"
          :disabled="!editorRollbackCheckpointId || rollbackInProgress"
          :aria-busy="rollbackInProgress ? 'true' : undefined"
          @click="void handleEditorCheckpointRollback({ checkpointId: editorRollbackCheckpointId })"
        >
          <i
            v-if="rollbackInProgress"
            class="fa-solid fa-spinner fa-spin"
            aria-hidden="true"
          />
          <span v-else>回滚</span>
        </button>
      </div>
    </template>
    <template #default="{ activeTab: slotTab }">
    <div
      v-if="slotTab === 'files'"
      data-testid="vfs-main-layout"
      :data-layout="layoutMode"
      :class="['vfs-main-layout', `layout-${layoutMode}`]"
    >
      <div v-if="isListStage" class="vfs-list-only-layout" data-testid="vfs-list-only-layout">
        <VfsFileManagerPanel
          :key="`fm-${viewRefreshToken}`"
          :mode="mode"
          :current-path="currentDirectoryPath"
          :entries="directoryEntries"
          @opened="onOpened"
          @up-requested="onUpRequested"
          @entity-action-requested="handleRowEntityActionRequested"
        >
          <template #actions>
            <button
              v-if="!isTemplateScope"
              type="button"
              class="vfs-fm-icon-button"
              title="覆盖"
              aria-label="覆盖"
              @click="overwriteCurrentChatWithTemplate"
            >
              <i class="fa-solid fa-download" aria-hidden="true" />
            </button>
            <VfsActionMenu
              :entity="null"
              mode="global-create"
              :include-display-strategy="true"
              @global-action-selected="handleGlobalAction"
            />
          </template>
        </VfsFileManagerPanel>
      </div>

      <div v-else-if="isPreviewStage" class="vfs-preview-stack" data-testid="vfs-preview-stack">
        <section class="vfs-preview-body">
          <header class="vfs-preview-top-bar">
            <div class="vfs-preview-top-bar__left" data-testid="vfs-preview-top-bar-left">
              <button
                type="button"
                class="menu_button vfs-preview-back-button"
                data-testid="vfs-preview-back"
                aria-label="返回"
                title="返回"
                @click="restoreViewerOriginOrFallbackToList"
              >
                <i class="fa-solid fa-arrow-left" aria-hidden="true" />
              </button>
            </div>
            <div class="vfs-preview-top-bar__title">
              <p
                v-if="currentViewerFileTitle"
                class="vfs-preview-file-title"
                :title="currentViewerFileTitle"
                data-testid="viewer-file-title"
              >
                {{ currentViewerFileTitle }}
              </p>
            </div>
            <div class="vfs-preview-chrome-actions">
              <button
                type="button"
                class="menu_button vfs-preview-chrome-button"
                data-testid="editor-preview-toggle"
                :title="editorPreviewMode ? '查看源码' : '预览渲染'"
                :aria-label="editorPreviewMode ? '查看源码' : '预览渲染'"
                :disabled="!activeContextPath"
                @click="editorPreviewMode = !editorPreviewMode"
              >
                <i :class="editorPreviewMode ? 'fa-solid fa-code' : 'fa-solid fa-eye'" aria-hidden="true" />
              </button>
              <button
                data-testid="editor-save-submit"
                type="button"
                class="menu_button vfs-preview-chrome-button"
                :title="saveInProgress ? '保存中' : '保存'"
                :aria-label="saveInProgress ? '保存中' : '保存'"
                :disabled="saveInProgress"
                :aria-busy="saveInProgress ? 'true' : undefined"
                @click="void handleEditorSaveRequested()"
              >
                <i
                  v-if="saveInProgress"
                  class="fa-solid fa-spinner fa-spin"
                  aria-hidden="true"
                />
                <i v-else class="fa-solid fa-floppy-disk" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="menu_button vfs-preview-chrome-button"
                data-testid="slideshow-prev-page"
                title="Prev"
                aria-label="Prev"
                :disabled="!canGoPrevSlideshowPage"
                @click="goToPrevSlideshowPage"
              >
                <i class="fa-solid fa-chevron-left" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="menu_button vfs-preview-chrome-button"
                data-testid="slideshow-next-page"
                title="Next"
                aria-label="Next"
                :disabled="!canGoNextSlideshowPage"
                @click="goToNextSlideshowPage"
              >
                <i class="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </header>
          <section
            :class="[
              'vfs-preview-content-frame',
              shouldShowPreviewMetadata
                ? shouldUseFlowPreviewMeta
                  ? 'vfs-preview-content-frame--meta-flow'
                  : 'vfs-preview-content-frame--meta-anchored'
                : null,
            ]"
            data-testid="vfs-preview-content-frame"
            data-vfs-preview-surface="shared"
          >
            <ReaderScreen v-if="mode === 'reader'" :key="`reader-${viewRefreshToken}`" :html="readerHtml" />
            <div v-else-if="mode === 'editor'" class="vfs-editor-stage">
              <EditorScreen
                :key="`editor-${viewRefreshToken}`"
                v-model="editorContent"
                v-model:preview-mode="editorPreviewMode"
                :save-in-progress="saveInProgress"
                :embed-toolbar="false"
                @update:model-value="isDirty = true"
              />
            </div>
            <SlideshowScreen
              v-else-if="mode === 'slideshow'"
              :pages="slideshowPages"
              :page-index="viewerIndex"
            />
            <footer
              v-if="shouldShowPreviewMetadata"
              :class="['vfs-preview-meta', shouldUseFlowPreviewMeta ? 'vfs-preview-meta--flow' : 'vfs-preview-meta--anchored']"
              data-testid="vfs-preview-meta"
              :title="`创建: ${currentViewerCreatedAtText} | 更新: ${currentViewerUpdatedAtText}`"
            >
              <span>创建: {{ currentViewerCreatedAtText }}</span>
              <span>更新: {{ currentViewerUpdatedAtText }}</span>
            </footer>
          </section>
        </section>
      </div>
    </div>

    <VfsHistoryScreen v-else-if="slotTab === 'history'" :key="`history-${viewRefreshToken}`" />
    <WorkTreeScreen v-else-if="slotTab === 'worktree'" :text="renderedWorkTreeText" />
    <VfsCreateEntityModal
      :open="createModalOpen"
      :kind="createKind"
      @confirm="handleCreateConfirm"
      @cancel="closeCreateModal"
    />
    <VfsUnsavedEditorDialog
      :open="unsavedDialogOpen"
      @save="onUnsavedEditorDialogSave"
      @discard="onUnsavedEditorDialogDiscard"
      @cancel="onUnsavedEditorDialogCancel"
    />
    <VfsActionConfirmDialog
      :open="confirmDialogState !== null"
      :title="confirmDialogState?.title"
      :message="confirmDialogState?.message ?? ''"
      @confirm="onConfirmDialogConfirm"
      @cancel="onConfirmDialogCancel"
    />
    <VfsActionInputDialog
      :open="inputDialogState !== null"
      :title="inputDialogState?.title"
      :fields="inputDialogState?.fields ?? []"
      :error-message="inputDialogError"
      @confirm="onInputDialogConfirm"
      @cancel="onInputDialogCancel"
    />
    </template>
  </VfsTabShellScreen>
</template>

<style scoped>
.vfs-main-layout {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

.vfs-list-only-layout {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.vfs-preview-stack {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.vfs-preview-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1 1 auto;
}

.vfs-preview-top-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  position: relative;
}

.vfs-tabs-editor-snapshot-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

/* WHY: labels are `时间 · {工具批次|保存|检查点}` — desktop keeps a stable trigger width; narrow viewports shrink with the tab strip (see mobile media block). */
.vfs-tabs-snapshot-listbox {
  flex: 0 0 auto;
  width: 11rem;
  min-width: 11rem;
  max-width: 11rem;
}

.vfs-tabs-snapshot-rollback-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
  min-height: 30px;
  padding: 4px 8px;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.vfs-preview-top-bar__left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  flex-shrink: 0;
}

.vfs-preview-top-bar__title {
  flex: 1 1 auto;
  min-width: 0;
}

.vfs-preview-chrome-actions {
  margin-left: auto;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vfs-preview-chrome-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.25rem;
  min-height: 2.25rem;
  padding: 6px 10px;
}

.vfs-preview-file-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0.92;
  font-weight: 700;
  font-size: 1.08rem;
  line-height: 1.2;
}

.vfs-preview-body > :not(.vfs-preview-top-bar) {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}

.vfs-preview-content-frame {
  /* WHY: keep all preview modes inside one shared visual container while preserving existing mode switching behavior. */
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.14);
  position: relative;
}

.vfs-preview-content-frame--meta-anchored {
  padding-bottom: 34px;
}

.vfs-editor-stage {
  /* WHY: stabilize editor flex growth across component boundaries in both desktop/mobile preview layouts. */
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}

.vfs-preview-back-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.25rem;
  min-height: 2.25rem;
  padding: 6px 10px;
}

.vfs-preview-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  line-height: 1.3;
  opacity: 0.72;
  white-space: nowrap;
}

.vfs-preview-meta--anchored {
  position: absolute;
  right: 12px;
  bottom: 8px;
}

.vfs-preview-meta--flow {
  margin-top: 8px;
  margin-left: auto;
}

/*
  WHY: `data-layout` mirrors `innerWidth < 1024` — two rows: (1) back + chrome buttons, (2) full-width title.
  `order: -1` on `__left` + `chrome-actions` pulls the button strip above the title without DOM surgery.
*/
[data-layout='mobile'] .vfs-preview-top-bar {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}

[data-layout='mobile'] .vfs-preview-top-bar__left {
  order: -1;
  flex: 0 0 auto;
}

[data-layout='mobile'] .vfs-preview-chrome-actions {
  order: -1;
  flex: 1 1 0;
  min-width: 0;
  margin-left: 0;
  justify-content: flex-start;
  flex-wrap: nowrap;
  box-sizing: border-box;
}

[data-layout='mobile'] .vfs-preview-top-bar__title {
  order: 0;
  flex: 0 0 100%;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  text-align: center;
}

[data-layout='mobile'] .vfs-preview-file-title {
  text-align: center;
}

/* WHY: checkpoint toolbar lives in `VfsTabShellScreen` header (not under `[data-layout]`) — same 1023 breakpoint as `layoutMode` for listbox flex shrink. */
@media (max-width: 1023px) {
  .vfs-tabs-editor-snapshot-tools {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
    width: 100%;
  }

  .vfs-tabs-snapshot-listbox {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
    width: 100%;
  }
}
</style>
