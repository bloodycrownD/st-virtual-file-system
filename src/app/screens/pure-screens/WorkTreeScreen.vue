<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <section class="vfs-worktree-screen" data-testid="vfs-worktree-screen">
    <pre class="vfs-worktree-text" data-testid="vfs-worktree-text">{{ text }}</pre>
  </section>
</template>

<style scoped>
.vfs-worktree-screen {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.vfs-worktree-text {
  margin: 0;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.14);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.35;
  opacity: 0.92;
}
</style>

