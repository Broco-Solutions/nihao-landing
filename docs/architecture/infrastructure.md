# Infraestructura y decisiones de arquitectura

## Decisión: Railway PostgreSQL + Prisma + Better Auth + Cloudflare R2

| Pieza | Decisión | Responsabilidad |
| --- | --- | --- |
| Aplicación | Next.js en Vercel | UI y Route Handlers. |
| Relacional | PostgreSQL estándar en Railway | Datos transaccionales de usuarios, viajes y proveedores. |
| ORM | Prisma 7 | Schema, migraciones reproducibles y query layer. |
| Identidad | Better Auth + Prisma adapter | Usuarios, cuentas y sesiones. |
| Objetos | Cloudflare R2 privado | Imágenes, tarjetas y audio futuros mediante API S3 compatible. |

Supabase fue descartado por decisión de producto. Prisma Postgres tampoco se usa: Prisma opera sobre PostgreSQL estándar en Railway. Se elige Railway porque Broco ya dispone del workspace Pro y del PostgreSQL dedicado de Nihao. R2 se elige para objetos por coste de egreso y porque la API S3 compatible conserva portabilidad: el dominio sólo conoce `StorageProvider`, no el SDK de Cloudflare.

Los blobs permanecen fuera de PostgreSQL. La base guarda únicamente `SupplierAttachment.storageKey`, tipo, MIME y tamaño.

## Variables de entorno

| Variable | Uso | Dónde definirla |
| --- | --- | --- |
| `DATABASE_URL` | URL PostgreSQL que consume Prisma. | `.env.local` / variables Vercel. |
| `BETTER_AUTH_SECRET` | Secreto aleatorio de al menos 32 caracteres. | `.env.local` / variables Vercel. |
| `BETTER_AUTH_URL` | URL pública base de la aplicación. | `.env.local` / variables Vercel. |
| `R2_ENDPOINT` | Endpoint HTTPS S3 de la cuenta R2. | `.env.local` / variables Vercel. |
| `R2_BUCKET` | `nihao-bot-assets`. | `.env.local` / variables Vercel. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Credencial activa R2 limitada al bucket. | `.env.local` / variables Vercel. |

`.env*` y el cliente Prisma generado están ignorados por Git. No se deben copiar secretos al chat ni al repositorio.

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

## Better Auth y flujo productivo confirmados

El mismo smoke test creó usuarios de email/password aleatorios, inició sesión con Better Auth y verificó la sesión server-side. Un `POST /api/bot/trips` autenticado creó el viaje con el `authenticatedUser.id` resuelto desde esa sesión. También validó membresía, draft, correcciones, confirmación, `Supplier`, `SupplierContact`, listado de capturas y los rechazos `401` sin sesión y `403` por viaje ajeno o por modificar una captura de otra persona. Todos los datos temporales se eliminan al finalizar, incluso ante un error posterior a la creación de un usuario.

Para repetirlo localmente, iniciar `pnpm dev` y, en otra terminal, ejecutar `pnpm smoke:production`. Se puede definir `SMOKE_BASE_URL` si el servidor local usa otro origen.

## Decisiones pendientes

1. Configurar secretos en Vercel y crear la UI productiva de Better Auth.
2. Integrar adjuntos en la UX sobre el `StorageProvider` ya validado.
3. Definir roles de `TripMember` sólo si la colaboración real los requiere.
