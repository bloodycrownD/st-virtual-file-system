<script setup lang="ts">
import { ref } from 'vue'
import { useVfsRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const commitId = ref('')
const emits = defineEmits<{
  rollbackStatus: [status: 'rollingBack' | 'succeeded' | 'failed']
}>()

async function rollback(): Promise<void> {
  emits('rollbackStatus', 'rollingBack')
  const ok = await useVfsRollbackAction(commitId.value)
  emits('rollbackStatus', ok ? 'succeeded' : 'failed')
}
</script>

<template>
  <section>
    <input v-model="commitId" type="text" placeholder="commit id" />
    <button type="button" @click="rollback">Rollback</button>
  </section>
</template>
