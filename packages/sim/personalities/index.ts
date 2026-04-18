import { PersonalityRegistry } from "../src/registry.js";
import { genericUnknownPersonality } from "./generic-unknown.js";
import { rigolDho804Personality } from "./rigol/dho804.js";
import { rigolDp932ePersonality } from "./rigol/dp932e.js";
import { rigolDm858Personality } from "./rigol/dm858.js";
import { rigolDl3021Personality } from "./rigol/dl3021.js";
import { rigolDg812Personality } from "./rigol/dg812.js";
import { rigolDg932Personality } from "./rigol/dg932.js";
import { siglentSdl1020xEPersonality } from "./siglent/sdl1020x-e.js";
import { siglentSdg2042xPersonality } from "./siglent/sdg2042x.js";
import { keysight33511bPersonality } from "./keysight/33511b.js";

export { genericUnknownPersonality } from "./generic-unknown.js";
export { rigolDho804Personality } from "./rigol/dho804.js";
export { rigolDp932ePersonality } from "./rigol/dp932e.js";
export { rigolDm858Personality } from "./rigol/dm858.js";
export { rigolDl3021Personality } from "./rigol/dl3021.js";
export { rigolDg812Personality } from "./rigol/dg812.js";
export { rigolDg932Personality } from "./rigol/dg932.js";
export { siglentSdl1020xEPersonality } from "./siglent/sdl1020x-e.js";
export { siglentSdg2042xPersonality } from "./siglent/sdg2042x.js";
export { keysight33511bPersonality } from "./keysight/33511b.js";

/**
 * Registry with every personality this package ships with. Consumers can
 * create their own empty registry and register a subset if the default
 * fan-out is too broad.
 */
export function createDefaultPersonalityRegistry(): PersonalityRegistry {
  const registry = new PersonalityRegistry();
  registry.register(genericUnknownPersonality);
  registry.register(rigolDho804Personality);
  registry.register(rigolDp932ePersonality);
  registry.register(rigolDm858Personality);
  registry.register(rigolDl3021Personality);
  registry.register(rigolDg812Personality);
  registry.register(rigolDg932Personality);
  registry.register(siglentSdl1020xEPersonality);
  registry.register(siglentSdg2042xPersonality);
  registry.register(keysight33511bPersonality);
  return registry;
}
