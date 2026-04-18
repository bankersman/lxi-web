/**
 * Browser-safe subset of `@lxi-web/core`. Import from `@lxi-web/core/browser`
 * to get shared DTOs, identity helpers, and facade type declarations without
 * pulling in Node-only modules (`node:net`, `node:crypto`, etc.).
 */
export * from "./identity/index.js";
export * from "./facades/index.js";
export * from "./dto/index.js";
export type { ScpiPort, ScpiQueryOptions } from "./scpi/port.js";
