# Desarrollo local de Nihao Bot

## Requisitos

- Node.js 24 (la versión usada por Railway y Vercel).
- pnpm 9.15.9, fijado en `package.json`.
- PostgreSQL local o una URL de desarrollo autorizada, para probar persistencia real.

Instalar dependencias con `pnpm install`. No desactivar validación TLS para resolver problemas de registry: diagnosticar certificados, CA y registry del entorno.

## Configuración

Copiar `.env.example` a `.env.local` y completar únicamente las variables que correspondan al entorno. Nunca versionar el archivo. Sin `DATABASE_URL` y variables Better Auth, `/demo` sigue funcionando con JSON, mientras que las rutas productivas `/api/bot/*` responden que la autenticación productiva no está configurada.

Para generar un secreto Better Auth local puede usarse un generador criptográfico local; el valor no se comparte ni se commitea. `BETTER_AUTH_URL` suele ser `http://localhost:3000` durante desarrollo. Para probar la separación localmente, definir `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_AUTH_URL` con el origen del backend y agregar el origen del frontend a `BETTER_AUTH_TRUSTED_ORIGINS` y `CORS_ALLOWED_ORIGINS`. Vacíos, mantienen el modo same-origin. Para generar enlaces de invitación, definir `PUBLIC_APP_URL` con el origen público del frontend; si falta, el entorno local usa `http://localhost:3000`.

## Prisma

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate:dev --name <descripcion>
pnpm prisma:migrate:status
```

`prisma migrate dev` sólo se usa contra una base local/de desarrollo descartable. Para un entorno ya provisionado, revisar primero el estado y usar `pnpm prisma:migrate:deploy`; no editar SQL manualmente en Railway. La migración inicial ya versionada no se aplicó durante esta iteración porque este checkout no tiene una `DATABASE_URL` segura.

Una vez que Better Auth esté inicializado, la API productiva empieza creando/listando viajes con `POST`/`GET /api/bot/trips`; el creador se vuelve miembro automáticamente. Las capturas usan después el `tripId` devuelto por esa API.

## Rutas de la aplicación

La app productiva comienza en `/cuenta/registro` o `/cuenta/ingresar` y continúa en `/app`. La compuerta comercial `/demo` es independiente y no crea una sesión Better Auth. Para adjuntos productivos también se requieren las variables R2; las credenciales quedan únicamente en el servidor.

Los Route Handlers de attachments viven debajo de `/api/bot/captures/:captureId/attachments`. Las pruebas normales usan un `StorageProvider` en memoria y no necesitan R2. `pnpm smoke:production` continúa disponible para una comprobación deliberada contra infraestructura real.

## Validación

```bash
git diff --check
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node --experimental-transform-types --test tests/bot/*.test.mts
node node_modules/next/dist/bin/next build
```

Cuando falta `DATABASE_URL`, Prisma 7 puede validarse/generarse con una URL de placeholder sólo en la invocación de proceso; no se conecta a ella y no debe guardarse. Las migraciones y su estado requieren una base real autorizada.

La validación de tests debe ejecutarse con Node 24. Node 26 en modo `--experimental-strip-types` no soporta parameter properties de TypeScript, que usa el suite existente.

## Runbook de captura sin conexión

Con una sesión autenticada y un Trip autorizado:

1. Abrí `/app/viajes/:tripId/proveedores/nuevo`.
2. Desconectá temporalmente la red del dispositivo.
3. Agregá tarjeta, audio, foto y/o texto. Debe indicar que quedó guardado en el dispositivo.
4. Recargá o cerrá y volvé a abrir la captura. Los pendientes deben pertenecer sólo a la cuenta que los creó.
5. Reconectá la red y usá `Sincronizar ahora`.
6. Comprobá que se cree una sola captura, que las evidencias lleguen a R2 y que el análisis quede pendiente/ejecutado según el estado de IA.

La confirmación no funciona offline. No marcar una prueba como validada sin comprobarla con cámara/micrófono reales; IndexedDB no cifra los blobs localmente.

## Historial resumido

1. Iteración 1: UI mobile de captura Tier 1 y confirmación.
2. Iteración 2: contrato de extracción, motor Tier 1, drafts/correcciones y repositorio JSON de servidor.
3. Iteración 3: schema y migraciones Prisma, frontera de sesión/autorización, repositorio Prisma, separación demo/producto y storage R2 desacoplado.
4. Iteración 3.1: validación real de Railway, Prisma, Better Auth, autorización y R2, con limpieza de smoke data.
5. Iteración 4: autenticación y app productiva mobile-first, viajes, Tier 1 real, adjuntos R2, listado y ficha de proveedor.
