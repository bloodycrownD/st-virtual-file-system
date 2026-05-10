<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsServerLogPagination } from '@/app/composables/components-composables/useVfsLogPagination'
import { fetchLogs } from '@/app/services/vfs/logService'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

interface LogItem {
  id: string
  message: string
}

const props = defineProps<{
  refreshToken: number
}>()

const logs = ref<LogItem[]>([])
const isLoading = ref(false)
const status = ref<'idle' | 'refreshing' | 'succeeded' | 'failed'>('idle')
const currentPage = ref(1)
const totalItems = ref(0)
const pageSize = 20

const pagination = computed(() => {
  return createVfsServerLogPagination({
    currentPage: currentPage.value,
    totalItems: totalItems.value,
    pageSize,
  })
})

async function refreshLogs(page = currentPage.value): Promise<void> {
  if (isLoading.value) return
  isLoading.value = true
  status.value = 'refreshing'
  try {
    const result = await fetchLogs({ page, pageSize })
    logs.value = result.items as LogItem[]
    totalItems.value = result.total

    const totalPages = Math.max(1, Math.ceil(Math.max(result.total, 0) / pageSize))
    const clampedPage = Math.min(Math.max(page, 1), totalPages)
    if (clampedPage !== page && result.total > 0) {
      const retry = await fetchLogs({ page: clampedPage, pageSize })
      logs.value = retry.items as LogItem[]
      totalItems.value = retry.total
      currentPage.value = clampedPage
    } else {
      currentPage.value = clampedPage
    }
    status.value = 'succeeded'
  } catch {
    status.value = 'failed'
    toastr.error(toVfsErrorToast(VFS_ERROR_CODES.LOG_FETCH_FAILED, 'Log refresh failed'))
  } finally {
    isLoading.value = false
  }
}

function requestManualRefresh(): void {
  void refreshLogs(currentPage.value)
}

onMounted(() => {
  // WHY: logs are manual by default; however, an already-issued auto-refresh request (from
  // message events while the tab was inactive) must not be lost on initial mount.
  if (props.refreshToken > 0) {
    void refreshLogs(currentPage.value)
  }
})

watch(
  () => props.refreshToken,
  (token) => {
    if (token <= 0) return
    void refreshLogs(currentPage.value)
  },
  { immediate: false },
)
</script>

<template>
  <section class="vfs-log-panel">
    <header class="vfs-log-panel-header">
      <button type="button" class="menu_button vfs-log-refresh-button" :disabled="isLoading" @click="requestManualRefresh">
        {{ isLoading ? 'Refreshing...' : 'Refresh Logs' }}
      </button>
      <div class="vfs-log-panel-status">
        <span class="vfs-log-status-label">Status</span>
        <span class="vfs-log-status-pill">{{ status }}</span>
      </div>
      <span class="vfs-log-page-text">Page {{ pagination.currentPage }} / {{ pagination.totalPages }}</span>
    </header>
    <div class="vfs-log-content-area">
      <p v-if="status === 'refreshing'" class="vfs-log-content-state vfs-log-content-refreshing">Refreshing logs...</p>
      <p v-else-if="status === 'failed'" class="vfs-log-content-state vfs-log-content-failed">
        Failed to refresh logs. Try again.
      </p>
      <ul v-else-if="logs.length" class="vfs-log-list">
        <li v-for="item in logs" :key="item.id" class="vfs-log-item">{{ item.message }}</li>
      </ul>
      <p v-else-if="status === 'succeeded'" class="vfs-log-content-state vfs-log-content-no-data">
        No logs found for this page.
      </p>
      <p v-else class="vfs-log-content-state vfs-log-empty">No logs yet. Refresh to load server logs.</p>
    </div>
    <footer class="vfs-log-panel-pager">
      <button
        type="button"
        class="menu_button"
        :disabled="pagination.currentPage <= 1 || isLoading"
        @click="refreshLogs(pagination.currentPage - 1)"
      >
        Prev
      </button>
      <button
        type="button"
        class="menu_button"
        :disabled="pagination.currentPage >= pagination.totalPages || totalItems === 0 || isLoading"
        @click="refreshLogs(pagination.currentPage + 1)"
      >
        Next
      </button>
    </footer>
  </section>
</template>

<style scoped>
.vfs-log-panel {
  display: grid;
  gap: 10px;
}

.vfs-log-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  white-space: nowrap;
  overflow-x: auto;
  margin-bottom: 8px;
}

.vfs-log-refresh-button {
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.vfs-log-panel-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.vfs-log-status-label {
  opacity: 0.8;
  font-size: 12px;
}

.vfs-log-status-pill {
  font-size: 12px;
  font-weight: 600;
}

.vfs-log-page-text {
  opacity: 0.82;
  font-size: 12px;
}

.vfs-log-list {
  margin: 0;
  padding: 10px;
  list-style: none;
  max-height: 260px;
  overflow: auto;
  display: grid;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.vfs-log-content-area {
  min-height: 56px;
}

.vfs-log-content-state {
  margin: 0;
  padding: 12px;
  border-radius: 10px;
}

.vfs-log-content-refreshing {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  opacity: 0.88;
}

.vfs-log-content-failed {
  border: 1px solid rgba(255, 128, 128, 0.42);
  background: rgba(255, 64, 64, 0.11);
}

.vfs-log-content-no-data {
  border: 1px dashed rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.02);
  opacity: 0.84;
}

.vfs-log-item {
  margin: 0;
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
}

.vfs-log-empty {
  border: 1px dashed rgba(255, 255, 255, 0.2);
  opacity: 0.82;
}

.vfs-log-panel-pager {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
