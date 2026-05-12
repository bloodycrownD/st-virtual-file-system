<script setup lang="ts">
import { ref } from 'vue'
import { useVfsSnapshotRollback } from '@/app/composables/components-composables/useVfsSnapshotRollback'

const snapshotId = ref('')
const isRollingBack = ref(false)
const emits = defineEmits<{
  rollbackStatus: [payload: { kind: 'single'; status: 'rollingBack' | 'succeeded' | 'failed'; snapshotId?: string }]
}>()

async function rollback(): Promise<void> {
  if (isRollingBack.value) return
  isRollingBack.value = true
  const id = snapshotId.value.trim()
  emits('rollbackStatus', { kind: 'single', status: 'rollingBack', snapshotId: id })
  try {
    const ok = await useVfsSnapshotRollback(id)
    emits('rollbackStatus', { kind: 'single', status: ok ? 'succeeded' : 'failed', snapshotId: id })
  } finally {
    isRollingBack.value = false
  }
}
</script>

<template>
  <section>
    <input v-model="snapshotId" type="text" placeholder="snapshot id" />
    <button type="button" :disabled="isRollingBack" @click="rollback">
      {{ isRollingBack ? 'Rolling back...' : 'Rollback' }}
    </button>
  </section>
</template>
