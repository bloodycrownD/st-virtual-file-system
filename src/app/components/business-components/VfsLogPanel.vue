<script setup lang="ts">
import { computed, watch, ref } from 'vue'
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

watch(
  () => props.refreshToken,
  (token) => {
    if (token <= 0) return
    void refreshLogs(currentPage.value)
  },
  { immediate: true },
)
</script>

<template>
  <section class="vfs-log-panel">
    <header>
      <button type="button" :disabled="isLoading" @click="requestManualRefresh">Refresh Logs</button>
      <span>{{ status }}</span>
      <span>Page {{ pagination.currentPage }} / {{ pagination.totalPages }}</span>
    </header>
    <ul>
      <li v-for="item in logs" :key="item.id">{{ item.message }}</li>
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
