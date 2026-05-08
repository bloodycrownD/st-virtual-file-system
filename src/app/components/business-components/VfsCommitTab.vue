<script setup lang="ts">
import { ref } from 'vue'
import { useVfsBatchRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const selectedIds = ref<string[]>([])
const emits = defineEmits<{
  rollbackStatus: [payload: { kind: 'batch'; status: 'batchRollingBack' | 'succeeded' | 'failed'; sourceVersionId?: string }]
}>()

async function rollbackSelected(): Promise<void> {
  emits('rollbackStatus', { kind: 'batch', status: 'batchRollingBack' })
  const ok = await useVfsBatchRollbackAction(selectedIds.value)
  emits('rollbackStatus', { kind: 'batch', status: ok ? 'succeeded' : 'failed', sourceVersionId: selectedIds.value[0] })
}
</script>

<template>
  <section>
    <button type="button" @click="rollbackSelected">Batch rollback</button>
  </section>
</template>
