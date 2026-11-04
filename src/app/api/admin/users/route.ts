import { requireRole, requireWriteRole, ok } from "@/lib/api";
import { createUser, listUsers } from "@/lib/user-management";
import { handleUserError } from "./_shared";

export async function GET(req: Request) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  try { return ok(await listUsers(new URL(req.url).searchParams)); }
  catch (error) { return handleUserError(error); }
}

export async function POST(req: Request) {
  const { user, error } = await requireWriteRole("ADMIN");
  if (error) return error;
  try { return ok(await createUser(await req.json(), user!.id), 201); }
  catch (error) { return handleUserError(error); }
}
