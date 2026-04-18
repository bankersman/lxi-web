<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft } from "lucide-vue-next";
import { useSessionsStore } from "@/stores/sessions";
import AppHeader from "@/components/AppHeader.vue";
import DeviceOverviewCard from "@/components/DeviceOverviewCard.vue";
import ScopePanel from "@/components/panels/ScopePanel.vue";
import PsuPanel from "@/components/panels/PsuPanel.vue";
import DmmPanel from "@/components/panels/DmmPanel.vue";
import EloadPanel from "@/components/panels/EloadPanel.vue";
import SgPanel from "@/components/panels/SgPanel.vue";
import SaPanel from "@/components/panels/SaPanel.vue";
import RawConsole from "@/components/panels/RawConsole.vue";

const props = defineProps<{ sessionId: string }>();

const router = useRouter();
const sessions = useSessionsStore();
const session = computed(() => sessions.get(props.sessionId));

const isConnected = computed(() => session.value?.status === "connected");
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface text-fg">
    <AppHeader />
    <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
      <nav class="mb-4 text-sm">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="router.push('/')"
        >
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </button>
      </nav>

      <DeviceOverviewCard
        v-if="session"
        :session="session"
        raw-console-anchor="raw-scpi"
      />

      <template v-if="session">
        <ScopePanel
          v-if="session.kind === 'oscilloscope'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <PsuPanel
          v-else-if="session.kind === 'powerSupply'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <DmmPanel
          v-else-if="session.kind === 'multimeter'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <EloadPanel
          v-else-if="session.kind === 'electronicLoad'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <SgPanel
          v-else-if="session.kind === 'signalGenerator'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <SaPanel
          v-else-if="session.kind === 'spectrumAnalyzer'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <RawConsole
          v-else
          :session-id="session.id"
          :disabled="!isConnected"
        />

        <details
          v-if="session.kind !== 'unknown'"
          id="raw-scpi"
          class="mt-6 rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
        >
          <summary class="cursor-pointer text-sm font-semibold">Raw SCPI</summary>
          <div class="mt-3">
            <RawConsole :session-id="session.id" :disabled="!isConnected" />
          </div>
        </details>
      </template>

      <section
        v-else
        class="rounded-[var(--radius-card)] border border-dashed border-border bg-surface-2 p-10 text-center"
      >
        <h2 class="text-sm font-semibold">Unknown session</h2>
        <p class="mt-1 text-sm text-fg-muted">
          The session <code>{{ sessionId }}</code> is not in the live list. It may
          have been disconnected.
        </p>
      </section>
    </main>
  </div>
</template>
