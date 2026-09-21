# Infraestructura y decisiones de arquitectura

## Decisión: Railway PostgreSQL + Prisma + Better Auth + Cloudflare R2

| Pieza | Decisión | Responsabilidad |
| --- | --- | --- |
| Frontend | Next.js en Vercel | UI pública; consume el API remoto mediante `NEXT_PUBLIC_API_URL`. |
| Backend | Next.js Route Handlers en Railway | Auth, Prisma, R2, extracción y API productiva. |
| Relacional | PostgreSQL estándar en Railway | Datos transaccionales de usuarios, viajes y proveedores. |
| ORM | Prisma 7 | Schema, migraciones reproducibles y query layer. |
| Identidad | Better Auth + Prisma adapter | Usuarios, cuentas y sesiones. |
| Objetos | Cloudflare R2 privado | Imágenes, tarjetas y audio futuros mediante API S3 compatible. |

Supabase fue descartado por decisión de producto. Prisma Postgres tampoco se usa: Prisma opera sobre PostgreSQL estándar en Railway. Se elige Railway porque Broco ya dispone del workspace Pro y del PostgreSQL dedicado de Nihao. R2 se elige para objetos por coste de egreso y porque la API S3 compatible conserva portabilidad: el dominio sólo conoce `StorageProvider`, no el SDK de Cloudflare.

Los blobs permanecen fuera de PostgreSQL. La base guarda únicamente `SupplierAttachment.storageKey`, tipo, MIME y tamaño.

## Variables de entorno

| Variable | Uso | Dónde definirla |
| --- | --- | --- |
| `DATABASE_URL` | URL PostgreSQL que consume Prisma. | `.env.local` / Railway. Vercel sólo la conserva para `prisma generate` durante el build actual. |
| `BETTER_AUTH_SECRET` | Secreto aleatorio de al menos 32 caracteres. | `.env.local` / Railway. |
| `BETTER_AUTH_URL` | URL pública base del API que sirve Better Auth. | `.env.local` / Railway. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Orígenes frontend autorizados por Better Auth. | `.env.local` / Railway. |
| `BETTER_AUTH_COOKIE_DOMAIN` | Dominio común para cookies cross-subdomain; vacío en local. | `.env.local` / Railway. |
| `NEXT_PUBLIC_API_URL` | Origen del backend usado por el frontend; vacío mantiene same-origin local. | `.env.local` / Vercel. |
| `NEXT_PUBLIC_AUTH_URL` | Endpoint base de Better Auth; deriva de `NEXT_PUBLIC_API_URL` si falta. | `.env.local` / Vercel. |
| `CORS_ALLOWED_ORIGINS` | Orígenes frontend permitidos por el backend. | `.env.local` / Railway. |
| `PUBLIC_APP_URL` | Origen público del frontend para enlaces de invitación. | `.env.local` / Railway. |
| `RESEND_API_KEY` | Credencial server-side de Resend para email transaccional. | `.env.local` / Railway. |
| `INVITATION_EMAIL_FROM` | Remitente verificado de invitaciones. | `.env.local` / Railway. |
| `R2_ENDPOINT` | Endpoint HTTPS S3 de la cuenta R2. | `.env.local` / variables Vercel. |
| `R2_BUCKET` | `nihao-bot-assets`. | `.env.local` / variables Vercel. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Credencial activa R2 limitada al bucket. | `.env.local` / variables Vercel. |

`.env*` y el cliente Prisma generado están ignorados por Git. No se deben copiar secretos al chat ni al repositorio.

## Invitaciones por email

Una invitación se persiste primero con su `tokenHash` SHA-256. Luego el backend intenta entregar un email transaccional mediante Resend. Si el proveedor falla o falta configuración, la invitación y su nuevo enlace siguen siendo válidos para copiar y compartir manualmente. El token nunca se persiste, se registra en logs ni se usa como idempotency key; Resend recibe una clave derivada de `invitationId` y `updatedAt`.

## Railway: conectado y migrado

El 2026-09-15 se validó la conexión a PostgreSQL estándar de Railway, base `railway`, schema `public`. La migración versionada `20260915120000_init_nihao_bot` está aplicada y `prisma migrate status` informa que el schema está actualizado.

Para una verificación local posterior, con `DATABASE_URL` apuntando al servicio correcto, ejecutar:

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate:status
pnpm prisma:migrate:deploy
pnpm prisma:migrate:status
```

No usar la UI de Railway para crear tablas manualmente. Vercel requiere una URL de acceso público o proxy TCP de Railway apta para su runtime; no publicar ni registrar esa URL en Git.

## R2 confirmado

El bucket `nihao-bot-assets` fue inspeccionado el 2026-09-15: existe, no tiene custom domains y el dominio `r2.dev` está deshabilitado. Sigue privado.

El smoke test real del 2026-09-15 validó `R2S3StorageProvider` contra R2: `put`, `get` con validación de contenido, generación de URL firmada y `delete` seguido de una lectura que confirmó la ausencia del objeto. Usó una clave aleatoria bajo `smoke-tests/` y no dejó objetos temporales.

La UX productiva no recibe credenciales R2 ni genera claves. Sube al Route Handler de Nihao Bot, que valida sesión, `TripMember`, ownership, MIME y tamaño antes de usar `StorageProvider`. El bucket no expone objetos públicos; las vistas reciben URLs firmadas de 300 segundos. Se admiten `image/jpeg`, `image/png` e `image/webp`, con un máximo de 8 MB por archivo.

## Better Auth y flujo productivo confirmados

El mismo smoke test creó usuarios de email/password aleatorios, inició sesión con Better Auth y verificó la sesión server-side. Un `POST /api/bot/trips` autenticado creó el viaje con el `authenticatedUser.id` resuelto desde esa sesión. También validó membresía, draft, correcciones, confirmación, `Supplier`, `SupplierContact`, listado de capturas y los rechazos `401` sin sesión y `403` por viaje ajeno o por modificar una captura de otra persona. Todos los datos temporales se eliminan al finalizar, incluso ante un error posterior a la creación de un usuario.

Para repetirlo localmente, iniciar `pnpm dev` y, en otra terminal, ejecutar `pnpm smoke:production`. Se puede definir `SMOKE_BASE_URL` si el servidor local usa otro origen.

## Iteración 3.1 — validación real

La infraestructura fue comprobada de punta a punta: migración y estado Prisma, Better Auth y sesión server-side, autorización 401/403, persistencia de captura/proveedor/contacto y operaciones R2. El smoke limpió todos los datos y objetos creados.

## Topología de despliegue

Producción usa `main`: frontend en Vercel (`www.nihaonegocios.com`) y backend en Railway, servicio `nihao-bot` (`api.nihaonegocios.com`). Staging debe usar `develop`: preview de Vercel y la instancia `staging` de Railway, con un Postgres separado (`api-staging.nihaonegocios.com`).

La configuración de staging fue validada el 2026-09-18: `develop` usa Vercel Preview, `staging.nihaonegocios.com` está verificado y asignado a esa rama, y `api-staging.nihaonegocios.com` sirve el backend Railway de staging. El dominio custom y el branch alias de `develop` resuelven al mismo deployment Preview.

El frontend no depende de `/api` relativo en producción. `lib/api/origin.ts` centraliza las URLs y los uploads también envían credenciales. El backend responde preflight CORS sólo para los orígenes configurados.

DNS requerido en la zona `nihaonegocios.com`:

```text
api          CNAME  wtpvptdt.up.railway.app
api-staging  CNAME  rosyaf0r.up.railway.app
```

Railway debe marcar ambos dominios como verificados antes de probar login cross-domain.

## Dependencias

Se actualizó Next.js y `eslint-config-next` a 16.3.5 para retirar los avisos críticos de Next; pnpm es el lockfile canónico y se eliminó el `package-lock.json` duplicado. `pnpm audit --prod` todavía informa transitivas de Prisma (`deepmerge-ts` y `mysql2`) que requieren una actualización coordinada de Prisma; no se forzó una versión incompatible del cliente.

## Decisiones pendientes

1. Configurar las variables ya documentadas en cada entorno de ejecución autorizado.
2. Seleccionar un proveedor multimodal para el próximo adapter de extracción.
