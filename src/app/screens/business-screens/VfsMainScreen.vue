<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import {
  createVfsCommitHistoryStore,
  type VfsCommitActionType,
  type VfsCommitHistoryRecord,
} from '@/app/composables/components-composables/useVfsCommitHistory'
import {
  isActionTriggerable,
  type VfsEntityAction,
  type VfsManagerEntity,
} from '@/app/composables/components-composables/useVfsFileManagerModel'
import VfsFileManagerPanel from '@/app/components/business-components/VfsFileManagerPanel.vue'
import VfsLogPanel from '@/app/components/business-components/VfsLogPanel.vue'
import {
  useVfsMessageHooks,
  VFS_LOG_REFRESH_AUTO,
  VFS_STATE_REFRESH_REQUIRED,
} from '@/app/composables/components-composables/useVfsMessageHooks'
import VfsHistoryScreen from '@/app/screens/business-screens/VfsHistoryScreen.vue'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import SlideshowScreen from '@/app/screens/pure-screens/SlideshowScreen.vue'
import VfsTabShellScreen from '@/app/screens/pure-screens/VfsTabShellScreen.vue'
import { useVfsCommitActions } from '@/app/composables/components-composables/useVfsCommitActions'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'
import { useVfsRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { VFS_POPUP_BEFORE_CLOSE } from '@/app/composables/components-composables/useVfsMessageHooks'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import type { VfsSnapshot } from '@/domain/vfs/types'
import type { VfsBrowserEntity } from '@/app/components/business-components/VfsFileManagerPanel.vue'
import { dirname, normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { VfsCore } from '@/domain/vfs/vfs-core'
import { DEFAULT_DIRECTORY_RULE, type DirectoryRule, type WorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

const mode = ref<'list' | 'reader' | 'editor' | 'slideshow'>('list')
const editorContent = ref('')
const savedContent = ref('')
const isDirty = ref(false)
const viewRefreshToken = ref(0)
const layoutMode = ref<'mobile' | 'desktop'>(window.innerWidth >= 1024 ? 'desktop' : 'mobile')
const activeTab = ref<'files' | 'history' | 'logs'>('files')
const history = createVfsCommitHistoryStore()
const historyMachine = createVfsHistoryStateMachine()
const saveRequestsInFlight = ref(0)
const rollbackRequestsInFlight = ref(0)
const saveInProgress = ref(false)
const rollbackInProgress = ref(false)
const currentDirectoryPath = ref<string>(ROOT_PATH)
const selectedPath = ref<string | null>(null)
const slideshowDirectoryPath = ref<string>(ROOT_PATH)
const codec = new DeflateContentCodec()

const readerHtml = computed(() => editorContent.value)
const editorHistoryRecords = computed<VfsCommitHistoryRecord[]>(() => history.records.value)
const chatSnapshot = computed(() => vfsPersistenceStore.getState().chat.chatVfsSnapshot)

const logRefreshToken = ref(0)
let disposeMessageHooks: (() => void) | null = null

const updateLayout = () => {
  layoutMode.value = window.innerWidth >= 1024 ? 'desktop' : 'mobile'
}

function ensureWorkTreeConfig(existing: WorkTreeConfig | null): WorkTreeConfig {
  if (existing) return existing
  return {
    defaultRule: { ...DEFAULT_DIRECTORY_RULE },
    directoryOverrides: {},
    directoryRulesEnabled: {},
    selectedFiles: [],
  }
}

function getNodeByPath(snapshot: VfsSnapshot, path: string) {
  const p = normalizePath(path)
  return Object.values(snapshot.nodes).find((candidate) => candidate.path === p) ?? null
}

function listDirectoryEntries(snapshot: VfsSnapshot, directoryPath: string): VfsBrowserEntity[] {
  const dirNode = getNodeByPath(snapshot, directoryPath)
  if (!dirNode || dirNode.type !== 'directory') return []
  return dirNode.children
    .map((id) => snapshot.nodes[id])
    .filter(Boolean)
    .map((node) => ({
      path: node.path,
      name: node.name,
      kind: (node.type === 'file' ? 'file' : 'directory') as 'file' | 'directory',
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

function readFileContentFromSnapshot(snapshot: VfsSnapshot, path: string): string {
  const node = getNodeByPath(snapshot, path)
  if (!node || node.type !== 'file') return ''
  return codec.decode(node.content)
}

function applySnapshotMutation(mutator: (core: VfsCore) => void): void {
  const core = new VfsCore(codec)
  core.importSnapshot(chatSnapshot.value)
  mutator(core)
  const next = core.exportSnapshot()
  vfsPersistenceStore.updateChat((draft) => ({
    ...draft,
    chatVfsSnapshot: next,
  }))
}

function replaceWorkTreePaths(oldPath: string, newPath: string): void {
  // WHY: rename/delete must not leave dangling path references inside macro configuration.
  vfsPersistenceStore.updateChat((draft) => {
    const config = ensureWorkTreeConfig(draft.workTree)
    const selectedFiles = config.selectedFiles.map((p) => (p === oldPath ? newPath : p))
    const directoryRulesEnabled: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(config.directoryRulesEnabled)) {
      directoryRulesEnabled[k === oldPath ? newPath : k] = v
    }
    const directoryOverrides: Record<string, DirectoryRule> = {}
    for (const [k, v] of Object.entries(config.directoryOverrides)) {
      directoryOverrides[k === oldPath ? newPath : k] = v
    }
    return {
      ...draft,
      workTree: {
        ...config,
        selectedFiles,
        directoryRulesEnabled,
        directoryOverrides,
      },
    }
  })
}

function removeWorkTreePaths(removedPath: string): void {
  vfsPersistenceStore.updateChat((draft) => {
    const config = ensureWorkTreeConfig(draft.workTree)
    const selectedFiles = config.selectedFiles.filter((p) => p !== removedPath)
    const directoryRulesEnabled = { ...config.directoryRulesEnabled }
    delete directoryRulesEnabled[removedPath]
    const directoryOverrides = { ...config.directoryOverrides }
    delete directoryOverrides[removedPath]
    return { ...draft, workTree: { ...config, selectedFiles, directoryRulesEnabled, directoryOverrides } }
  })
}

function refreshAuthoritativeState(): void {
  const chatState = vfsPersistenceStore.getState().chat
  history.replaceRecords(
    chatState.chatVfsVersions.map((entry) => ({
      commitId: entry.id,
      time: entry.time,
      operator: entry.operator,
      actionType: entry.actionType,
      scope: entry.scope,
      sourceVersionId: entry.sourceVersion?.id,
    })),
  )

  const normalizedDir = (() => {
    try {
      return normalizePath(currentDirectoryPath.value || ROOT_PATH)
    } catch {
      return ROOT_PATH
    }
  })()
  currentDirectoryPath.value = normalizedDir

  if (selectedPath.value) {
    const node = getNodeByPath(chatState.chatVfsSnapshot, selectedPath.value)
    if (!node) selectedPath.value = null
  }

  const node = selectedPath.value ? getNodeByPath(chatState.chatVfsSnapshot, selectedPath.value) : null
  if (!node || node.type !== 'file') return
  const source = readFileContentFromSnapshot(chatState.chatVfsSnapshot, node.path)
  editorContent.value = source
  savedContent.value = source
  isDirty.value = false
}

const refreshAllViews = () => {
  // WHY: keep all screens synced to persisted state after rollback/save side effects.
  refreshAuthoritativeState()
  viewRefreshToken.value += 1
}

function appendHistory(actionType: VfsCommitActionType, scope: string, sourceVersionId?: string): void {
  history.appendRecord({
    time: new Date().toISOString(),
    operator: 'assistant',
    actionType,
    scope,
    sourceVersionId,
  })
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

function handlePopupBeforeClose(event: Event): void {
  if (mode.value !== 'editor' || !isDirty.value) return
  if (window.confirm('Unsaved changes will be discarded. Continue?')) {
    discardEditorDraft()
    return
  }
  event.preventDefault()
}

function onLogRefreshAutoRequested(): void {
  // WHY: message events should trigger one refresh immediately, not deferred by active tab.
  logRefreshToken.value += 1
}

function handleTabChanged(nextTab: 'files' | 'history' | 'logs'): void {
  activeTab.value = nextTab
}

onMounted(() => {
  window.addEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)
  window.addEventListener(VFS_POPUP_BEFORE_CLOSE, handlePopupBeforeClose)
  window.addEventListener(VFS_LOG_REFRESH_AUTO, onLogRefreshAutoRequested)
  window.addEventListener('resize', updateLayout)
  disposeMessageHooks = useVfsMessageHooks()
  refreshAuthoritativeState()
})

onUnmounted(() => {
  window.removeEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)
  window.removeEventListener(VFS_POPUP_BEFORE_CLOSE, handlePopupBeforeClose)
  window.removeEventListener(VFS_LOG_REFRESH_AUTO, onLogRefreshAutoRequested)
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
  // WHY: force-exit intentionally discards draft per product rule.
  if (window.confirm('Unsaved changes will be discarded. Continue?')) {
    discardEditorDraft()
    mode.value = nextMode
  }
}

const directoryEntries = computed(() => listDirectoryEntries(chatSnapshot.value, currentDirectoryPath.value))
const selectedEntity = computed<VfsManagerEntity | null>(() => {
  if (!selectedPath.value) return null
  const node = getNodeByPath(chatSnapshot.value, selectedPath.value)
  if (!node || (node.type !== 'file' && node.type !== 'directory')) return null
  return {
    id: node.id,
    name: node.name,
    kind: (node.type === 'file' ? 'file' : 'directory') as 'file' | 'directory',
    path: node.path,
  }
})

const slideshowDirectoryOptions = computed(() =>
  directoryEntries.value.filter((entry) => entry.kind === 'directory').map((entry) => ({ path: entry.path, name: entry.name })),
)

const slideshowPages = computed(() => {
  const snapshot = chatSnapshot.value
  const dirPath = slideshowDirectoryPath.value
  const entries = listDirectoryEntries(snapshot, dirPath)
  const files = entries.filter((entry) => entry.kind === 'file')
  return files.map((entry) => ({
    path: entry.path,
    title: entry.name,
    content: readFileContentFromSnapshot(snapshot, entry.path),
  }))
})

function onSelected(path: string): void {
  selectedPath.value = path
}

function onOpened(path: string): void {
  currentDirectoryPath.value = path
  selectedPath.value = null
  requestModeChange('list')
}

function onUpRequested(): void {
  if (currentDirectoryPath.value === ROOT_PATH) return
  currentDirectoryPath.value = dirname(currentDirectoryPath.value)
  selectedPath.value = null
  requestModeChange('list')
}

function handleEntityAction(action: VfsEntityAction): void {
  if (!isActionTriggerable(selectedEntity.value, action)) return
  const entity = selectedEntity.value
  if (!entity) return
  switch (action) {
    case 'view': {
      if (entity.kind !== 'file') return
      requestModeChange('reader')
      return
    }
    case 'edit': {
      if (entity.kind !== 'file') return
      requestModeChange('editor')
      return
    }
    case 'open-slideshow': {
      if (entity.kind !== 'directory') return
      slideshowDirectoryPath.value = entity.path
      requestModeChange('slideshow')
      return
    }
    case 'toggle-status': {
      const path = entity.path
      vfsPersistenceStore.updateChat((draft) => {
        const config = ensureWorkTreeConfig(draft.workTree)
        if (entity.kind === 'file') {
          const selected = new Set(config.selectedFiles)
          if (selected.has(path)) selected.delete(path)
          else selected.add(path)
          return { ...draft, workTree: { ...config, selectedFiles: [...selected] } }
        }
        const enabled = config.directoryRulesEnabled[path] === true
        return {
          ...draft,
          workTree: { ...config, directoryRulesEnabled: { ...config.directoryRulesEnabled, [path]: !enabled } },
        }
      })
      requestModeChange('list')
      return
    }
    case 'delete': {
      if (!window.confirm(`Delete ${entity.path}?`)) return
      try {
        applySnapshotMutation((core) => core.delete(entity.path, { recursive: true }))
        removeWorkTreePaths(entity.path)
        selectedPath.value = null
        requestModeChange('list')
      } catch (e) {
        toastr.error(toVfsErrorToast(VFS_ERROR_CODES.DELETE_FAILED, '删除失败'))
      }
      return
    }
    case 'rename': {
      const nextName = window.prompt('New name', entity.name)?.trim()
      if (!nextName) return
      const oldPath = entity.path
      try {
        applySnapshotMutation((core) => core.rename(oldPath, nextName))
        const parent = dirname(oldPath)
        const nextPath = normalizePath(`${parent}/${nextName}`)
        replaceWorkTreePaths(oldPath, nextPath)
        selectedPath.value = nextPath
        requestModeChange('list')
      } catch {
        toastr.error(toVfsErrorToast(VFS_ERROR_CODES.RENAME_FAILED, '重命名失败'))
      }
      return
    }
    case 'apply-strategy': {
      if (entity.kind !== 'directory') return
      const headCount = Number(window.prompt('Head count (0..1000)', '0') ?? '0')
      const tailCount = Number(window.prompt('Tail count (0..1000)', '0') ?? '0')
      const fill = (window.prompt('Fill strategy: filename | frontmatter | omit', 'omit') ?? 'omit').trim()
      try {
        vfsPersistenceStore.updateChat((draft) => {
          const config = ensureWorkTreeConfig(draft.workTree)
          const nextRule: DirectoryRule = {
            ...config.defaultRule,
            headCount: Number.isFinite(headCount) ? Math.max(0, Math.min(1000, Math.floor(headCount))) : 0,
            tailCount: Number.isFinite(tailCount) ? Math.max(0, Math.min(1000, Math.floor(tailCount))) : 0,
            fill: fill === 'filename' || fill === 'frontmatter' || fill === 'omit' ? fill : 'omit',
          }
          return {
            ...draft,
            workTree: {
              ...config,
              directoryOverrides: { ...config.directoryOverrides, [entity.path]: nextRule },
              directoryRulesEnabled: { ...config.directoryRulesEnabled, [entity.path]: true },
            },
          }
        })
      } catch {
        toastr.error(toVfsErrorToast(VFS_ERROR_CODES.STRATEGY_APPLY_FAILED, '展示策略应用失败'))
      }
      requestModeChange('list')
      return
    }
    default:
      requestModeChange('list')
  }
}

function guardTabChange(nextTab: 'files' | 'history' | 'logs'): boolean {
  if (nextTab === 'files' || mode.value !== 'editor' || !isDirty.value) return true
  if (!window.confirm('Unsaved changes will be discarded. Continue?')) return false
  discardEditorDraft()
  return true
}

async function handleEditorManualRollback(payload: { sourceVersionId: string }): Promise<void> {
  const scope = selectedEntity.value?.path ?? '/'
  await withWriteScopeGuard(scope, 'rollback', async () => {
    const ok = await useVfsRollbackAction(payload.sourceVersionId)
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
    const ok = await useVfsCommitActions(scope)
    if (!ok) {
      historyMachine.dispatch({
        type: 'SAVE_FAILED',
        errorCode: VFS_ERROR_CODES.SAVE_FAILED,
        message: 'Save failed',
      })
      return
    }
    historyMachine.dispatch({ type: 'SAVE_SUCCESS' })
    appendHistory('save', scope)
    savedContent.value = editorContent.value
    isDirty.value = false
  })
}
</script>

<template>
  <VfsTabShellScreen :before-tab-change="guardTabChange" @tab-changed="handleTabChanged" v-slot="{ activeTab: slotTab }">
    <div
      v-if="slotTab === 'files'"
      data-testid="vfs-main-layout"
      :data-layout="layoutMode"
      :class="['vfs-main-layout', `layout-${layoutMode}`]"
    >
      <div v-if="layoutMode === 'desktop'" class="vfs-desktop-grid" data-testid="vfs-desktop-grid">
        <aside class="vfs-sidebar">
          <VfsFileManagerPanel
            :key="`fm-${viewRefreshToken}`"
            :mode="mode"
            :current-path="currentDirectoryPath"
            :entries="directoryEntries"
            :selected-path="selectedPath"
            @selected="onSelected"
            @opened="onOpened"
            @up-requested="onUpRequested"
          >
            <template #actions>
              <VfsActionMenu :entity="selectedEntity" @action-selected="handleEntityAction" />
            </template>
          </VfsFileManagerPanel>
        </aside>

        <main class="vfs-content">
          <ReaderScreen v-if="mode === 'reader'" :key="`reader-${viewRefreshToken}`" :html="readerHtml" />
          <EditorScreen
            v-else-if="mode === 'editor'"
            :key="`editor-${viewRefreshToken}`"
            v-model="editorContent"
            :history-records="editorHistoryRecords"
            :save-in-progress="saveInProgress"
            :rollback-in-progress="rollbackInProgress"
            @update:model-value="isDirty = true"
            @save-requested="handleEditorSaveRequested"
            @manual-rollback-requested="handleEditorManualRollback"
          />
          <SlideshowScreen
            v-else-if="mode === 'slideshow'"
            :directories="slideshowDirectoryOptions"
            :pages="slideshowPages"
            :initial-directory-path="slideshowDirectoryPath"
          />
          <section v-else class="vfs-empty" data-testid="vfs-desktop-empty">Select an item then use More.</section>
        </main>
      </div>

      <div v-else class="vfs-mobile-stack">
        <VfsFileManagerPanel
          v-if="mode === 'list'"
          :key="`fm-${viewRefreshToken}`"
          :mode="mode"
          :current-path="currentDirectoryPath"
          :entries="directoryEntries"
          :selected-path="selectedPath"
          @selected="onSelected"
          @opened="onOpened"
          @up-requested="onUpRequested"
        >
          <template #actions>
            <VfsActionMenu :entity="selectedEntity" @action-selected="handleEntityAction" />
          </template>
        </VfsFileManagerPanel>

        <section v-else class="vfs-mobile-content">
          <button type="button" data-testid="vfs-mobile-back" @click="requestModeChange('list')">Back</button>
          <ReaderScreen v-if="mode === 'reader'" :key="`reader-${viewRefreshToken}`" :html="readerHtml" />
          <EditorScreen
            v-else-if="mode === 'editor'"
            :key="`editor-${viewRefreshToken}`"
            v-model="editorContent"
            :history-records="editorHistoryRecords"
            :save-in-progress="saveInProgress"
            :rollback-in-progress="rollbackInProgress"
            @update:model-value="isDirty = true"
            @save-requested="handleEditorSaveRequested"
            @manual-rollback-requested="handleEditorManualRollback"
          />
          <SlideshowScreen
            v-else
            :directories="slideshowDirectoryOptions"
            :pages="slideshowPages"
            :initial-directory-path="slideshowDirectoryPath"
          />
        </section>
      </div>
    </div>

    <VfsHistoryScreen v-else-if="slotTab === 'history'" :key="`history-${viewRefreshToken}`" />
    <VfsLogPanel v-else :refresh-token="logRefreshToken" />
  </VfsTabShellScreen>
</template>

<style scoped>
.vfs-desktop-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: 12px;
  align-items: start;
}

.vfs-sidebar {
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  padding-right: 12px;
}

.vfs-content {
  min-height: 320px;
}

.vfs-mobile-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
