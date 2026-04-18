<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  BatteryCharging,
  Gauge,
  HelpCircle,
  PlugZap,
} from "lucide-vue-next";
import type { DeviceKind } from "@lxi-web/core/browser";

const props = defineProps<{ kind: DeviceKind }>();

const icon = computed(() => {
  switch (props.kind) {
    case "oscilloscope":
      return Activity;
    case "powerSupply":
      return BatteryCharging;
    case "multimeter":
      return Gauge;
    case "electronicLoad":
      return PlugZap;
    default:
      return HelpCircle;
  }
});
</script>

<template>
  <component :is="icon" class="h-5 w-5" aria-hidden="true" />
</template>
