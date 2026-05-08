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
  <article class="vfs-reader" v-html="safeHtml"></article>
</template>
