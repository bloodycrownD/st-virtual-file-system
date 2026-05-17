<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    lineCount: number
    scrollTop: number
    /** Fixed height of one visual row (px), matching the textarea line box. */
    visualRowHeightPx?: number
    /** Must match textarea `line-height` for row alignment. */
    visualRowLineHeight?: string
    /** Soft-wrapped visual row count per logical line. */
    visualRowCounts?: number[]
    /** Must match textarea padding for scroll alignment. */
    contentPadding?: string
  }>(),
  {
    visualRowHeightPx: 21,
    contentPadding: '8px 10px',
  },
)

const normalizedLineCount = computed(() => Math.max(1, Math.floor(props.lineCount)))

/** One gutter cell per visual row; line number only on the first row of each logical line. */
const gutterRows = computed(() => {
  const rows: Array<{ key: string; label: string }> = []
  const counts = props.visualRowCounts ?? []
  const logicalLines = Math.max(normalizedLineCount.value, counts.length)

  for (let lineIndex = 0; lineIndex < logicalLines; lineIndex += 1) {
    const visualRows = Math.max(1, counts[lineIndex] ?? 1)
    for (let visualIndex = 0; visualIndex < visualRows; visualIndex += 1) {
      rows.push({
        key: `${lineIndex}-${visualIndex}`,
        label: visualIndex === 0 ? String(lineIndex + 1) : '',
      })
    }
  }

  if (rows.length === 0) {
    rows.push({ key: '0-0', label: '1' })
  }
  return rows
})

const rowStyle = computed(() => ({
  height: `${props.visualRowHeightPx}px`,
  lineHeight: props.visualRowLineHeight ?? `${props.visualRowHeightPx}px`,
}))

const contentStyle = computed(() => ({
  transform: `translateY(-${props.scrollTop}px)`,
  padding: props.contentPadding,
}))
</script>

<template>
  <aside class="vfs-line-number-gutter" aria-hidden="true" data-testid="vfs-line-number-gutter">
    <div class="vfs-line-number-gutter__content" :style="contentStyle">
      <span
        v-for="row in gutterRows"
        :key="row.key"
        class="vfs-line-number-gutter__row"
        :class="{ 'vfs-line-number-gutter__row--continuation': !row.label }"
        :style="rowStyle"
      >
        {{ row.label }}
      </span>
    </div>
  </aside>
</template>

<style scoped>
/* WHY: VS Code–like gutter — number on first visual row; continuation rows stay blank. */
.vfs-line-number-gutter {
  flex: 0 0 35px;
  width: 35px;
  min-width: 35px;
  overflow: hidden;
  user-select: none;
  color: rgba(255, 255, 255, 0.32);
  background: transparent;
  border: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-variant-numeric: tabular-nums;
}

.vfs-line-number-gutter__content {
  will-change: transform;
}

.vfs-line-number-gutter__row {
  display: block;
  box-sizing: border-box;
  text-align: right;
  padding-right: 8px;
  font-size: 12px;
}

.vfs-line-number-gutter__row--continuation {
  /* blank spacer row under a soft-wrapped logical line */
}
</style>
