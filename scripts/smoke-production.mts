import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createR2StorageProvider } from "../lib/bot/storage/r2-s3-provider.ts";

type AuthSession = { user: { id: string } };
type TripResponse = { trip: { id: string } };
type CaptureResponse = { capture: { id: string; status: string } };
type ConfirmationResponse = { capture: { id: string; status: string }; supplier: { id: string } };
type CaptureListResponse = { captures: Array<{ id: string }> };

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://localhost:3000");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL debe estar configurada para el smoke test");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const runId = randomUUID();
const smokeUsers: string[] = [];
let smokeTripId: string | undefined;
let smokeStorageKey: string | undefined;

function cookiesFrom(response: Response): string {
  const values = response.headers.getSetCookie?.() ?? [];
  const cookies = values.map((value) => value.split(";", 1)[0]).filter(Boolean);
  assert.ok(cookies.length > 0, "Better Auth no devolvió una cookie de sesión");
  return cookies.join("; ");
}

async function request(path: string, init: RequestInit = {}, cookie?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (init.method && init.method !== "GET") headers.set("origin", baseUrl.origin);
  if (cookie) headers.set("cookie", cookie);
  return fetch(new URL(path, baseUrl), { ...init, headers });
}

async function expectJson<T>(response: Response, status: number): Promise<T> {
  if (response.status !== status) {
    throw new Error(`Respuesta inesperada (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function createAndAuthenticateUser(label: string, verifySignIn = false): Promise<{ id: string; cookie: string }> {
  const email = `nihao-smoke-${runId}-${label}@example.test`;
  const password = `smoke-${randomUUID()}-A1!`;
  const signUp = await request("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: `Nihao smoke ${label}`, email, password }),
  });
  const created = await expectJson<AuthSession>(signUp, 200);
  smokeUsers.push(created.user.id);
  const signUpCookie = cookiesFrom(signUp);

  if (!verifySignIn) return { id: created.user.id, cookie: signUpCookie };

  const signIn = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  await expectJson(signIn, 200);
  const cookie = cookiesFrom(signIn);
  const session = await expectJson<AuthSession>(await request("/api/auth/get-session", {}, cookie), 200);
  assert.ok(session.user.id, "La sesión no contiene user.id");
  assert.equal(session.user.id, created.user.id, "La sesión no corresponde al usuario autenticado");
  return { id: session.user.id, cookie };
}

async function validateR2(): Promise<void> {
  const provider = createR2StorageProvider();
  smokeStorageKey = `smoke-tests/${runId}.txt`;
  const content = `nihao-r2-smoke-${runId}`;
  await provider.put({
    key: smokeStorageKey,
    body: new TextEncoder().encode(content),
    contentType: "text/plain; charset=utf-8",
  });
  const body = await provider.get(smokeStorageKey);
  assert.ok(body, "El objeto recién subido no se pudo leer");
  assert.equal(await new Response(body).text(), content, "R2 devolvió contenido distinto");
  const signedUrl = await provider.signedUrl({ key: smokeStorageKey, expiresInSeconds: 60 });
  const parsedUrl = new URL(signedUrl);
  assert.equal(parsedUrl.protocol, "https:");
  assert.ok(parsedUrl.search, "La URL firmada no contiene firma o expiración");
  await provider.delete(smokeStorageKey);
  assert.equal(await provider.get(smokeStorageKey), null, "El objeto temporal sigue disponible tras eliminarlo");
  smokeStorageKey = undefined;
}

async function validateProductFlow(): Promise<void> {
  const userA = await createAndAuthenticateUser("a", true);
  const userB = await createAndAuthenticateUser("b");
  const userOutside = await createAndAuthenticateUser("outside");

  assert.equal((await request("/api/bot/trips")).status, 401, "Una solicitud sin sesión debe devolver 401");
  const trip = await expectJson<TripResponse>(await request("/api/bot/trips", {
    method: "POST",
    body: JSON.stringify({ name: `Smoke trip ${runId}` }),
  }, userA.cookie), 201);
  smokeTripId = trip.trip.id;

  const storedTrip = await prisma.trip.findUnique({ where: { id: smokeTripId } });
  assert.equal(storedTrip?.createdById, userA.id, "El trip no se creó con authenticatedUser.id de la sesión");
  assert.ok(await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId: smokeTripId, userId: userA.id } } }));
  await prisma.tripMember.create({ data: { tripId: smokeTripId, userId: userB.id } });

  assert.equal((await request(`/api/bot/captures?tripId=${smokeTripId}`, {}, userOutside.cookie)).status, 403, "Un usuario fuera del viaje debe devolver 403");

  const captureB = await expectJson<CaptureResponse>(await request("/api/bot/extractions", {
    method: "POST",
    body: JSON.stringify({ tripId: smokeTripId, source: { type: "TEXT", text: "La fábrica se llama Proveedor B, FOB 4 USD por unidad." } }),
  }, userB.cookie), 201);
  assert.equal((await request(`/api/bot/captures/${captureB.capture.id}`, {
    method: "PATCH",
    body: JSON.stringify({ tripId: smokeTripId, field: "category", value: "Otra", acknowledgedUnknown: false }),
  }, userA.cookie)).status, 403, "Un miembro no puede modificar la captura de otra persona");

  const captureA = await expectJson<CaptureResponse>(await request("/api/bot/extractions", {
    method: "POST",
    body: JSON.stringify({ tripId: smokeTripId, source: { type: "TEXT", text: "La fábrica se llama Proveedor A, FOB 7 USD por unidad, mínimo 300 y tarda 4 semanas." } }),
  }, userA.cookie), 201);
  await expectJson<CaptureResponse>(await request(`/api/bot/captures/${captureA.capture.id}`, {
    method: "PATCH",
    body: JSON.stringify({ tripId: smokeTripId, field: "category", value: "Iluminación", acknowledgedUnknown: false }),
  }, userA.cookie), 200);
  await expectJson<CaptureResponse>(await request(`/api/bot/captures/${captureA.capture.id}`, {
    method: "PATCH",
    body: JSON.stringify({ tripId: smokeTripId, field: "contact", value: "Ana · +86 100 200", acknowledgedUnknown: false }),
  }, userA.cookie), 200);
  const confirmation = await expectJson<ConfirmationResponse>(await request(`/api/bot/captures/${captureA.capture.id}/confirm`, {
    method: "POST",
    body: JSON.stringify({ tripId: smokeTripId }),
  }, userA.cookie), 200);
  assert.equal(confirmation.capture.status, "CONFIRMED");
  assert.ok(await prisma.supplier.findUnique({ where: { id: confirmation.supplier.id } }));
  assert.ok(await prisma.supplierContact.findFirst({ where: { supplierId: confirmation.supplier.id } }));

  const captures = await expectJson<CaptureListResponse>(await request(`/api/bot/captures?tripId=${smokeTripId}`, {}, userA.cookie), 200);
  assert.ok(captures.captures.some((capture) => capture.id === captureA.capture.id), "La lista del viaje no contiene la captura creada");
}

async function cleanup(): Promise<void> {
  const failures: unknown[] = [];
  if (smokeStorageKey) {
    try {
      await createR2StorageProvider().delete(smokeStorageKey);
    } catch (error) {
      failures.push(error);
    }
  }
  if (smokeTripId) {
    try {
      await prisma.trip.delete({ where: { id: smokeTripId } });
    } catch (error) {
      failures.push(error);
    }
  }
  if (smokeUsers.length > 0) {
    try {
      await prisma.user.deleteMany({ where: { id: { in: smokeUsers } } });
    } catch (error) {
      failures.push(error);
    }
  }
  await prisma.$disconnect();
  if (failures.length > 0) throw new AggregateError(failures, "No se pudieron limpiar todos los datos temporales");
}

try {
  await validateR2();
  console.log("R2 validado: put, get, URL firmada y delete.");
  await validateProductFlow();
  console.log("Smoke productivo validado: R2, Better Auth, sesión, flujo y autorización.");
} finally {
  await cleanup();
  console.log("Datos temporales del smoke test eliminados.");
}
