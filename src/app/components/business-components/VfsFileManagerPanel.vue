<script setup lang="ts">
defineProps<{ mode: 'list' | 'reader' | 'editor' | 'slideshow' }>()
</script>

<template>
  <section class="vfs-file-manager-panel">
    <p>Current mode: {{ mode }}</p>
    <slot />
  </section>
</template>
