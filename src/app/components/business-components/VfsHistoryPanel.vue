<script setup lang="ts">
import { ref } from 'vue'
import { useVfsCheckpointRollback } from '@/app/composables/components-composables/useVfsCheckpointRollback'

const checkpointId = ref('')
const isRollingBack = ref(false)
const emits = defineEmits<{
  rollbackStatus: [payload: { kind: 'single'; status: 'rollingBack' | 'succeeded' | 'failed'; checkpointId?: string }]
}>()

async function rollback(): Promise<void> {
  if (isRollingBack.value) return
  isRollingBack.value = true
  const id = checkpointId.value.trim()
  emits('rollbackStatus', { kind: 'single', status: 'rollingBack', checkpointId: id })
  try {
    const ok = await useVfsCheckpointRollback(id)
    emits('rollbackStatus', { kind: 'single', status: ok ? 'succeeded' : 'failed', checkpointId: id })
  } finally {
    isRollingBack.value = false
  }
}
</script>

<template>
  <section>
    <input v-model="checkpointId" type="text" placeholder="checkpoint id" />
    <button type="button" :disabled="isRollingBack" @click="rollback">
      {{ isRollingBack ? 'Rolling back...' : 'Rollback' }}
    </button>
  </section>
</template>
