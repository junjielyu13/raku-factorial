import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { haversineMeters } from "./haversine.ts";

Deno.test("haversine: identical points → 0", () => {
  assertEquals(haversineMeters(40, -3, 40, -3), 0);
});

Deno.test("haversine: ~111km per degree of latitude at equator", () => {
  const d = haversineMeters(0, 0, 1, 0);
  assert(Math.abs(d - 111_195) < 100, `got ${d}`);
});

Deno.test("haversine: Madrid Sol → Atocha ~1500m", () => {
  // Sol: 40.4168, -3.7038 ; Atocha: 40.4070, -3.6919
  const d = haversineMeters(40.4168, -3.7038, 40.4070, -3.6919);
  assert(d > 1300 && d < 1700, `expected ~1500m, got ${d}`);
});
