<script setup lang="ts">
import { ref } from 'vue'
import { useVfsBatchRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const selectedIds = ref<string[]>([])
const emits = defineEmits<{
  rollbackStatus: [status: 'batchRollingBack' | 'succeeded' | 'failed']
}>()

async function rollbackSelected(): Promise<void> {
  emits('rollbackStatus', 'batchRollingBack')
  const ok = await useVfsBatchRollbackAction(selectedIds.value)
  emits('rollbackStatus', ok ? 'succeeded' : 'failed')
}
</script>

<template>
  <section>
    <button type="button" @click="rollbackSelected">Batch rollback</button>
  </section>
</template>
