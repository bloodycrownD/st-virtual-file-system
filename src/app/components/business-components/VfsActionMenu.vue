<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ entityType: 'file' | 'directory' }>()

const actions = computed(() =>
  props.entityType === 'file'
    ? ['toggle-status', 'delete', 'view', 'edit', 'rename']
    : ['toggle-status', 'delete', 'rename', 'apply-strategy', 'open-slideshow'],
)
</script>

<template>
  <ul class="vfs-action-menu">
    <li v-for="action in actions" :key="action">{{ action }}</li>
  </ul>
</template>
