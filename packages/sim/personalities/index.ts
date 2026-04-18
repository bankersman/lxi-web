import { PersonalityRegistry } from "../src/registry.js";
import { genericUnknownPersonality } from "./generic-unknown.js";
import { rigolDho804Personality } from "./rigol/dho804.js";
import { rigolDp932ePersonality } from "./rigol/dp932e.js";
import { rigolDm858Personality } from "./rigol/dm858.js";
import { rigolDl3021Personality } from "./rigol/dl3021.js";
import { rigolDg812Personality } from "./rigol/dg812.js";
import { rigolDg932Personality } from "./rigol/dg932.js";
import { rigolRsa3030Personality } from "./rigol/rsa3030.js";
import { siglentSpd3303xEPersonality } from "./siglent/spd3303x-e.js";
import { siglentSdm3065xPersonality } from "./siglent/sdm3065x.js";
import { siglentSds824xHdPersonality } from "./siglent/sds824x-hd.js";
import { siglentSdl1020xEPersonality } from "./siglent/sdl1020x-e.js";
import { siglentSdg2042xPersonality } from "./siglent/sdg2042x.js";
import { siglentSsa3032xPersonality } from "./siglent/ssa3032x.js";
import { keysight33511bPersonality } from "./keysight/33511b.js";
import { keysightN9320bPersonality } from "./keysight/n9320b.js";
import { keysightEdu36311aPersonality } from "./keysight/edu36311a.js";
import { keysightE36313aPersonality } from "./keysight/e36313a.js";
import { keysightTruevolt34461aPersonality } from "./keysight/truevolt-34461a.js";
import { keysightTruevolt34470aPersonality } from "./keysight/truevolt-34470a.js";
import { keysightInfiniivisionDsox2024aPersonality } from "./keysight/infiniivision-dsox2024a.js";
import { keysightInfiniivisionDsox3034tPersonality } from "./keysight/infiniivision-dsox3034t.js";
import { keysightEl34243aPersonality } from "./keysight/el34243a.js";
import { owonXdm2041Personality } from "./owon/xdm2041.js";
import { owonXdm1041Personality } from "./owon/xdm1041.js";
import { owonSpe3103Personality } from "./owon/spe3103.js";
import { owonXds3104aePersonality } from "./owon/xds3104ae.js";

export { genericUnknownPersonality } from "./generic-unknown.js";
export { rigolDho804Personality } from "./rigol/dho804.js";
export { rigolDp932ePersonality } from "./rigol/dp932e.js";
export { rigolDm858Personality } from "./rigol/dm858.js";
export { rigolDl3021Personality } from "./rigol/dl3021.js";
export { rigolDg812Personality } from "./rigol/dg812.js";
export { rigolDg932Personality } from "./rigol/dg932.js";
export { rigolRsa3030Personality } from "./rigol/rsa3030.js";
export { siglentSpd3303xEPersonality } from "./siglent/spd3303x-e.js";
export { siglentSdm3065xPersonality } from "./siglent/sdm3065x.js";
export { siglentSds824xHdPersonality } from "./siglent/sds824x-hd.js";
export { siglentSdl1020xEPersonality } from "./siglent/sdl1020x-e.js";
export { siglentSdg2042xPersonality } from "./siglent/sdg2042x.js";
export { siglentSsa3032xPersonality } from "./siglent/ssa3032x.js";
export { keysight33511bPersonality } from "./keysight/33511b.js";
export { keysightN9320bPersonality } from "./keysight/n9320b.js";
export { keysightEdu36311aPersonality } from "./keysight/edu36311a.js";
export { keysightE36313aPersonality } from "./keysight/e36313a.js";
export { keysightTruevolt34461aPersonality } from "./keysight/truevolt-34461a.js";
export { keysightTruevolt34470aPersonality } from "./keysight/truevolt-34470a.js";
export { keysightInfiniivisionDsox2024aPersonality } from "./keysight/infiniivision-dsox2024a.js";
export { keysightInfiniivisionDsox3034tPersonality } from "./keysight/infiniivision-dsox3034t.js";
export { keysightEl34243aPersonality } from "./keysight/el34243a.js";
export { owonXdm2041Personality } from "./owon/xdm2041.js";
export { owonXdm1041Personality } from "./owon/xdm1041.js";
export { owonSpe3103Personality } from "./owon/spe3103.js";
export { owonXds3104aePersonality } from "./owon/xds3104ae.js";

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
  registry.register(rigolRsa3030Personality);
  registry.register(siglentSpd3303xEPersonality);
  registry.register(siglentSdm3065xPersonality);
  registry.register(siglentSds824xHdPersonality);
  registry.register(siglentSdl1020xEPersonality);
  registry.register(siglentSdg2042xPersonality);
  registry.register(siglentSsa3032xPersonality);
  registry.register(keysight33511bPersonality);
  registry.register(keysightN9320bPersonality);
  registry.register(keysightEdu36311aPersonality);
  registry.register(keysightE36313aPersonality);
  registry.register(keysightTruevolt34461aPersonality);
  registry.register(keysightTruevolt34470aPersonality);
  registry.register(keysightInfiniivisionDsox2024aPersonality);
  registry.register(keysightInfiniivisionDsox3034tPersonality);
  registry.register(keysightEl34243aPersonality);
  registry.register(owonXdm2041Personality);
  registry.register(owonXdm1041Personality);
  registry.register(owonSpe3103Personality);
  registry.register(owonXds3104aePersonality);
  return registry;
}
