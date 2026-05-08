<script setup lang="ts">
import { computed, ref } from 'vue'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import VfsFileManagerPanel from '@/app/components/business-components/VfsFileManagerPanel.vue'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import SlideshowScreen from '@/app/screens/pure-screens/SlideshowScreen.vue'
import VfsTabShellScreen from '@/app/screens/pure-screens/VfsTabShellScreen.vue'

const mode = ref<'list' | 'reader' | 'editor' | 'slideshow'>('list')
const editorContent = ref('')
const isDirty = ref(false)

const readerHtml = computed(() => editorContent.value)

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
      <VfsFileManagerPanel :mode="mode">
        <VfsActionMenu entity-type="file" />
        <button type="button" @click="mode = 'reader'">Open Reader</button>
        <button type="button" @click="mode = 'editor'">Open Editor</button>
        <button type="button" @click="mode = 'slideshow'">Open Slideshow</button>
        <button type="button" @click="tryLeaveEditor('list')">Back to List</button>
      </VfsFileManagerPanel>
      <ReaderScreen v-if="mode === 'reader'" :html="readerHtml" />
      <EditorScreen
        v-if="mode === 'editor'"
        v-model="editorContent"
        @update:model-value="isDirty = true"
      />
      <SlideshowScreen v-if="mode === 'slideshow'" />
    </div>
    <div v-else-if="activeTab === 'history'">History tab scaffold</div>
    <div v-else>Logs tab scaffold</div>
  </VfsTabShellScreen>
</template>
