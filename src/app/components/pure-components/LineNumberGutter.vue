<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  lineCount: number
  scrollTop: number
}>()

const normalizedLineCount = computed(() => Math.max(1, Math.floor(props.lineCount)))
const lineNumbers = computed(() => Array.from({ length: normalizedLineCount.value }, (_, index) => index + 1))
</script>

<template>
  <aside class="vfs-line-number-gutter" aria-hidden="true" data-testid="vfs-line-number-gutter">
    <!-- WHY: translate keeps gutter and content scroll aligned without introducing nested scrollbars. -->
    <div class="vfs-line-number-gutter__content" :style="{ transform: `translateY(-${scrollTop}px)` }">
      <span v-for="lineNumber in lineNumbers" :key="lineNumber" class="vfs-line-number-gutter__line">
        {{ lineNumber }}
      </span>
    </div>
  </aside>
</template>

<style scoped>
/* WHY: VS Code–like gutter — muted numbers only, no tinted strip or divider (avoids a “line number bar”). */
.vfs-line-number-gutter {
  flex: 0 0 28px;
  width: 28px;
  min-width: 28px;
  overflow: hidden;
  user-select: none;
  text-align: right;
  color: rgba(255, 255, 255, 0.32);
  background: transparent;
  border: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-variant-numeric: tabular-nums;
}

.vfs-line-number-gutter__content {
  padding: 0 8px 0 0;
  will-change: transform;
}

.vfs-line-number-gutter__line {
  display: block;
  line-height: 1.72;
  font-size: 12px;
}
</style>
