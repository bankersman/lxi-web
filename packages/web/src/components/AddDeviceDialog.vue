<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RadioTower, RefreshCcw, X } from "lucide-vue-next";
import type { DiscoveryCandidate } from "@lxi-web/core/browser";
import { DEFAULT_SCPI_PORT } from "@lxi-web/core/browser";
import { api } from "@/api/client";
import { useSessionsStore } from "@/stores/sessions";
import SavedConnectionsList from "./SavedConnectionsList.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const sessions = useSessionsStore();

const host = ref("");
const port = ref<number>(DEFAULT_SCPI_PORT);
const busy = ref(false);
const error = ref<string | null>(null);
const dialog = ref<HTMLElement | null>(null);
const firstField = ref<HTMLInputElement | null>(null);

const scanBusy = ref(false);
const scanError = ref<string | null>(null);
const scanResults = ref<DiscoveryCandidate[]>([]);
const scanRan = ref(false);
/** When set, mDNS saw this many non-LXI advertisements (wildcard scan). */
const scanNonInstrumentUps = ref<number | null>(null);

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      error.value = null;
      host.value = "";
      port.value = DEFAULT_SCPI_PORT;
      scanError.value = null;
      scanResults.value = [];
      scanRan.value = false;
      scanNonInstrumentUps.value = null;
      await nextTick();
      firstField.value?.focus();
      document.addEventListener("keydown", onKey);
    } else {
      document.removeEventListener("keydown", onKey);
    }
  },
);

onMounted(() => {
  if (props.open) document.addEventListener("keydown", onKey);
});
onUnmounted(() => document.removeEventListener("keydown", onKey));

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
  if (event.key === "Tab" && dialog.value) {
    const focusable = dialog.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

async function scan(): Promise<void> {
  if (scanBusy.value) return;
  scanBusy.value = true;
  scanError.value = null;
  try {
    const result = await api.browseDiscovery(3_000);
    scanResults.value = [...result.candidates];
    scanRan.value = true;
    scanNonInstrumentUps.value =
      result.nonInstrumentMdnsUps !== undefined ? result.nonInstrumentMdnsUps : null;
  } catch (err) {
    scanError.value = err instanceof Error ? err.message : String(err);
  } finally {
    scanBusy.value = false;
  }
}

function pick(candidate: DiscoveryCandidate): void {
  host.value = candidate.host;
  port.value = candidate.port || DEFAULT_SCPI_PORT;
  error.value = null;
  firstField.value?.focus();
}

async function submit(event: Event): Promise<void> {
  event.preventDefault();
  if (busy.value) return;
  error.value = null;
  const h = host.value.trim();
  if (!h) {
    error.value = "Host is required";
    firstField.value?.focus();
    return;
  }
  const p = Number(port.value);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) {
    error.value = "Port must be 1–65535";
    return;
  }
  busy.value = true;
  try {
    await sessions.open(h, p);
    emit("close");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Transition>
    <div
      v-if="open"
      ref="dialog"
      class="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-device-title"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-surface shadow-xl">
        <header class="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="add-device-title" class="text-sm font-semibold">Add device</h2>
          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="Close dialog"
            @click="emit('close')"
          >
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <SavedConnectionsList @connected="emit('close')" />

        <section class="flex flex-col gap-2 border-b border-border px-4 py-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm font-medium">
              <RadioTower class="h-4 w-4 text-fg-muted" aria-hidden="true" />
              Scan the LAN
            </div>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="scanBusy"
              aria-label="Scan for instruments on the local network"
              @click="scan"
            >
              <RefreshCcw
                class="h-3.5 w-3.5"
                :class="scanBusy ? 'animate-spin' : ''"
                aria-hidden="true"
              />
              {{ scanBusy ? "Scanning…" : scanRan ? "Rescan" : "Scan" }}
            </button>
          </div>
          <p class="text-xs text-fg-muted">
            Uses mDNS / DNS-SD to find instruments advertising
            <code class="rounded bg-surface-2 px-1 py-0.5">_scpi-raw._tcp</code>,
            <code class="rounded bg-surface-2 px-1 py-0.5">_lxi._tcp</code>, or
            <code class="rounded bg-surface-2 px-1 py-0.5">_hislip._tcp</code>.
            Different subnets, VPN, AP client isolation, and many firewalls
            block mDNS — use the manual fields below if scanning comes back empty.
          </p>
          <p
            v-if="scanError"
            class="rounded-md border border-state-error/30 bg-state-error/10 px-2 py-1 text-xs text-state-error"
            role="alert"
          >
            {{ scanError }}
          </p>
          <div
            v-if="scanRan || scanBusy"
            class="flex flex-col gap-1"
            role="region"
            aria-label="Discovery results"
          >
            <p class="text-xs text-fg-muted" aria-live="polite">
              <template v-if="scanBusy">Listening for advertisements…</template>
              <template v-else-if="scanResults.length === 0">
                <span v-if="scanNonInstrumentUps != null && scanNonInstrumentUps > 0">
                  Heard {{ scanNonInstrumentUps }} mDNS service advertisements that were not
                  <code class="rounded bg-surface-2 px-1 py-0.5">_lxi._tcp</code>,
                  <code class="rounded bg-surface-2 px-1 py-0.5">_scpi-raw._tcp</code>,
                  <code class="rounded bg-surface-2 px-1 py-0.5">_hislip._tcp</code>, or
                  <code class="rounded bg-surface-2 px-1 py-0.5">_visa._tcp</code>. Enter host
                  / port manually below.
                </span>
                <span v-else>
                  No instruments responded. Enter host / port manually below.
                </span>
              </template>
              <template v-else>
                Found {{ scanResults.length }}
                {{ scanResults.length === 1 ? "instrument" : "instruments" }}:
              </template>
            </p>
            <ul
              v-if="scanResults.length > 0"
              class="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border"
            >
              <li v-for="c in scanResults" :key="c.key">
                <button
                  type="button"
                  class="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left text-xs last:border-b-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  @click="pick(c)"
                >
                  <span class="font-medium text-fg">{{ c.name || c.host }}</span>
                  <span class="font-mono text-fg-muted">
                    {{ c.host }}:{{ c.port }}
                  </span>
                  <span
                    v-if="c.serviceTypes.length > 0"
                    class="text-fg-muted"
                  >
                    {{ c.serviceTypes.join(" · ") }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </section>

        <form class="flex flex-col gap-3 px-4 py-4" @submit="submit">
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Host</span>
            <input
              ref="firstField"
              v-model="host"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="192.168.1.10"
              class="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              required
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Port</span>
            <input
              v-model.number="port"
              type="number"
              min="1"
              max="65535"
              class="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <span class="text-xs text-fg-muted">Default is 5025 (SCPI over LAN)</span>
          </label>
          <p
            v-if="error"
            class="rounded-md border border-state-error/30 bg-state-error/10 px-2 py-1 text-xs text-state-error"
            role="alert"
          >
            {{ error }}
          </p>
          <div class="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              class="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="h-9 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="busy"
            >
              {{ busy ? "Connecting…" : "Connect" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>
