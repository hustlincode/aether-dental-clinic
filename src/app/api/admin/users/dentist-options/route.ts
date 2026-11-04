import { requireRole, ok } from "@/lib/api";
import { listDentistOptions } from "@/lib/user-management";
import { handleUserError } from "../_shared";

export async function GET(req: Request) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  try { return ok(await listDentistOptions(new URL(req.url).searchParams.get("userId"))); }
  catch (error) { return handleUserError(error); }
}
