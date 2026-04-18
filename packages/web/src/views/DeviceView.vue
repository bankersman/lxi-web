<script setup lang="ts">
defineProps<{ sessionId: string }>();
</script>

<template>
  <main class="p-8">
    <h1 class="text-2xl font-semibold">Device {{ sessionId }}</h1>
    <p class="mt-2 text-fg-muted">Expanded panel lands in Epic 2.4.</p>
  </main>
</template>
