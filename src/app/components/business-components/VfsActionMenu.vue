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
const isDisabled = computed(() => !props.entity || actions.value.length === 0)
const disabledHint = computed(() => (isDisabled.value ? '先选择一个文件/目录，然后使用“更多操作”' : ''))
const ACTION_LABELS: Record<VfsEntityAction, string> = {
  'toggle-status': '切换状态',
  delete: '删除',
  view: '查看',
  edit: '编辑',
  rename: '重命名',
  'apply-strategy': '展示策略',
  'open-slideshow': '幻灯片/阅读模式',
}

function onToggleClick(event: MouseEvent): void {
  if (!isDisabled.value) return
  event.preventDefault()
}

function triggerAction(action: VfsEntityAction): void {
  // WHY: keep runtime checks as source of truth; render filtering alone can be bypassed by stale state.
  if (!isActionTriggerable(props.entity, action)) return
  emits('actionSelected', action)
}
</script>

<template>
  <details class="vfs-action-menu" :data-disabled="isDisabled ? 'true' : 'false'">
    <summary
      class="vfs-action-menu__toggle"
      data-testid="vfs-action-menu-toggle"
      :aria-disabled="isDisabled"
      :title="disabledHint"
      @click="onToggleClick"
    >
      更多操作
    </summary>
    <ul class="vfs-action-menu__list" role="menu">
      <li v-for="action in actions" :key="action" role="none">
        <button type="button" role="menuitem" :data-action="action" @click="triggerAction(action)">
          {{ ACTION_LABELS[action] }}
        </button>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.vfs-action-menu {
  position: relative;
}

.vfs-action-menu__toggle {
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.vfs-action-menu[data-disabled='true'] .vfs-action-menu__toggle {
  opacity: 0.5;
  cursor: not-allowed;
}

.vfs-action-menu__list {
  margin: 8px 0 0;
  padding: 8px;
  list-style: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  position: absolute;
  right: 0;
  min-width: 180px;
  z-index: 2;
}
</style>
