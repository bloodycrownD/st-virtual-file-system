<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import VfsFileManagerPanel from '@/app/components/business-components/VfsFileManagerPanel.vue'
import VfsLogPanel from '@/app/components/business-components/VfsLogPanel.vue'
import { VFS_STATE_REFRESH_REQUIRED } from '@/app/composables/components-composables/useVfsMessageHooks'
import VfsHistoryScreen from '@/app/screens/business-screens/VfsHistoryScreen.vue'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import SlideshowScreen from '@/app/screens/pure-screens/SlideshowScreen.vue'
import VfsTabShellScreen from '@/app/screens/pure-screens/VfsTabShellScreen.vue'

const mode = ref<'list' | 'reader' | 'editor' | 'slideshow'>('list')
const editorContent = ref('')
const isDirty = ref(false)
const viewRefreshToken = ref(0)
const activeDirectory = ref('docs')
const slideshowDirectories = ref([
  { id: 'docs', name: 'Docs', pages: ['docs-1', 'docs-2', 'docs-3'] },
  { id: 'notes', name: 'Notes', pages: ['notes-1', 'notes-2'] },
])

const readerHtml = computed(() => editorContent.value)

const refreshAllViews = () => {
  // WHY: one monotonic token keeps file manager/reader/editor/history refresh in sync after rollback.
  viewRefreshToken.value += 1
}

onMounted(() => {
  window.addEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)
})

onUnmounted(() => {
  window.removeEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)
})

function tryLeaveEditor(nextMode: 'list' | 'reader' | 'slideshow'): void {
  if (mode.value !== 'editor' || !isDirty.value) {
    mode.value = nextMode
    return
  }
  // WHY: force-exit intentionally discards draft per product rule.
  if (window.confirm('Unsaved changes will be discarded. Continue?')) {
    isDirty.value = false
    mode.value = nextMode
  }
}
</script>

<template>
  <VfsTabShellScreen v-slot="{ activeTab }">
    <div v-if="activeTab === 'files'">
      <VfsFileManagerPanel :key="`fm-${viewRefreshToken}`" :mode="mode">
        <VfsActionMenu entity-type="file" />
        <select v-model="activeDirectory">
          <option value="docs">docs</option>
          <option value="notes">notes</option>
        </select>
        <button type="button" @click="mode = 'reader'">Open Reader</button>
        <button type="button" @click="mode = 'editor'">Open Editor</button>
        <button type="button" @click="mode = 'slideshow'">Open Slideshow</button>
        <button type="button" @click="tryLeaveEditor('list')">Back to List</button>
      </VfsFileManagerPanel>
      <ReaderScreen v-if="mode === 'reader'" :key="`reader-${viewRefreshToken}`" :html="readerHtml" />
      <EditorScreen
        v-if="mode === 'editor'"
        :key="`editor-${viewRefreshToken}`"
        v-model="editorContent"
        @update:model-value="isDirty = true"
      />
      <SlideshowScreen v-if="mode === 'slideshow'" :directories="slideshowDirectories" />
    </div>
    <VfsHistoryScreen v-else-if="activeTab === 'history'" :key="`history-${viewRefreshToken}`" />
    <VfsLogPanel v-else />
  </VfsTabShellScreen>
</template>
