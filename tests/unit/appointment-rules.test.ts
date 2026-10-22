import assert from "node:assert/strict";
import test from "node:test";
import { appointmentEnd, canTransition, isFutureSlot, isValidDateKey, isValidTime } from "../../src/lib/appointment-rules";
import { generateAppointmentReference } from "../../src/lib/reference";

test("booking validates real calendar dates and bounded 24-hour times", () => {
  for (const value of ["2026-02-29", "2026-13-01", "2026-04-31", "invalid"]) assert.equal(isValidDateKey(value), false);
  assert.equal(isValidDateKey("2028-02-29"), true);
  for (const value of ["99:99", "24:00", "12:60", "9:00"]) assert.equal(isValidTime(value), false);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(appointmentEnd("23:30", 60), null);
  assert.equal(appointmentEnd("09:00", 0), null);
  assert.equal(appointmentEnd("09:00", 30), "09:30");
});

test("already-started slots are rejected using clinic-local time", () => {
  const now = new Date("2027-01-01T02:15:00Z"); // 10:15 in Manila
  const day = new Date("2027-01-01T00:00:00Z");
  assert.equal(isFutureSlot(day, "10:00", now), false);
  assert.equal(isFutureSlot(day, "10:15", now), false);
  assert.equal(isFutureSlot(day, "10:30", now), true);
  assert.equal(isFutureSlot(new Date("2026-12-31T00:00:00Z"), "23:30", now), false);
});

test("terminal appointments cannot reactivate and repeated statuses are valid", () => {
  for (const terminal of ["CANCELLED", "NO_SHOW", "COMPLETED"] as const) {
    assert.equal(canTransition(terminal, "CONFIRMED"), false);
    assert.equal(canTransition(terminal, terminal), true);
  }
  assert.equal(canTransition("PENDING", "COMPLETED"), false);
  assert.equal(canTransition("PENDING", "CONFIRMED"), true);
  assert.equal(canTransition("CONFIRMED", "CHECKED_IN"), true);
  assert.equal(canTransition("CHECKED_IN", "COMPLETED"), true);
});

test("references remain distinct for concurrent calls across appointment years", async () => {
  const references = await Promise.all(Array.from({ length: 2000 }, (_, i) =>
    generateAppointmentReference(new Date(`${i % 2 ? 2027 : 2026}-01-01T00:00:00Z`))));
  assert.equal(new Set(references).size, references.length);
  assert.match(references[0], /^APT-2026-/);
  assert.match(references[1], /^APT-2027-/);
});
