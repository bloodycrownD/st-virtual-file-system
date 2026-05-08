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
import { VFS_STATE_REFRESH_REQUIRED } from '@/app/composables/components-composables/useVfsMessageHooks'
import VfsHistoryScreen from '@/app/screens/business-screens/VfsHistoryScreen.vue'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import SlideshowScreen from '@/app/screens/pure-screens/SlideshowScreen.vue'
import VfsTabShellScreen from '@/app/screens/pure-screens/VfsTabShellScreen.vue'
import { useVfsRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const mode = ref<'list' | 'reader' | 'editor' | 'slideshow'>('list')
const editorContent = ref('')
const savedContent = ref('')
const isDirty = ref(false)
const viewRefreshToken = ref(0)
const activeDirectory = ref('docs')
const layoutMode = ref<'mobile' | 'desktop'>(window.innerWidth >= 1024 ? 'desktop' : 'mobile')
const entityList = ref<VfsManagerEntity[]>([
  { id: 'docs-file', name: 'docs.md', kind: 'file', path: '/docs/docs.md' },
  { id: 'notes-dir', name: 'notes', kind: 'directory', path: '/notes' },
])
const selectedEntityId = ref('docs-file')
const history = createVfsCommitHistoryStore()
const slideshowDirectories = ref([
  { id: 'docs', name: 'Docs', pages: ['docs-1', 'docs-2', 'docs-3'] },
  { id: 'notes', name: 'Notes', pages: ['notes-1', 'notes-2'] },
])

const readerHtml = computed(() => editorContent.value)
const selectedEntity = computed(() => entityList.value.find((item) => item.id === selectedEntityId.value) ?? null)
const editorHistoryRecords = computed<VfsCommitHistoryRecord[]>(() => history.records.value)

const updateLayout = () => {
  layoutMode.value = window.innerWidth >= 1024 ? 'desktop' : 'mobile'
}

const refreshAllViews = () => {
  // WHY: one monotonic token keeps file manager/reader/editor/history refresh in sync after rollback.
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

onMounted(() => {
  window.addEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)
  window.addEventListener('resize', updateLayout)
})

onUnmounted(() => {
  window.removeEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)
  window.removeEventListener('resize', updateLayout)
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

function handleEntityAction(action: VfsEntityAction): void {
  if (!isActionTriggerable(selectedEntity.value, action)) return
  switch (action) {
    case 'view':
      requestModeChange('reader')
      break
    case 'edit':
      requestModeChange('editor')
      break
    case 'open-slideshow':
      requestModeChange('slideshow')
      break
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
  const ok = await useVfsRollbackAction(payload.sourceVersionId)
  if (!ok) return
  // WHY: rollback success is a new commit entry; failures must preserve the current editor draft.
  appendHistory('rollback', selectedEntity.value?.path ?? '/', payload.sourceVersionId)
  savedContent.value = editorContent.value
  isDirty.value = false
}
</script>

<template>
  <VfsTabShellScreen :before-tab-change="guardTabChange" v-slot="{ activeTab }">
    <div v-if="activeTab === 'files'" data-testid="vfs-main-layout" :data-layout="layoutMode" :class="`layout-${layoutMode}`">
      <VfsFileManagerPanel :key="`fm-${viewRefreshToken}`" :mode="mode">
        <select v-model="selectedEntityId">
          <option v-for="entity in entityList" :key="entity.id" :value="entity.id">
            {{ entity.kind }}: {{ entity.name }}
          </option>
        </select>
        <VfsActionMenu :entity="selectedEntity" @action-selected="handleEntityAction" />
        <select v-model="activeDirectory">
          <option value="docs">docs</option>
          <option value="notes">notes</option>
        </select>
        <button type="button" @click="requestModeChange('reader')">Open Reader</button>
        <button type="button" @click="requestModeChange('editor')">Open Editor</button>
        <button type="button" @click="requestModeChange('slideshow')">Open Slideshow</button>
        <button type="button" @click="requestModeChange('list')">Back to List</button>
      </VfsFileManagerPanel>
      <ReaderScreen v-if="mode === 'reader'" :key="`reader-${viewRefreshToken}`" :html="readerHtml" />
      <EditorScreen
        v-if="mode === 'editor'"
        :key="`editor-${viewRefreshToken}`"
        v-model="editorContent"
        :history-records="editorHistoryRecords"
        @update:model-value="isDirty = true"
        @manual-rollback-requested="handleEditorManualRollback"
      />
      <SlideshowScreen v-if="mode === 'slideshow'" :directories="slideshowDirectories" />
    </div>
    <VfsHistoryScreen v-else-if="activeTab === 'history'" :key="`history-${viewRefreshToken}`" />
    <VfsLogPanel v-else />
  </VfsTabShellScreen>
</template>
