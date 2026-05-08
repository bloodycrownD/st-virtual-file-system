<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface SlideshowDirectory {
  id: string
  name: string
  pages: string[]
}

const props = withDefaults(defineProps<{ directories?: SlideshowDirectory[] }>(), {
  directories: () => [
    { id: 'default', name: 'Current Directory', pages: ['No pages available'] },
  ],
})

const currentDirectoryId = ref(props.directories[0]?.id ?? '')
const currentPageIndex = ref(0)
const verticalMode = ref(false)

const currentDirectory = computed(
  () => props.directories.find((directory) => directory.id === currentDirectoryId.value) ?? props.directories[0],
)
const currentPages = computed(() => currentDirectory.value?.pages ?? [])
const currentPage = computed(() => currentPages.value[currentPageIndex.value] ?? '')

watch(currentDirectoryId, () => {
  // WHY: changing directory resets paging cursor to prevent index drift across different page counts.
  currentPageIndex.value = 0
})

function goToNextPage(): void {
  if (currentPageIndex.value >= currentPages.value.length - 1) return
  currentPageIndex.value += 1
}

function goToPrevPage(): void {
  if (currentPageIndex.value <= 0) return
  currentPageIndex.value -= 1
}
</script>

<template>
  <section class="vfs-slideshow-screen" :class="{ 'is-vertical': verticalMode }">
    <header class="vfs-slideshow-toolbar">
      <select v-model="currentDirectoryId" data-testid="directory-select">
        <option v-for="directory in directories" :key="directory.id" :value="directory.id">
          {{ directory.name }}
        </option>
      </select>
      <button type="button" data-testid="prev-page" @click="goToPrevPage">Prev</button>
      <button type="button" data-testid="next-page" @click="goToNextPage">Next</button>
      <button type="button" data-testid="toggle-vertical" @click="verticalMode = !verticalMode">
        {{ verticalMode ? 'Horizontal' : 'Vertical' }}
      </button>
    </header>
    <article class="vfs-slide-content">
      {{ currentPage }}
    </article>
  </section>
</template>
