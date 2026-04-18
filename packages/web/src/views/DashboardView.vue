<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Plus } from "lucide-vue-next";
import { useSessionsStore } from "@/stores/sessions";
import AppHeader from "@/components/AppHeader.vue";
import DeviceCard from "@/components/DeviceCard.vue";
import AddDeviceDialog from "@/components/AddDeviceDialog.vue";
import ScopeMiniPanel from "@/components/panels/ScopeMiniPanel.vue";
import PsuMiniPanel from "@/components/panels/PsuMiniPanel.vue";
import DmmMiniPanel from "@/components/panels/DmmMiniPanel.vue";

const sessions = useSessionsStore();
const dialogOpen = ref(false);

onMounted(() => {
  void sessions.refresh();
  sessions.connect();
});
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface text-fg">
    <AppHeader />
    <main id="main" class="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
      <div class="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold">Devices</h2>
          <p class="text-sm text-fg-muted">
            {{ sessions.count }} connected — click a card to open full controls.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="dialogOpen = true"
        >
          <Plus class="h-4 w-4" aria-hidden="true" />
          Add device
        </button>
      </div>

      <section v-if="sessions.list.length === 0" class="rounded-[var(--radius-card)] border border-dashed border-border bg-surface-2 p-10 text-center">
        <h3 class="text-sm font-semibold">No devices connected</h3>
        <p class="mt-1 text-sm text-fg-muted">
          Add your first oscilloscope, power supply, or multimeter to get started.
        </p>
        <button
          type="button"
          class="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="dialogOpen = true"
        >
          <Plus class="h-4 w-4" aria-hidden="true" />
          Add device
        </button>
      </section>

      <section
        v-else
        class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-live="polite"
      >
        <DeviceCard
          v-for="session in sessions.list"
          :key="session.id"
          :session="session"
        >
          <template #body>
            <ScopeMiniPanel
              v-if="session.kind === 'oscilloscope'"
              :session-id="session.id"
              :disabled="session.status !== 'connected'"
            />
            <PsuMiniPanel
              v-else-if="session.kind === 'powerSupply'"
              :session-id="session.id"
              :enabled="session.status === 'connected'"
            />
            <DmmMiniPanel
              v-else-if="session.kind === 'multimeter'"
              :session-id="session.id"
              :enabled="session.status === 'connected'"
            />
          </template>
        </DeviceCard>
      </section>
    </main>

    <AddDeviceDialog :open="dialogOpen" @close="dialogOpen = false" />
  </div>
</template>
