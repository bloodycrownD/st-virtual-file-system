<script setup lang="ts">
import { ref } from 'vue'
import { useVfsRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const commitId = ref('')
const emits = defineEmits<{
  rollbackStatus: [payload: { kind: 'single'; status: 'rollingBack' | 'succeeded' | 'failed'; sourceVersionId?: string }]
}>()

async function rollback(): Promise<void> {
  emits('rollbackStatus', { kind: 'single', status: 'rollingBack', sourceVersionId: commitId.value.trim() })
  const ok = await useVfsRollbackAction(commitId.value)
  emits('rollbackStatus', { kind: 'single', status: ok ? 'succeeded' : 'failed', sourceVersionId: commitId.value.trim() })
}
</script>

<template>
  <section>
    <input v-model="commitId" type="text" placeholder="commit id" />
    <button type="button" @click="rollback">Rollback</button>
  </section>
</template>
