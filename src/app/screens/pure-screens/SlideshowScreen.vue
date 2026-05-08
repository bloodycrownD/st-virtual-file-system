<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'

export interface SlideshowDirectoryOption {
  path: string
  name: string
}

export interface SlideshowPage {
  path: string
  title: string
  content: string
}

const props = defineProps<{
  directories: SlideshowDirectoryOption[]
  pages: SlideshowPage[]
  initialDirectoryPath: string
}>()

const currentDirectoryPath = ref(props.initialDirectoryPath)
const currentPageIndex = ref(0)
const verticalMode = ref(false)

watch(
  () => props.initialDirectoryPath,
  (next) => {
    currentDirectoryPath.value = next
    currentPageIndex.value = 0
  },
)

watch(currentDirectoryPath, () => {
  // WHY: changing directory resets paging cursor to prevent index drift across different page counts.
  currentPageIndex.value = 0
})

const availableDirectories = computed(() => props.directories)
const currentPages = computed(() => props.pages)
const currentPage = computed(() => currentPages.value[currentPageIndex.value] ?? null)

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
      <select v-model="currentDirectoryPath" data-testid="directory-select">
        <option v-for="directory in availableDirectories" :key="directory.path" :value="directory.path">
          {{ directory.name }}
        </option>
      </select>
      <button type="button" data-testid="prev-page" @click="goToPrevPage">Prev</button>
      <button type="button" data-testid="next-page" @click="goToNextPage">Next</button>
      <button type="button" data-testid="toggle-vertical" @click="verticalMode = !verticalMode">
        {{ verticalMode ? 'Horizontal' : 'Vertical' }}
      </button>
    </header>
    <article class="vfs-slide-content" data-testid="vfs-slide-content">
      <template v-if="currentPages.length === 0">
        <p class="vfs-slide-empty">No readable pages in this directory.</p>
      </template>

      <template v-else-if="verticalMode">
        <section v-for="page in currentPages" :key="page.path" class="vfs-slide-vertical-item">
          <h3 class="vfs-slide-title">{{ page.title }}</h3>
          <ReaderScreen :html="page.content" />
        </section>
      </template>

      <template v-else>
        <section v-if="currentPage" class="vfs-slide-one">
          <h3 class="vfs-slide-title">{{ currentPage.title }}</h3>
          <ReaderScreen :html="currentPage.content" />
        </section>
      </template>
    </article>
  </section>
</template>

<style scoped>
.vfs-slideshow-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.vfs-slide-content {
  display: grid;
  gap: 16px;
}

.vfs-slide-title {
  margin: 0 0 8px;
  opacity: 0.92;
}

.vfs-slide-vertical-item {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
}

.vfs-slide-empty {
  margin: 0;
  opacity: 0.75;
}
</style>
