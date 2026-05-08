<script setup lang="ts">
import { computed } from 'vue'
import {
  getVisibleActions,
  isActionTriggerable,
  type VfsEntityAction,
  type VfsManagerEntity,
} from '@/app/composables/components-composables/useVfsFileManagerModel'

const props = defineProps<{ entity: VfsManagerEntity | null }>()
const emits = defineEmits<{
  actionSelected: [action: VfsEntityAction]
}>()

const actions = computed(() => getVisibleActions(props.entity))

function triggerAction(action: VfsEntityAction): void {
  // WHY: keep runtime checks as source of truth; render filtering alone can be bypassed by stale state.
  if (!isActionTriggerable(props.entity, action)) return
  emits('actionSelected', action)
}
</script>

<template>
  <ul class="vfs-action-menu">
    <li v-for="action in actions" :key="action">
      <button type="button" :data-action="action" @click="triggerAction(action)">{{ action }}</button>
    </li>
  </ul>
</template>
