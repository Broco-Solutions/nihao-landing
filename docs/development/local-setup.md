# Desarrollo local de Nihao Bot

## Requisitos

- Node.js 22 (la versión usada por el proyecto).
- pnpm 11, indicado por `pnpm-lock.yaml` y `pnpm-workspace.yaml`.
- PostgreSQL local o una URL de desarrollo autorizada, para probar persistencia real.

Instalar dependencias con `pnpm install`. No desactivar validación TLS para resolver problemas de registry: diagnosticar certificados, CA y registry del entorno.

## Configuración

Copiar `.env.example` a `.env.local` y completar únicamente las variables que correspondan al entorno. Nunca versionar el archivo. Sin `DATABASE_URL` y variables Better Auth, `/demo` sigue funcionando con JSON, mientras que las rutas productivas `/api/bot/*` responden que la autenticación productiva no está configurada.

Para generar un secreto Better Auth local puede usarse un generador criptográfico local; el valor no se comparte ni se commitea. `BETTER_AUTH_URL` suele ser `http://localhost:3000` durante desarrollo.

## Prisma

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate:dev --name <descripcion>
pnpm prisma:migrate:status
```

`prisma migrate dev` sólo se usa contra una base local/de desarrollo descartable. Para un entorno ya provisionado, revisar primero el estado y usar `pnpm prisma:migrate:deploy`; no editar SQL manualmente en Railway. La migración inicial ya versionada no se aplicó durante esta iteración porque este checkout no tiene una `DATABASE_URL` segura.

Una vez que Better Auth esté inicializado, la API productiva empieza creando/listando viajes con `POST`/`GET /api/bot/trips`; el creador se vuelve miembro automáticamente. Las capturas usan después el `tripId` devuelto por esa API.

## Validación

```bash
git diff --check
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node --experimental-transform-types --test tests/bot/*.test.mts
node node_modules/next/dist/bin/next build
```

Cuando falta `DATABASE_URL`, Prisma 7 puede validarse/generarse con una URL de placeholder sólo en la invocación de proceso; no se conecta a ella y no debe guardarse. Las migraciones y su estado requieren una base real autorizada.

## Historial resumido

1. Iteración 1: UI mobile de captura Tier 1 y confirmación.
2. Iteración 2: contrato de extracción, motor Tier 1, drafts/correcciones y repositorio JSON de servidor.
3. Iteración 3: schema y migraciones Prisma, frontera de sesión/autorización, repositorio Prisma, separación demo/producto y storage R2 desacoplado.
