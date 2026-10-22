import assert from "node:assert/strict";
import test from "node:test";
import { mockPrismaMethod } from "../helpers/mock-prisma";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { AppointmentError, appointmentTransaction } from "../../src/lib/appointment-transaction";

function serializationFailure() {
  return new Prisma.PrismaClientKnownRequestError("Write conflict", { code: "P2034", clientVersion: "6" });
}

test("serializable transaction retries serialization failures, then returns committed result", async (t) => {

  let calls = 0;
  const transaction = mockPrismaMethod(t, prisma, "$transaction", async (_work: unknown, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "Serializable");
    if (++calls < 3) throw serializationFailure();
    return "committed";
  });
  assert.equal(await appointmentTransaction(async () => "unused"), "committed");
  assert.equal(transaction.mock.callCount(), 3);
});

test("retry exhaustion returns a conflict and unrelated errors are never retried", async (t) => {

  const transaction = mockPrismaMethod(t, prisma, "$transaction", async () => { throw serializationFailure(); });
  await assert.rejects(appointmentTransaction(async () => null), (error: unknown) => error instanceof AppointmentError && error.status === 409);
  assert.equal(transaction.mock.callCount(), 5);
  transaction.mock.mockImplementation(async () => { throw new Error("database unavailable"); });
  await assert.rejects(appointmentTransaction(async () => null), /database unavailable/);
  assert.equal(transaction.mock.callCount(), 6);
});


