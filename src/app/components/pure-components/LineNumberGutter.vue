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
.vfs-line-number-gutter {
  flex: 0 0 56px;
  width: 56px;
  min-width: 56px;
  overflow: hidden;
  user-select: none;
  text-align: right;
  color: rgba(255, 255, 255, 0.45);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
}

.vfs-line-number-gutter__content {
  padding: 0 10px 0 8px;
  will-change: transform;
}

.vfs-line-number-gutter__line {
  display: block;
  line-height: 1.72;
  font-size: 14px;
}
</style>
