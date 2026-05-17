<script setup lang="ts">
import { computed } from 'vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { renderPlainTextDocument, renderSafeMarkdownDocument } from '@/app/services/vfs/renderPipeline'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'
import { isVfsMarkdownPreviewPath } from '@/domain/vfs/is-vfs-markdown-preview-path'

const props = defineProps<{
  /** Raw file source (misnamed `html` historically). */
  html: string
  /** VFS absolute path used only to pick markdown vs plain renderer. */
  filePath: string
}>()

const safeHtml = computed(() => {
  // Intent: only `.md` paths use marked; all other extensions show escaped source as plain text.
  if (!isVfsMarkdownPreviewPath(props.filePath)) {
    return renderPlainTextDocument(props.html).html ?? ''
  }
  const result = renderSafeMarkdownDocument(props.html)
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
  line-height: 1.72;
  font-size: 14px;
  width: 100%;
  max-width: none;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.vfs-reader :deep(h1),
.vfs-reader :deep(h2),
.vfs-reader :deep(h3),
.vfs-reader :deep(h4) {
  margin: 18px 0 10px;
  line-height: 1.25;
}

.vfs-reader :deep(p) {
  margin: 12px 0;
}

.vfs-reader :deep(ul),
.vfs-reader :deep(ol) {
  margin: 12px 0;
  padding-left: 1.4em;
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

.vfs-reader :deep(.vfs-md-frontmatter) {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.18);
  font-size: 12px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.78);
}

.vfs-reader :deep(.vfs-md-frontmatter__row) {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px 10px;
  margin: 6px 0;
}

.vfs-reader :deep(.vfs-md-frontmatter__row:first-child) {
  margin-top: 0;
}

.vfs-reader :deep(.vfs-md-frontmatter__row:last-child) {
  margin-bottom: 0;
}

.vfs-reader :deep(.vfs-md-frontmatter__key) {
  flex: 0 0 auto;
  max-width: 100%;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
  opacity: 0.95;
}

.vfs-reader :deep(.vfs-md-frontmatter__value) {
  flex: 1 1 12rem;
  min-width: 0;
  opacity: 0.9;
  word-break: break-word;
}

.vfs-reader :deep(.vfs-md-frontmatter__value--block) {
  margin-top: 6px;
  max-height: none;
}

.vfs-reader :deep(.vfs-md-frontmatter__details) {
  flex: 1 1 12rem;
  min-width: 0;
}

.vfs-reader :deep(.vfs-md-frontmatter__summary) {
  cursor: pointer;
  user-select: none;
  opacity: 0.85;
  list-style: none;
}

.vfs-reader :deep(.vfs-md-frontmatter__summary::-webkit-details-marker) {
  display: none;
}

.vfs-reader :deep(.vfs-plain-text) {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.45;
}
</style>
