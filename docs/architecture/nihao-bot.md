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

Cada operación productiva recibe el usuario de `getAuthenticatedUser()`. El repositorio Prisma verifica `TripMember` antes de crear borradores, leer, corregir, confirmar o listar. Las consultas de captura además filtran por `tripId`, por lo que un ID de captura de otro viaje no es accesible. No existe ningún parámetro `userId` aceptado por `/api/bot/*`.

`GET /api/bot/trips` lista sólo viajes de los que el usuario es miembro. `POST /api/bot/trips` crea el viaje y su primera membresía de forma atómica; el cliente no puede elegir al propietario.

Por ahora cualquier miembro de un viaje puede operar sobre sus capturas: no hay roles de colaboración especulativos. Si el producto necesita distinguir lector/editor/administrador, se añadirá una columna de rol y políticas explícitas en una iteración posterior.

## Estado de las integraciones

- PostgreSQL/Prisma: schema, migración inicial, cliente y repositorio implementados; falta conectar `DATABASE_URL` y aplicar la migración al servicio Railway confirmado.
- Better Auth: configuración, handler Next.js y resolución de sesión implementados; falta configurar secretos, migrar la base y construir la interfaz productiva de ingreso/registro.
- R2: `R2S3StorageProvider` implementa `put`, `get`, `delete` y URL firmada mediante la API S3 compatible; falta cargar sus credenciales como variables de entorno y, posteriormente, la UX de adjuntos.
- JSON: conservado sólo para demo, tests y debugging local. El filesystem no es persistencia válida en Vercel/serverless.
