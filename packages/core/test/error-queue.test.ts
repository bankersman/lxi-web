import assert from "node:assert/strict";
import { test } from "node:test";
import { drainSystErr, parseSystErrLine } from "../src/scpi/error-queue.js";

test("parseSystErrLine treats 0,No error as empty queue", () => {
  assert.equal(parseSystErrLine('0,"No error"'), null);
  assert.equal(parseSystErrLine('0,"no error"'), null);
});

test("parseSystErrLine parses standard error row", () => {
  const p = parseSystErrLine('-113,"Undefined header"');
  assert.deepEqual(p, { code: -113, message: "Undefined header" });
});

test("drainSystErr stops on sentinel without extra queries", async () => {
  let queries = 0;
  const port = {
    async query(): Promise<string> {
      queries += 1;
      return '0,"No error"';
    },
    write: async () => {},
    writeBinary: async () => {},
    queryBinary: async () => new Uint8Array(),
  };
  const rows = await drainSystErr(port, { maxIterations: 10 });
  assert.equal(rows.length, 0);
  assert.equal(queries, 1);
});

test("drainSystErr drains until sentinel", async () => {
  const responses = ['-113,"Bad"', '0,"No error"'];
  let i = 0;
  const port = {
    async query(): Promise<string> {
      return responses[i++] ?? '0,"No error"';
    },
    write: async () => {},
    writeBinary: async () => {},
    queryBinary: async () => new Uint8Array(),
  };
  const rows = await drainSystErr(port);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.code, -113);
});
