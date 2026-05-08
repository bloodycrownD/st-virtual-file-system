<script setup lang="ts">
import { ref } from 'vue'
import { useVfsBatchRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const selectedIds = ref<string[]>([])
const isRollingBack = ref(false)
const emits = defineEmits<{
  rollbackStatus: [payload: { kind: 'batch'; status: 'batchRollingBack' | 'succeeded' | 'failed'; sourceVersionId?: string }]
}>()

async function rollbackSelected(): Promise<void> {
  if (isRollingBack.value) return
  isRollingBack.value = true
  emits('rollbackStatus', { kind: 'batch', status: 'batchRollingBack' })
  try {
    const ok = await useVfsBatchRollbackAction(selectedIds.value)
    emits('rollbackStatus', { kind: 'batch', status: ok ? 'succeeded' : 'failed', sourceVersionId: selectedIds.value[0] })
  } finally {
    isRollingBack.value = false
  }
}
</script>

<template>
  <section>
    <button type="button" :disabled="isRollingBack" @click="rollbackSelected">
      {{ isRollingBack ? 'Batch rollback...' : 'Batch rollback' }}
    </button>
  </section>
</template>
