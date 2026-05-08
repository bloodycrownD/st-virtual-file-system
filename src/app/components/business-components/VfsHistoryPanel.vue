<script setup lang="ts">
import { ref } from 'vue'
import { useVfsRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const commitId = ref('')

async function rollback(): Promise<void> {
  await useVfsRollbackAction(commitId.value)
}
</script>

<template>
  <section>
    <input v-model="commitId" type="text" placeholder="commit id" />
    <button type="button" @click="rollback">Rollback</button>
  </section>
</template>
