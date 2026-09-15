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

## Railway: operación pendiente y segura

La base debe recibir exclusivamente la migración versionada `20260915120000_init_nihao_bot`. Antes de hacerlo, confirmar en Railway que el servicio seleccionado es el PostgreSQL nuevo de Nihao y que no contiene datos que deban preservarse. Luego, en una terminal local con `DATABASE_URL` apuntando a ese servicio, ejecutar:

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate:status
pnpm prisma:migrate:deploy
pnpm prisma:migrate:status
```

No usar la UI de Railway para crear tablas manualmente. Vercel requiere una URL de acceso público o proxy TCP de Railway apta para su runtime; no publicar ni registrar esa URL en Git.

## R2 confirmado

El bucket `nihao-bot-assets` fue inspeccionado el 2026-09-15: existe, no tiene custom domains y el dominio `r2.dev` está deshabilitado. Sigue privado. El código no realiza I/O R2 hasta que las cuatro variables R2 se definan. Cualquier smoke test futuro deberá subir una clave temporal bajo `smoke-tests/`, leerla y borrarla al terminar.

## Decisiones pendientes

1. Enlazar localmente el proyecto Railway correcto o cargar `DATABASE_URL` de manera segura.
2. Aplicar la migración inicial tras confirmar la base vacía.
3. Configurar secretos en Vercel y crear la UI productiva de Better Auth.
4. Cargar la credencial R2 activa como variables de entorno y ejecutar el smoke test temporal.
5. Definir roles de `TripMember` sólo si la colaboración real los requiere.
