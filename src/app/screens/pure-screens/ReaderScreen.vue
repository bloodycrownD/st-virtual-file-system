<script setup lang="ts">
defineProps<{ html: string }>()
</script>

<template>
  <article class="vfs-reader" v-html="html"></article>
</template>
