# Nihao Bot — Estado actual de desarrollo

**Fecha de referencia:** Septiembre 2026

## Repositorio

- Repo: `Broco-Solutions/nihao-landing`
- Repo local: `/Users/franc/Broco/Nihao/nihao-landing`
- Rama de trabajo de esta iteración: `main`

## Commits principales del MVP

- `83cb645` feat: reconstruir captura Tier 1 del bot
- `3ee65f2` feat: implementar núcleo server-side de Nihao Bot
- `302dde2` feat: preparar persistencia y auth de Nihao Bot
- `98bff9b` test: validate Nihao bot production infrastructure
- `2dcd3c4` feat: construir experiencia productiva de Nihao Bot
- `e49cb3b` feat: preparar providers de extracción multimodal
- `9b8016f` feat: agregar provider de extracción Mistral
- `53c1b88` feat: conectar extracción Mistral al flujo productivo
- `7293b27` feat: add private audio transcription flow

## Stack

- Next.js 16
- TypeScript
- Prisma
- PostgreSQL / Railway
- Better Auth
- Cloudflare R2
- Mistral AI

## Variables server-side principales

Consultar `.env.example`.

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `MISTRAL_API_KEY`

Nunca versionar valores reales.

## Arquitectura actual

```text
User
↓
Trip / TripMember
↓
SupplierCapture
↓
Text / SupplierAttachment
↓
Extraction / Transcription
↓
Merge
↓
Tier 1
↓
Human review
↓
Confirmation
```

## IA actualmente integrada
### Texto
`mistral-small-2603`
### Business cards
`mistral-ocr-4-1`
### Audio
`voxtral-mini-latest` → transcript → `mistral-small-2603`
## Principios funcionales ya aplicados
- la IA propone y el usuario confirma;
- nunca auto-confirmar;
- estados DETECTED / REVIEW / MISSING;
- conflicto entre fuentes → REVIEW;
- dato incorrecto es peor que dato faltante;
- attachments autorizados antes de acceder a R2;
- no procesar URLs arbitrarias enviadas por cliente;
- secrets únicamente server-side;
- blobs en R2;
- metadata y datos estructurados en PostgreSQL.
## Smokes reales
### Texto — PASS
Se validó extracción real de:
- empresa;
- tipo de proveedor;
- FOB;
- MOQ;
- lead time.
### Business card — PASS
Se validó OCR real con tarjeta ficticia:
- empresa;
- contacto;
- email;
- teléfono;
- WeChat;
- ciudad;
- provincia.
### Audio — PASS
Flujo real validado:
audio
→ Voxtral
→ transcript
→ Mistral Small
→ Tier 1
También se validó:
- persistencia del transcript;
- reutilización del transcript;
- ausencia de segunda llamada a Voxtral cuando ya existe transcripción válida.
## Último estado de calidad conocido
- ESLint: PASS (0 errores; 3 warnings preexistentes de navegación interna)
- TypeScript: PASS
- Tests: 58 PASS
- Next build: PASS con Webpack. El build Turbopack requiere acceso a Google Fonts; el último deployment Vercel observado lo completó correctamente, pero la red local puede impedir su reproducción.
- Prisma generate: PASS
- Prisma validate: PASS
## Última migración relevante
`20260917190000_add_capture_evidence_state`.

Migraciones anteriores relevantes:

- `20260915180000_add_audio_transcription`
- `20260917120000_add_trip_member_roles`
- `20260917150000_add_trip_invitations`
- `20260917170000_add_trip_member_onboarding`

Verificar `prisma migrate status` dentro de la red privada de Railway antes de asumir que están aplicadas en cada entorno. La URL staging actual es interna y no es accesible desde el host local.
## Importante: no reconstruir
Ya existe infraestructura para:
- autenticación;
- usuarios;
- viajes;
- membresías;
- capturas;
- proveedores;
- contactos;
- attachments;
- PostgreSQL;
- R2;
- OCR;
- extracción de texto;
- transcripción;
- merge;
- autorización;
- structured output.

## Milestone: roles por viaje y base de administración

### IMPLEMENTADO

- `TripMember.role` con enum Prisma `ADMIN` / `TRAVELER`.
- La creación de un viaje crea atómicamente la membresía ADMIN del creador.
- La migración `20260917120000_add_trip_member_roles` conserva membresías existentes, asigna ADMIN al creador de cada viaje y TRAVELER al resto.
- `requireTripMember` y `requireTripAdmin` centralizan la autorización server-side.
- ADMIN puede consultar miembros, roles, capturas y proveedores de todo su viaje mediante `GET /api/bot/trips/:tripId/admin`.
- TRAVELER sólo lista y consulta sus propias capturas/proveedores; no accede a la administración ni puede modificar datos ajenos.
- La pantalla `/app/viajes/:tripId/admin` muestra miembros, roles, capturas por miembro y métricas básicas.
- El dashboard del viaje muestra el acceso administrativo únicamente a ADMIN; la API vuelve a validar el rol.

### VALIDADO

- Tests de roles, creación atómica, autorización ADMIN/TRAVELER y visibilidad por ownership.
- Regresión del flujo de attachments y captura productiva.
- TypeScript, ESLint, build y Prisma generate/validate ejecutados para este milestone.

### PENDIENTE

- No se implementaron onboarding, emails ni WhatsApp.
- El rol no tiene todavía una UI de edición: las membresías siguen siendo las existentes o las creadas por el flujo actual.

## Milestone: invitaciones de viajeros

### IMPLEMENTADO

- `TripInvitation` relaciona un viaje con un email normalizado, nombre opcional, estado `PENDING`/`ACCEPTED`/`EXPIRED`, vencimiento y timestamps.
- Los tokens se generan con 32 bytes criptográficamente seguros y sólo se persiste `tokenHash` SHA-256. La vigencia es de 7 días.
- ADMIN puede crear/listar invitaciones y regenerar explícitamente su enlace desde `/api/bot/trips/:tripId/invitations`.
- La aceptación valida sesión, email coincidente, estado, vencimiento y membresía dentro de una transacción; crea `TRAVELER` y marca la invitación como aceptada.
- La ruta pública `/invitacion/:token` permite continuar a registro/login o activar el acceso; los tokens inválidos no revelan datos.
- Como no existe provider de email en el repositorio, la entrega actual es copiar el enlace desde la administración. La abstracción de delivery queda pendiente de decisión de proveedor.

### VALIDADO

- 7 tests específicos de dominio de invitaciones pasan con Node 26 usando `--experimental-strip-types`.
- TypeScript, ESLint (sin errores), build de Next.js, `prisma:validate` y `prisma:generate` pasan.
- `prisma:migrate:status` detecta correctamente la migración pendiente `20260917150000_add_trip_invitations`.
- El gate exacto `--experimental-transform-types` no pudo ejecutarse porque la máquina tiene Node 26; esa flag corresponde al entorno Node 24 documentado.

### PENDIENTE

- Onboarding del viajero.
- Delivery automático por email y posterior WhatsApp.

La migración no fue aplicada contra la base configurada localmente: el comando identifica una base Railway provisionada y se evita aplicar cambios reales sin confirmar explícitamente el entorno autorizado.

Commit del milestone: `feat: add traveler invitations` (SHA informado en el handoff).

## Milestone: onboarding del viajero

### IMPLEMENTADO

- `TripMember.onboardingCompletedAt` guarda el estado por viaje y no en `User`.
- La migración `20260917170000_add_trip_member_onboarding` marca como completos los miembros existentes; las nuevas membresías creadas por invitación quedan pendientes. ADMIN no requiere onboarding.
- `GET/POST /api/bot/trips/:tripId/onboarding` valida sesión y membresía server-side; completar es idempotente.
- La aceptación de una invitación devuelve `onboardingRequired` y dirige al viajero nuevo al onboarding.
- El dashboard consulta el estado antes de cargar el viaje y redirige al onboarding sólo para TRAVELER pendiente, sin loops.
- `/app/viajes/:tripId/onboarding` ofrece tres pasos mobile-first: contexto del viaje, formas de captura disponibles y revisión humana de la información organizada.

### VALIDADO

- Tests de política ADMIN/TRAVELER y de aceptación con onboarding pendiente.
- TypeScript, ESLint, build de Next.js, Prisma validate/generate y tests específicos ejecutados.

### PENDIENTE

- Aplicar la migración al entorno Railway autorizado.
- Rediseño UX mobile de captura.

Próximo milestone: **REDISEÑO UX MOBILE DE CAPTURA**.
Commit del milestone: `feat: add traveler onboarding` (SHA informado en el handoff).

## Milestone: rediseño UX mobile de captura

### IMPLEMENTADO

- `/app/viajes/:tripId/proveedores/nuevo` comienza con tres acciones mobile-first: tarjeta/foto, nota de voz o texto.
- La interfaz crea y reutiliza los mismos `SupplierCapture` drafts, adjuntos R2, extracción, transcripción, merge, correcciones y confirmación existentes.
- Después de capturar, el draft agrupa la información como “Detectamos”, “Necesitamos revisar” y “Nos falta”; no expone términos internos.
- Tarjeta/foto conserva preview, cámara/archivo, progreso de subida, reintento y análisis explícito. Audio se presenta como nota de voz con grabación, tiempo, preview y repetición.
- La confirmación conserva la regla de categoría o “No sé” y muestra una pantalla de éxito con “Capturar otro proveedor” y “Ver proveedor”.
- No hubo cambios de schema, Prisma, providers, endpoints ni autorización server-side.

### VALIDADO

- Tests de agrupación visual de detectados/revisión/faltantes pasan.
- TypeScript, ESLint sin errores y build de Next.js pasan.
- La suite legacy completa requiere Node 24: Node 26 no soporta sus parameter-properties con `--experimental-strip-types`.
- No se realizó validación visual automatizada: `agent-browser` no está instalado en este entorno.

### PENDIENTE

- Validación manual/visual con sesión y evidencias reales en viewports mobile.
- Múltiples business cards / evidencias como milestone funcional separado.

Próximo milestone: **MÚLTIPLES BUSINESS CARDS / EVIDENCIAS**.
Commit del milestone: `feat: redesign mobile supplier capture` (SHA informado en el handoff).

## Milestone: múltiples business cards / evidencias

### IMPLEMENTADO

- `SupplierAttachment` continúa siendo la colección 1:N de evidencias de `SupplierCapture`; no se creó un modelo paralelo.
- Un draft admite múltiples `BUSINESS_CARD`, `PRODUCT_IMAGE` y `AUDIO`. Las tarjetas y notas de voz se pueden seleccionar de a hasta tres por operación de análisis; las fotos de producto son evidencia visual y no se envían al OCR.
- Cada audio conserva su transcript persistido y reutiliza la transcripción ya disponible. Tarjetas y audios se resuelven server-side desde R2 privado y participan del merge conservador; un conflicto queda en revisión.
- La UX móvil muestra la colección, permite agregar/eliminar evidencias y elegir cuáles analizar. El flujo sigue siendo captura → análisis → revisión humana → confirmación.
- La migración `20260917190000_add_capture_evidence_state` añade al draft metadata mínima: campos corregidos por una persona, adjuntos usados en la última extracción y `needsReanalysis`. Reanalizar no pisa correcciones humanas; borrar una tarjeta/audio usado marca la propuesta para reanálisis y bloquea confirmar hasta actualizarla.

### VALIDADO

- Node `v24.21.0` y pnpm `9.15.9` utilizados para la suite y gates de este milestone.
- En Railway staging se aplicaron `20260917120000_add_trip_member_roles`, `20260917150000_add_trip_invitations` y `20260917170000_add_trip_member_onboarding`; Prisma confirmó el schema actualizado antes de esta implementación.
- Tests de colección de attachments, composición multi-tarjeta/multi-audio, dedupe de transcripción, conflictos de merge, ownership y persistencia de correcciones humanas ejecutados junto con los gates completos.

### PENDIENTE

- Validación manual autenticada de cámara/micrófono, R2, OCR y audio real en móvil queda condicionada a disponer de sesión de prueba y hardware/browser con permisos.

Próximo milestone: **DASHBOARD DEL VIAJERO**.

## Milestone: dashboard del viajero

### IMPLEMENTADO

- `/app/viajes/:tripId` ahora es el home operativo personal: contexto del viaje, CTA dominante “Capturar proveedor”, resumen compacto, pendientes y últimos proveedores.
- `GET /api/bot/trips/:tripId/dashboard` obtiene el summary server-side. Aun si el miembro es ADMIN, el endpoint filtra siempre por `createdById` del usuario autenticado; la vista administrativa global permanece en `/admin`.
- “Pendiente” significa `SupplierCapture` en `DRAFT`. El mensaje da prioridad a `needsReanalysis`, luego `reviewFields`, luego faltantes que no fueron marcados como “No sé”. Un `Supplier` confirmado no cuenta como pendiente.
- Los drafts se continúan con `/app/viajes/:tripId/proveedores/nuevo?captureId=…`; el flujo existente recupera la captura autorizada y conserva sus evidencias/correcciones.
- Los counts y recientes usan `count`/`findMany` acotados, con `take: 3` para pendientes y `take: 5` para proveedores recientes; no hay N+1 ni nuevo modelo Prisma.
- “Hoy” se calcula contra el inicio UTC del día actual. No existe aún timezone por viaje/usuario, por lo que la UI indica UTC.

### VALIDADO

- Node `v24.21.0` usado para los gates; el proyecto declara pnpm `9.15.9`.
- Tests de aislamiento de traveler, counts, pendencias, límite/orden de recientes, cálculo UTC y acceso denegado a otro viaje.
- No se realizó validación visual autenticada/mobile: `agent-browser` sigue sin estar instalado y no hay sesión de prueba autorizada.

### PENDIENTE

- Definir timezone por viaje o usuario antes de convertir “hoy” en una métrica localizada.
- Validación manual autenticada de cámara/micrófono, R2, OCR y audio en móvil.

Próximo milestone: **DASHBOARD DEL ADMINISTRADOR**.

## Milestone: dashboard del administrador

### IMPLEMENTADO

- `/app/viajes/:tripId/admin` combina la gestión existente de viajeros/invitaciones con el summary operativo global del Trip.
- `GET /api/bot/trips/:tripId/admin/dashboard` exige `requireTripAdmin`; el dashboard personal continúa separado y personal.
- Métricas: miembros, TRAVELER activos, invitaciones PENDING/EXPIRED, capturas totales, proveedores confirmados, DRAFT pendientes y capturas de hoy UTC.
- Progreso por traveler y actividad reciente se resuelven con `groupBy` y consultas limitadas (`take: 5`), sin N+1. Los travelers se ordenan alfabéticamente, no por rendimiento.
- ADMIN conserva visibilidad global, pero no ganó mutaciones sobre capturas ajenas.

### VALIDADO

- Node `v24.21.0`, pnpm `9.15.9`, tests de autorización ADMIN/TRAVELER, agregados, progreso y actividad reciente.
- No hubo validación visual autenticada: no hay browser automation ni sesión de prueba autorizada.

### PENDIENTE

- Timezone por viaje/usuario; “hoy” usa UTC en ambos dashboards.
- Reportes / comparación de proveedores.

Próximo milestone: **REPORTES / COMPARACIÓN DE PROVEEDORES**.

## Milestone: reportes / comparación de proveedores

### IMPLEMENTADO

- `/app/viajes/:tripId/admin/proveedores` y `GET /api/bot/trips/:tripId/admin/suppliers` forman la frontera ADMIN para análisis del viaje.
- Confirmados se buscan/filtran/paginan server-side por empresa, contacto, ubicación, categoría, tipo, traveler, interés y completitud; default más recientes, con orden opcional A-Z o mayor interés.
- Categorías se agrupan con `groupBy`; DRAFT se cuentan como pendientes separados.
- Comparación temporal de 2 a 4 confirmados del mismo Trip muestra Tier 1 sin scoring ni equivalencias falsas entre moneda/unidad. `pendingFields` permite identificar confirmados que el usuario guardó con datos reconocidamente pendientes, sin confundirlos con DRAFT.

### PENDIENTE

- Validación visual autenticada permanece pendiente sin browser automation ni sesión autorizada.
- Robustez offline / conectividad.

### VALIDADO

- Node `v24.21.0` y pnpm `9.15.9`: `git diff --check`, ESLint (3 warnings preexistentes, 0 errores), TypeScript, 58 tests de `tests/bot`, build de Next, Prisma validate/generate y `prisma:migrate:status` contra Railway staging.
- Staging permanece `Database schema is up to date`; este milestone no modifica Prisma ni ejecutó migraciones. Producción no fue consultada ni modificada.

Próximo trabajo: **validación móvil autenticada y robustez operativa de conectividad**.

## Milestone: robustez offline / conectividad

### IMPLEMENTADO

- IndexedDB versionado para capturas pendientes, texto y blobs de BUSINESS_CARD, PRODUCT_IMAGE y AUDIO.
- Queue aislada por `userId + tripId`, recuperación tras refresh/cierre, indicador y sincronización manual/foreground al reconectar o volver a la app.
- `clientCaptureId` idempotente para crear/reintentar `SupplierCapture`; `clientEvidenceId` determinístico para evitar duplicar `SupplierAttachment`.
- Logout conserva pendientes y muestra advertencia; 401 conserva la queue para que la misma cuenta reanude.
- Confirmación e IA siguen bloqueadas sin red; las correcciones humanas y `needsReanalysis` continúan siendo server-side.

### VALIDADO

- Tests unitarios del store en memoria y coordinador: persistencia de Blob, aislamiento, cleanup, retry de procesamiento sin re-upload y sesión vencida conservando queue.
- Node `v24.21.0`; TypeScript, ESLint, 58 tests, `git diff --check`, Prisma validate/generate y build Next con Webpack quedaron verdes. El build Turbopack predeterminado quedó bloqueado por una restricción de workers del entorno local.
- Staging quedó `Database schema is up to date`; no hubo cambios Prisma ni migraciones nuevas.

### PENDIENTE / LIMITACIONES

- No se agregó service worker ni Background Sync: la sincronización depende del foreground.
- UAT físico de cámara/micrófono, pérdida de red durante upload y cuota real de IndexedDB requiere dispositivo/sesión autorizada; el runbook quedó documentado en `docs/development/local-setup.md`.

Arquitectura detallada: `docs/architecture/offline-sync.md`.
Commit del milestone: `94be216` (`feat: add resilient offline supplier capture`).
Revisar lo existente antes de reemplazar cualquiera de estas capas.
## Distinción obligatoria al leer documentación
### IMPLEMENTADO
Existe en código.
### VALIDADO
Además fue probado mediante tests o smoke real.
### PROPUESTO
Es visión/producto pendiente de implementación.
No confundir la visión futura documentada con funcionalidad ya disponible.
## Próximo milestone de producto

**ROBUSTEZ OFFLINE / CONECTIVIDAD**

## Milestone: transporte WhatsApp / Evolution API

### IMPLEMENTADO

- Adaptador server-side de Evolution API para `sendText`, con timeout y manejo tipado de errores.
- Webhook `POST /api/channels/whatsapp/webhook`: reconoce `MESSAGES_UPSERT` y `CONNECTION_UPDATE`, filtra instancia, mensajes propios, grupos y broadcasts.
- Smoke bidireccional temporal: el texto exacto `ping nihao` responde `Nihao WhatsApp OK ✅`.
- La capa de transporte preserva estructura extensible para texto, imágenes/tarjetas, audio, asociación teléfono → `TripMember` y la `SupplierCapture` existente; esos flujos no están implementados todavía.

### PENDIENTE

- Conectar la URL real del webhook en Evolution API y completar QR/UAT físico en STAGING.

Antes de agregar más IA:
1. Evolution API / WhatsApp;
2. mejoras de UAT móvil y conectividad real.
Documento principal de producto:
`docs/product/nihao-bot-product-experience.md`
## Git
El milestone actual fue implementado sobre `main` local. Verificar siempre el branch y el commit antes de continuar.
Antes de trabajar:
git status --short --branch
git log --oneline -10
git fetch origin
## Antes de commit
Según el cambio:
- git diff --check
- ESLint
- TypeScript
- tests relevantes
- Next build
- Prisma validate/generate/status si corresponde
## Filosofía de trabajo
Priorizar calidad de producto sobre cantidad de cambios.
No resolver silenciosamente ambigüedades funcionales importantes.
La experiencia primaria debe diseñarse para una persona usando el celular mientras recorre una feria comercial.
