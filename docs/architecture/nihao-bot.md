# Nihao Bot: arquitectura

Nihao Bot captura datos estructurados de proveedores durante ferias. No es un chatbot libre: el flujo Tier 1 intenta extraer datos, muestra los encontrados, pregunta sólo los pendientes, permite corregir un campo y confirma el registro.

## Flujo productivo

```text
cliente autenticado
  -> /cuenta/ingresar o /cuenta/registro
  -> /app/viajes/:tripId
  -> /api/bot/*
  -> Better Auth: sesión -> authenticatedUser.id
  -> autorización: TripMember(userId, tripId)
  -> SupplierCaptureRepository
  -> PrismaSupplierCaptureRepository -> PostgreSQL Railway
                                      -> SupplierAttachment metadata
                                      -> StorageProvider -> Cloudflare R2 privado
```

El motor Tier 1 y el contrato de extracción permanecen debajo de `lib/bot/` y no importan Prisma, Better Auth, Railway ni el SDK de R2. La extracción actual de texto es determinista y de desarrollo; el contrato permite añadir IA, OCR o transcripción en adaptadores posteriores.

## Modos separados

| Modo | UI/rutas | Identidad | Persistencia |
| --- | --- | --- | --- |
| Demo comercial | `/demo/captura`, `/api/demo/bot/*` | Contexto fijo controlado por el servidor | `FileSupplierCaptureRepository` JSON |
| Producto | `/cuenta/*`, `/app/*`, `/api/bot/*` | Sesión Better Auth server-side | Prisma/PostgreSQL + R2 privado |

La demo no envía `userId` ni `tripId` al servidor. Su identificador controlado existe en `lib/bot/demo-context.ts`; no puede confundirse con autenticación de producción. El login actual de `/ingresar` es sólo una compuerta de demo basada en cookie y no es Better Auth.

## Autorización

Cada operación productiva recibe el usuario de `getAuthenticatedUser()`. El repositorio Prisma verifica `TripMember` antes de crear borradores, leer, corregir, confirmar o listar. Las consultas de captura además filtran por `tripId`, por lo que un ID de captura de otro viaje no es accesible. Corregir o confirmar exige también que la captura haya sido creada por el usuario de sesión; un miembro no puede modificar la captura de otra persona. No existe ningún parámetro `userId` aceptado por `/api/bot/*`.

`GET /api/bot/trips` lista sólo viajes de los que el usuario es miembro. `POST /api/bot/trips` crea el viaje y su primera membresía de forma atómica; el cliente no puede elegir al propietario.

Por ahora cualquier miembro puede listar las capturas del viaje, pero sólo puede corregir o confirmar las propias. No hay roles de colaboración especulativos. Si el producto necesita distinguir lector/editor/administrador, se añadirá una columna de rol y políticas explícitas en una iteración posterior.

## Rutas productivas

- `/cuenta/ingresar` y `/cuenta/registro`: login y alta email/contraseña con Better Auth. No usan la cookie de la demo.
- `/app`: home autenticada y lista/creación de viajes.
- `/app/viajes/:tripId`: proveedores confirmados, búsqueda y acceso a ficha.
- `/app/viajes/:tripId/proveedores/nuevo`: nota, draft Tier 1, correcciones, adjuntos y confirmación.
- `/app/viajes/:tripId/proveedores/:supplierId`: Tier 1, contacto, pendientes, business cards y fotos.

El layout de `/app` valida la sesión en el servidor. Cada Route Handler vuelve a validar sesión y autorización; proteger sólo la UI nunca se considera una frontera de seguridad.

## Adjuntos

El navegador envía `multipart/form-data` al endpoint autenticado de la captura. El servidor acepta `BUSINESS_CARD` y `PRODUCT_IMAGE` en JPG, PNG o WebP, con máximo de 8 MB, y comprueba la firma binaria además del MIME declarado. El nombre original no forma parte de la clave: el servidor genera `trips/{tripId}/captures/{captureId}/{uuid}.{ext}`. Antes de escribir valida `TripMember`, que la captura pertenezca al viaje y que el autor de la sesión sea el dueño de la captura. La confirmación queda bloqueada mientras un upload está en curso para no perder la imagen al navegar.

R2 continúa privado. La base almacena sólo `SupplierAttachment`; lectura y thumbnails usan URLs GET firmadas por 5 minutos. El borrado elimina primero el objeto y después la metadata. Si falla la creación de metadata después de subir, el servicio intenta limpiar el objeto para no dejar huérfanos.

La tarjeta se adjunta al draft pero no se interpreta. Una próxima implementación puede disparar `ExtractionService` con `IMAGE_BUSINESS_CARD` después del upload, sin introducir OCR o regex en la UI.

## Estado de las integraciones

- PostgreSQL/Prisma: schema, migración inicial, cliente y repositorio validados contra Railway el 2026-09-15.
- Better Auth: configuración, handler, UI de registro/login/logout, estado de sesión server-side y resolución de `authenticatedUser.id`.
- R2: `R2S3StorageProvider` validado contra el bucket privado y conectado a la UX productiva de adjuntos.
- JSON: conservado sólo para demo, tests y debugging local. El filesystem no es persistencia válida en Vercel/serverless.
