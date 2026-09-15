# Nihao Bot: arquitectura

Nihao Bot captura datos estructurados de proveedores durante ferias. No es un chatbot libre: el flujo Tier 1 intenta extraer datos, muestra los encontrados, pregunta sólo los pendientes, permite corregir un campo y confirma el registro.

## Flujo productivo

```text
cliente autenticado
  -> /api/bot/*
  -> Better Auth: sesión -> authenticatedUser.id
  -> autorización: TripMember(userId, tripId)
  -> SupplierCaptureRepository
  -> PrismaSupplierCaptureRepository -> PostgreSQL Railway
                                      -> SupplierAttachment metadata
                                      -> StorageProvider -> Cloudflare R2 (objetos futuros)
```

El motor Tier 1 y el contrato de extracción permanecen debajo de `lib/bot/` y no importan Prisma, Better Auth, Railway ni el SDK de R2. La extracción actual de texto es determinista y de desarrollo; el contrato permite añadir IA, OCR o transcripción en adaptadores posteriores.

## Modos separados

| Modo | UI/rutas | Identidad | Persistencia |
| --- | --- | --- | --- |
| Demo comercial | `/demo/captura`, `/api/demo/bot/*` | Contexto fijo controlado por el servidor | `FileSupplierCaptureRepository` JSON |
| Producto | clientes futuros, `/api/bot/*` | Sesión Better Auth server-side | `PrismaSupplierCaptureRepository` / PostgreSQL |

La demo no envía `userId` ni `tripId` al servidor. Su identificador controlado existe en `lib/bot/demo-context.ts`; no puede confundirse con autenticación de producción. El login actual de `/ingresar` es sólo una compuerta de demo basada en cookie y no es Better Auth.

## Autorización

Cada operación productiva recibe el usuario de `getAuthenticatedUser()`. El repositorio Prisma verifica `TripMember` antes de crear borradores, leer, corregir, confirmar o listar. Las consultas de captura además filtran por `tripId`, por lo que un ID de captura de otro viaje no es accesible. Corregir o confirmar exige también que la captura haya sido creada por el usuario de sesión; un miembro no puede modificar la captura de otra persona. No existe ningún parámetro `userId` aceptado por `/api/bot/*`.

`GET /api/bot/trips` lista sólo viajes de los que el usuario es miembro. `POST /api/bot/trips` crea el viaje y su primera membresía de forma atómica; el cliente no puede elegir al propietario.

Por ahora cualquier miembro puede listar las capturas del viaje, pero sólo puede corregir o confirmar las propias. No hay roles de colaboración especulativos. Si el producto necesita distinguir lector/editor/administrador, se añadirá una columna de rol y políticas explícitas en una iteración posterior.

## Estado de las integraciones

- PostgreSQL/Prisma: schema, migración inicial, cliente y repositorio validados contra Railway el 2026-09-15.
- Better Auth: configuración, handler Next.js, creación/inicio de sesión y resolución server-side de `authenticatedUser.id` validados con un smoke test real el 2026-09-15. Falta la interfaz productiva de ingreso/registro y cargar los secretos en Vercel.
- R2: `R2S3StorageProvider` validado contra el bucket privado el 2026-09-15 para `put`, `get`, URL firmada y `delete`, sin residuos. Falta la UX de adjuntos.
- JSON: conservado sólo para demo, tests y debugging local. El filesystem no es persistencia válida en Vercel/serverless.
