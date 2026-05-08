<script setup lang="ts">
import { computed } from 'vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { renderSafeContent } from '@/app/services/vfs/renderPipeline'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

const props = defineProps<{ html: string }>()

const safeHtml = computed(() => {
  const result = renderSafeContent(props.html)
  if (!result.ok) {
    toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.RENDER_FAILED, result.message))
    return ''
  }
  return result.html ?? ''
})
</script>

<template>
  <article class="vfs-reader prose" v-html="safeHtml"></article>
</template>

<style scoped>
.vfs-reader {
  line-height: 1.65;
  font-size: 14px;
  max-width: 78ch;
}

.vfs-reader :deep(h1),
.vfs-reader :deep(h2),
.vfs-reader :deep(h3),
.vfs-reader :deep(h4) {
  margin: 18px 0 10px;
  line-height: 1.25;
}

.vfs-reader :deep(p) {
  margin: 10px 0;
}

.vfs-reader :deep(pre) {
  padding: 10px 12px;
  overflow: auto;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.vfs-reader :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.95em;
}

.vfs-reader :deep(blockquote) {
  margin: 12px 0;
  padding-left: 12px;
  border-left: 3px solid rgba(255, 255, 255, 0.2);
  opacity: 0.95;
}

.vfs-reader :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.vfs-reader :deep(th),
.vfs-reader :deep(td) {
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 6px 8px;
}

.vfs-reader :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
