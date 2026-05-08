<script setup lang="ts">
import { ref } from 'vue'
import { useVfsBatchRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const selectedIds = ref<string[]>([])

async function rollbackSelected(): Promise<void> {
  await useVfsBatchRollbackAction(selectedIds.value)
}
</script>

<template>
  <section>
    <button type="button" @click="rollbackSelected">Batch rollback</button>
  </section>
</template>
