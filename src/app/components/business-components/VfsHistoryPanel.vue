<script setup lang="ts">
import { ref } from 'vue'
import { useVfsRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const commitId = ref('')
const isRollingBack = ref(false)
const emits = defineEmits<{
  rollbackStatus: [payload: { kind: 'single'; status: 'rollingBack' | 'succeeded' | 'failed'; sourceVersionId?: string }]
}>()

async function rollback(): Promise<void> {
  if (isRollingBack.value) return
  isRollingBack.value = true
  emits('rollbackStatus', { kind: 'single', status: 'rollingBack', sourceVersionId: commitId.value.trim() })
  try {
    const ok = await useVfsRollbackAction(commitId.value)
    emits('rollbackStatus', { kind: 'single', status: ok ? 'succeeded' : 'failed', sourceVersionId: commitId.value.trim() })
  } finally {
    isRollingBack.value = false
  }
}
</script>

<template>
  <section>
    <input v-model="commitId" type="text" placeholder="commit id" />
    <button type="button" :disabled="isRollingBack" @click="rollback">
      {{ isRollingBack ? 'Rolling back...' : 'Rollback' }}
    </button>
  </section>
</template>
