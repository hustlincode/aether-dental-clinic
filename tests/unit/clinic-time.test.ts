import assert from "node:assert/strict";
import test from "node:test";
import { addDaysToKey, clinicDateKey, dateKeyToUtc, confirmationWindow } from "../../src/lib/clinic-time";

test("clinic dates follow Manila across UTC midnight and year boundaries", () => {
  assert.equal(clinicDateKey(new Date("2026-12-31T16:01:00Z")), "2027-01-01");
  assert.equal(clinicDateKey(new Date("2026-12-31T15:59:00Z")), "2026-12-31");
  assert.equal(dateKeyToUtc("2027-01-01").toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(addDaysToKey("2028-02-28", 1), "2028-02-29");
  const window = confirmationWindow(new Date("2026-12-31T16:01:00Z"));
  assert.equal(window.from.toISOString(), "2027-01-02T00:00:00.000Z");
});
