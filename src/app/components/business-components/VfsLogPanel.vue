<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import {
  emitVfsEvent,
  useVfsMessageHooks,
  VFS_LOG_REFRESH_AUTO,
  VFS_LOG_REFRESH_REQUESTED,
} from '@/app/composables/components-composables/useVfsMessageHooks'
import { createVfsLogPagination } from '@/app/composables/components-composables/useVfsLogPagination'
import { fetchLogs } from '@/app/services/vfs/logService'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

interface LogItem {
  id: string
  message: string
}

const logs = ref<LogItem[]>([])
const isLoading = ref(false)
const status = ref<'idle' | 'refreshing' | 'succeeded' | 'failed'>('idle')
const currentPage = ref(1)
const totalItems = ref(0)

const pagination = computed(() => {
  const state = createVfsLogPagination(logs.value)
  state.goToPage(currentPage.value)
  return state
})

async function refreshLogs(page = currentPage.value): Promise<void> {
  isLoading.value = true
  status.value = 'refreshing'
  try {
    const result = await fetchLogs({ page, pageSize: 20 })
    logs.value = result.items as LogItem[]
    totalItems.value = result.total
    currentPage.value = page
    status.value = 'succeeded'
  } catch {
    status.value = 'failed'
    toastr.error(toVfsErrorToast(VFS_ERROR_CODES.LOG_FETCH_FAILED, 'Log refresh failed'))
  } finally {
    isLoading.value = false
  }
}

function requestManualRefresh(): void {
  emitVfsEvent(VFS_LOG_REFRESH_REQUESTED)
}

const autoRefreshHandler = () => {
  void refreshLogs(currentPage.value)
}

let disposeMessageHooks: (() => void) | null = null

onMounted(() => {
  disposeMessageHooks = useVfsMessageHooks()
  window.addEventListener(VFS_LOG_REFRESH_AUTO, autoRefreshHandler)
  window.addEventListener(VFS_LOG_REFRESH_REQUESTED, autoRefreshHandler)
})

onUnmounted(() => {
  disposeMessageHooks?.()
  disposeMessageHooks = null
  window.removeEventListener(VFS_LOG_REFRESH_AUTO, autoRefreshHandler)
  window.removeEventListener(VFS_LOG_REFRESH_REQUESTED, autoRefreshHandler)
})
</script>

<template>
  <section class="vfs-log-panel">
    <header>
      <button type="button" :disabled="isLoading" @click="requestManualRefresh">Refresh Logs</button>
      <span>{{ status }}</span>
      <span>Page {{ pagination.currentPage }} / {{ pagination.totalPages }}</span>
    </header>
    <ul>
      <li v-for="item in pagination.currentItems" :key="item.id">{{ item.message }}</li>
    </ul>
    <footer>
      <button type="button" :disabled="pagination.currentPage <= 1" @click="refreshLogs(pagination.currentPage - 1)">Prev</button>
      <button
        type="button"
        :disabled="pagination.currentPage >= pagination.totalPages || totalItems === 0"
        @click="refreshLogs(pagination.currentPage + 1)"
      >
        Next
      </button>
    </footer>
  </section>
</template>
