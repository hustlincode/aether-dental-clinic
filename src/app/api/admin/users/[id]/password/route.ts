import { requireWriteRole, ok } from "@/lib/api";
import { resetUserPassword } from "@/lib/user-management";
import { handleUserError } from "../../_shared";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireWriteRole("ADMIN");
  if (error) return error;
  try { return ok(await resetUserPassword((await params).id, await req.json(), user!.id)); }
  catch (error) { return handleUserError(error); }
}
