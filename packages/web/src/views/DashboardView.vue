<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Bookmark, Plus, RefreshCcw } from "lucide-vue-next";
import { useSessionsStore } from "@/stores/sessions";
import { useSavedConnectionsStore } from "@/stores/savedConnections";
import AppHeader from "@/components/AppHeader.vue";
import DeviceCard from "@/components/DeviceCard.vue";
import AddDeviceDialog from "@/components/AddDeviceDialog.vue";
import ScopeMiniPanel from "@/components/panels/ScopeMiniPanel.vue";
import PsuMiniPanel from "@/components/panels/PsuMiniPanel.vue";
import DmmMiniPanel from "@/components/panels/DmmMiniPanel.vue";
import EloadMiniPanel from "@/components/panels/EloadMiniPanel.vue";
import SgMiniPanel from "@/components/panels/SgMiniPanel.vue";
import SaMiniPanel from "@/components/panels/SaMiniPanel.vue";

const sessions = useSessionsStore();
const saved = useSavedConnectionsStore();
const dialogOpen = ref(false);
const reopening = ref(false);
const reopenError = ref<string | null>(null);

onMounted(() => {
  void sessions.refresh();
  sessions.connect();
});

async function reopenAllSaved(): Promise<void> {
  if (reopening.value) return;
  reopening.value = true;
  reopenError.value = null;
  const errors: string[] = [];
  try {
    for (const entry of saved.list) {
      if (sessions.list.some((s) => s.host === entry.host && s.port === entry.port)) {
        continue;
      }
      try {
        await sessions.open(entry.host, entry.port);
      } catch (err) {
        errors.push(`${entry.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (errors.length > 0) reopenError.value = errors.join(" · ");
  } finally {
    reopening.value = false;
  }
}
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
        <div class="flex items-center gap-2">
          <button
            v-if="saved.count > 0"
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="reopening"
            @click="reopenAllSaved"
          >
            <RefreshCcw
              class="h-4 w-4"
              :class="reopening ? 'animate-spin' : ''"
              aria-hidden="true"
            />
            {{ reopening ? "Reopening…" : "Reopen saved" }}
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            @click="dialogOpen = true"
          >
            <Plus class="h-4 w-4" aria-hidden="true" />
            Add device
          </button>
        </div>
      </div>

      <p
        v-if="reopenError"
        class="mb-4 rounded-md border border-state-error/30 bg-state-error/10 px-3 py-2 text-xs text-state-error"
        role="alert"
      >
        Some saved connections could not be reopened — {{ reopenError }}
      </p>

      <section v-if="sessions.list.length === 0" class="rounded-[var(--radius-card)] border border-dashed border-border bg-surface-2 p-10 text-center">
        <h3 class="text-sm font-semibold">No devices connected</h3>
        <p class="mt-1 text-sm text-fg-muted">
          <template v-if="saved.count > 0">
            {{ saved.count }}
            {{ saved.count === 1 ? "saved connection" : "saved connections" }} in this browser — reopen them above,
            or add a new device.
          </template>
          <template v-else>
            Add your first oscilloscope, power supply, or multimeter to get started.
          </template>
        </p>
        <div class="mt-4 flex items-center justify-center gap-2">
          <button
            v-if="saved.count > 0"
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="reopening"
            @click="reopenAllSaved"
          >
            <Bookmark class="h-4 w-4" aria-hidden="true" />
            Reopen saved
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            @click="dialogOpen = true"
          >
            <Plus class="h-4 w-4" aria-hidden="true" />
            Add device
          </button>
        </div>
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
            <EloadMiniPanel
              v-else-if="session.kind === 'electronicLoad'"
              :session-id="session.id"
              :enabled="session.status === 'connected'"
            />
            <SgMiniPanel
              v-else-if="session.kind === 'signalGenerator'"
              :session-id="session.id"
              :enabled="session.status === 'connected'"
            />
            <SaMiniPanel
              v-else-if="session.kind === 'spectrumAnalyzer'"
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
