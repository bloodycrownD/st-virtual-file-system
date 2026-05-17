import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import {
  measureVisualRowHeightPx,
  resolveEditorVisualRowCounts,
  syncEditorMirrorLayout,
} from '@/app/composables/components-composables/editor-line-mirror'

const DEFAULT_VISUAL_ROW_HEIGHT_PX = 21

/**
 * VS Code–style gutter sync: per logical line, count soft-wrapped visual rows at a fixed row height;
 * gutter renders one row per visual line (number on first row only).
 */
export function useEditorLineHeightSync(
  source: Ref<string>,
  textareaRef: Ref<HTMLTextAreaElement | null>,
  mirrorRef: Ref<HTMLElement | null>,
  editorWrapRef?: Ref<HTMLElement | null>,
) {
  const visualRowHeightPx = ref(DEFAULT_VISUAL_ROW_HEIGHT_PX)
  const visualRowLineHeight = ref('1.72')
  const visualRowCounts = ref<number[]>([1])
  const contentPadding = ref('8px 10px')

  let remeasureGeneration = 0

  async function remeasure(): Promise<void> {
    const generation = ++remeasureGeneration
    await nextTick()
    if (generation !== remeasureGeneration) return

    const textarea = textareaRef.value
    const mirror = mirrorRef.value
    if (!textarea || !mirror) return

    const style = getComputedStyle(textarea)
    contentPadding.value = `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`

    const contentWidth = syncEditorMirrorLayout(textarea, mirror)
    if (contentWidth <= 0) return

    visualRowLineHeight.value = style.lineHeight
    const rowHeight = measureVisualRowHeightPx(textarea)
    visualRowHeightPx.value = rowHeight
    visualRowCounts.value = resolveEditorVisualRowCounts({
      textarea,
      mirror,
      lines: source.value.split('\n'),
      rowHeightPx: rowHeight,
      contentWidthPx: contentWidth,
    })
  }

  function scheduleRemeasure(): void {
    void remeasure()
    requestAnimationFrame(() => {
      void remeasure()
    })
  }

  let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleRemeasure()
      })
      if (textareaRef.value) resizeObserver.observe(textareaRef.value)
      if (editorWrapRef?.value) resizeObserver.observe(editorWrapRef.value)
    }
    scheduleRemeasure()
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  watch(source, () => {
    scheduleRemeasure()
  })

  watch(
    () => textareaRef.value,
    (textarea) => {
      if (!textarea || !resizeObserver) return
      resizeObserver.observe(textarea)
      scheduleRemeasure()
    },
  )

  return { visualRowHeightPx, visualRowLineHeight, visualRowCounts, contentPadding, remeasure }
}
