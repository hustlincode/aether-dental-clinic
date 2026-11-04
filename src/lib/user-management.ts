import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";

const managedRole = z.enum(["RECEPTIONIST", "ASSISTANT", "DENTIST"]);
const dentistId = z.string().min(1).max(100).nullable().optional();
const identityFields = {
  name: z.string().trim().min(2, "Enter at least two characters.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(254).toLowerCase(),
  role: managedRole,
  active: z.boolean(),
  dentistId,
};

export const staffPasswordSchema = z.string().refine(value => [...value].length >= 12, "Use at least 12 characters.")
  .refine(value => new TextEncoder().encode(value).length <= 72, "Use at most 72 UTF-8 bytes.");

export const createUserSchema = z.object({
  ...identityFields, active: z.boolean().default(true), password: staffPasswordSchema,
}).strict().superRefine((value, context) => {
  if (value.role === "DENTIST" && !value.dentistId) {
    context.addIssue({ code: "custom", path: ["dentistId"], message: "Select an existing Dentist profile." });
  }
  if (value.role !== "DENTIST" && value.dentistId) {
    context.addIssue({ code: "custom", path: ["dentistId"], message: "Only Dentist accounts can link a Dentist profile." });
  }
});

export const updateUserSchema = z.object(identityFields).partial().strict()
  .refine(value => Object.keys(value).length > 0, "Provide at least one change.");
export const resetPasswordSchema = z.object({ password: staffPasswordSchema }).strict();

export class UserManagementError extends Error {
  constructor(message: string, public status = 409, public details?: Record<string, string[]>) { super(message); }
}

export function isReservedDemoEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized === "demo@aetherdental.ph" || normalized === process.env.DEMO_EMAIL?.trim().toLowerCase();
}

const safeUserSelect = {
  id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true,
  dentist: { select: { id: true, name: true, status: true } },
} satisfies Prisma.UserSelect;
type UserRow = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;

export function userData(row: UserRow) {
  return {
    id: row.id, name: row.name, email: row.email, role: row.role, active: row.active,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    dentist: row.dentist ? { id: row.dentist.id, name: row.dentist.name, status: row.dentist.status } : null,
    isProtected: row.role === "ADMIN" || isReservedDemoEmail(row.email),
  };
}

export async function listUsers(params: URLSearchParams) {
  const query = z.object({
    search: z.string().trim().max(200).default(""),
    role: z.enum(["ADMIN", "RECEPTIONIST", "ASSISTANT", "DENTIST"]).optional(),
    active: z.enum(["true", "false"]).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  }).strict().safeParse(Object.fromEntries([...params].filter(([, value]) => value !== "")));
  if (!query.success) throw new UserManagementError("Invalid user list filters or pagination.", 400);
  const { search, role, active, page, pageSize } = query.data;
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}), ...(active ? { active: active === "true" } : {}),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: safeUserSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.user.count({ where }),
  ]);
  return { users: rows.map(userData), total, page, pageSize, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function listDentistOptions(userId: string | null) {
  if (userId !== null) z.string().min(1).max(100).parse(userId);
  return prisma.dentist.findMany({
    where: userId ? { OR: [{ userId: null }, { userId }] } : { userId: null },
    select: { id: true, name: true, status: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

async function userTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
      if (attempt === 3) throw new UserManagementError("This account changed while saving. Refresh and try again.");
    }
  }
}

async function editableUser(tx: Prisma.TransactionClient, id: string) {
  z.string().min(1).max(100).parse(id);
  const user = await tx.user.findUnique({ where: { id }, select: safeUserSelect });
  if (!user) throw new UserManagementError("User not found.", 404);
  if (userData(user).isProtected) throw new UserManagementError("Admin and demo accounts are read-only.", 403);
  return user;
}

async function checkEmail(tx: Prisma.TransactionClient, email: string, excludeId?: string) {
  if (isReservedDemoEmail(email)) throw new UserManagementError("This email is reserved for demo access.", 422, { email: ["Choose another email address."] });
  const duplicate = await tx.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true },
  });
  if (duplicate) throw new UserManagementError("A user with this email already exists.", 409, { email: ["This email is already in use."] });
}

async function checkDentist(tx: Prisma.TransactionClient, id: string | null | undefined, userId?: string) {
  if (!id) throw new UserManagementError("Select an existing Dentist profile.", 422, { dentistId: ["A Dentist profile is required."] });
  const dentist = await tx.dentist.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!dentist) throw new UserManagementError("Dentist profile not found.", 422, { dentistId: ["Select an existing Dentist profile."] });
  if (dentist.userId !== null && dentist.userId !== userId) throw new UserManagementError("This Dentist profile is already linked to another account.");
  return dentist.id;
}

export async function createUser(input: unknown, actorId: string) {
  const { password, dentistId: profileId, ...data } = createUserSchema.parse(input);
  const passwordHash = await bcrypt.hash(password, 10);
  return userTransaction(async tx => {
    await checkEmail(tx, data.email);
    if (data.role === "DENTIST") await checkDentist(tx, profileId);
    const account = await tx.user.create({ data: { ...data, passwordHash }, select: { id: true } });
    if (data.role === "DENTIST") await tx.dentist.update({ where: { id: profileId! }, data: { userId: account.id } });
    await tx.activity.create({ data: { action: "User created", entity: "User", entityId: account.id, description: `Staff account created with role ${data.role}.`, userId: actorId } });
    return userData(await tx.user.findUniqueOrThrow({ where: { id: account.id }, select: safeUserSelect }));
  });
}

export async function updateUser(id: string, input: unknown, actorId: string) {
  const { dentistId: requestedProfile, ...data } = updateUserSchema.parse(input);
  return userTransaction(async tx => {
    const existing = await editableUser(tx, id);
    if (data.email !== undefined) await checkEmail(tx, data.email, id);
    const role = data.role ?? existing.role;
    const currentProfile = existing.dentist?.id ?? null;
    const profileId = role === "DENTIST" ? requestedProfile === undefined ? currentProfile : requestedProfile : null;
    if (role !== "DENTIST" && requestedProfile) throw new UserManagementError("Only Dentist accounts can link a Dentist profile.", 422, { dentistId: ["Remove the Dentist profile for this role."] });
    const deactivateOnly = data.active === false && Object.keys(data).length === 1 && requestedProfile === undefined;
    if (role === "DENTIST" && !(deactivateOnly && !currentProfile)) await checkDentist(tx, profileId, id);
    const revoke = (existing.active && data.active === false) || role !== existing.role || profileId !== currentProfile;
    if (profileId !== currentProfile && currentProfile) await tx.dentist.update({ where: { id: currentProfile }, data: { userId: null } });
    if (profileId !== currentProfile && profileId) await tx.dentist.update({ where: { id: profileId }, data: { userId: id } });
    const account = await tx.user.update({ where: { id }, data: { ...data, ...(revoke ? { sessionVersion: { increment: 1 } } : {}) }, select: safeUserSelect });
    await tx.activity.create({ data: { action: "User updated", entity: "User", entityId: id, description: `Staff account updated; role ${role}, login ${account.active ? "active" : "inactive"}.`, userId: actorId } });
    return userData(account);
  });
}

export async function resetUserPassword(id: string, input: unknown, actorId: string) {
  const { password } = resetPasswordSchema.parse(input);
  const passwordHash = await bcrypt.hash(password, 10);
  return userTransaction(async tx => {
    await editableUser(tx, id);
    await tx.user.update({ where: { id }, data: { passwordHash, sessionVersion: { increment: 1 } }, select: { id: true } });
    await tx.activity.create({ data: { action: "User password reset", entity: "User", entityId: id, description: "Staff password reset and existing sessions revoked.", userId: actorId } });
    return { id, reset: true };
  });
}
