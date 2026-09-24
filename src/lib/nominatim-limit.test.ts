import assert from "node:assert/strict";
import test from "node:test";
import { createNominatimGate } from "./nominatim-limit";

test("nominatim gate keeps request starts at least one interval apart", async () => {
  let clock = 0;
  const gate = createNominatimGate(
    1000,
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  const starts: number[] = [];
  const run = (label: string) =>
    gate(async () => {
      starts.push(clock);
      clock += 100;
      return label;
    });

  const results = await Promise.all([run("a"), run("b"), run("c")]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.deepEqual(starts, [0, 1000, 2000]);
});

test("a failed nominatim call does not stall the next request", async () => {
  let clock = 0;
  const gate = createNominatimGate(
    1000,
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  await assert.rejects(gate(async () => {
    clock += 50;
    throw new Error("timeout");
  }));
  const start = clock;
  await gate(async () => {
    assert.ok(clock >= start);
    assert.ok(clock >= 1000);
  });
});
