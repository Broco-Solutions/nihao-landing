# Nihao Bot — Estado actual de desarrollo

**Fecha de actualización:** 4 de octubre de 2026

## Repositorio

- Repo: `Broco-Solutions/nihao-landing`
- Repo local: `/Users/franc/Broco/Nihao/nihao-landing`
- Rama del release actual: `main`
- Releases posteriores de WhatsApp: tools v3 y memoria reciente; los hashes de las verificaciones se registran en sus reportes de release.

## Continuidad de WhatsApp — 2026-10-04

El caso del vaso permanecía en un lote v1 del 2 de octubre sin empresa ni procesamiento. El webhook apuntaba al backend actualizado y la bandera del agente v3 estaba activa, pero ese lote obligaba a usar el fallback. Su clasificador aislado devolvía ayuda para `para broco` antes de consultar la pregunta pendiente; el selector además sólo aceptaba números.

La corrección acepta nombres únicos, prioriza las respuestas pendientes y transfiere a v3 sólo inboxes sin contexto, intentos, análisis ni capturas asociadas. Conserva originales y opciones de empresa; lotes procesados, tarjetas y selecciones de viaje conservan su procesador. Las aclaraciones del agente se incorporan como evidencia de contexto junto con los datos originales del producto. No requiere migración nueva.

[Diagnóstico, conversaciones y resultados de validación](whatsapp-legacy-clarification-evals-20261004.md). La implementación de memoria ya publicada corresponde a `acd015ac7ce1d70d91645cb0b63e4a841c7ab0bf`; la corrección se publica después de su gate local.

## Release histórico — producción, 2026-10-02


El release `84bb417` está publicado en frontend y backend. El usuario autorizó
explícitamente la publicación. Los cambios locales quedaron registrados y
subidos a `origin/main`; el worktree quedó limpio al terminar el release.

### Funcionalidad incluida

- Administración global de viajeros: búsqueda, edición de nombre y WhatsApp,
  pasaporte por viaje, retiro de membresías y asignación de cuentas existentes
  a un viaje y empresa. La invitación de nuevos viajeros tiene un flujo separado.
- Catálogo de empresas con viajeros afiliados agrupados por viaje.
- Vista de viaje por pestañas según rol, con resumen, proveedores, productos,
  actividad, administración y métricas.
- Agenda individual por viajero: fecha, hora, lugar, dirección e instrucciones;
  creación, edición, eliminación y copia de actividades por ADMIN global.
- Exportación PDF/Excel de informe, resumen, proveedores y productos. Los enlaces
  usan el origen del API remoto. Los generadores viven en `lib/bot/trip-export.ts`,
  separados del Route Handler para cumplir las restricciones de exports de Next.
- Evaluación del viaje de 1 a 5 con comentario; ADMIN consulta las respuestas y
  su promedio. El viajero consulta su propia evaluación.
- Recuperación de contraseña mediante Better Auth y Resend, con pantallas de
  solicitud/restablecimiento y ajustes visuales del acceso.
- Emails de invitación con nombres reales del viaje y la empresa.

### Despliegues comprobados

| Servicio | Referencia | Resultado |
| --- | --- | --- |
| Vercel frontend | `dpl_FgkefzpjicHka4WGKVzfkN2oJobm` | READY; `www.nihaonegocios.com` apunta al release `84bb417`. |
| Railway backend | `2ef9335a-e6a8-41bc-bd8f-35d84a50c5cf` | SUCCESS; upload CLI del worktree del commit `84bb417`, servicio `nihao-bot`, entorno `production`. |

GitHub inició también el deployment Railway
`5533d8e9-76c5-4686-8c71-8f39f976b6f2`, asociado al SHA completo; quedó REMOVED
al activarse el upload CLI. El deployment activo de CLI no expone `commitHash`.

Se observó además un deployment manual anterior del 30 de septiembre con el
mensaje «Agenda individual por viajero». Estar sin commit no significaba que
ningún cambio hubiera sido desplegado anteriormente.

### Validación del release

- Suite local: **162 tests PASS**, ejecutada con Node 24.21.0 y `--import tsx`.
- Test de PDF/Excel repetido tras mover los generadores: PASS.
- TypeScript y build local Next/Webpack: PASS. Builds Vercel y Railway: PASS.
- ESLint: **0 errores, 4 warnings**. `.vercel/**` se excluye por contener artefactos
  generados; los warnings restantes corresponden a navegación y una dependencia
  de un hook de captura.
- `git diff --check` y Prisma validate: PASS.
- `prisma migrate status` dentro de producción: **19 migraciones, schema al día**.
  Las tres migraciones de este release ya estaban aplicadas antes del despliegue:
  `20260929210000_trip_member_passport`, `20260930120000_trip_agenda_feedback` y
  `20260930180000_traveler_agenda`.
- Smoke HTTP: web, `/cuenta/olvide-contrasena` y `/app/viajeros` responden 200;
  `/api/auth/get-session` responde 200 con `null` sin sesión; viajeros, agenda
  y exportación responden 401 sin sesión.

Este smoke verifica disponibilidad y rechazo de acceso anónimo. No valida
login, envío de emails, exportación autenticada, operación de agendas ni UAT
físico. El release desplegado no declara los gates MVP Demo/Pilot completos.
Ver pendientes operativos en [el plan de UAT](../uat/mvp-uat-plan.md).

## Cambio local posterior al release — WhatsApp por ráfagas v2

**Implementado, no desplegado ni activado.** Cierra tras 20 segundos sin mensajes
o «listo»; persiste antes del ACK, lee todas las fuentes con caché, agrupa globalmente
y resuelve aclaraciones libres con contexto. Un lote puede crear borradores de
varias empresas del mismo viaje. Pregunta sólo viaje/empresa/asociaciones dudosas.

Incluye migración aditiva `20261002120000_whatsapp_bursts`, bandera desactivada
por defecto y compatibilidad con lotes/tarjetas v1 pendientes. Producción mantiene
las 19 migraciones y el release anteriores hasta un despliegue explícito.

Validación local: 183 tests determinísticos PASS (suite PostgreSQL omitida en
la corrida general), 11 pruebas adicionales con PostgreSQL y repositorios reales PASS,
TypeScript, build Next/Webpack y Prisma validate PASS; lint 0 errores y los 4 warnings preexistentes.
Las respuestas externas están simuladas en la regresión. Staging y UAT físico
con fotos/audios reales siguen pendientes. Ver [arquitectura, prompt y activación](../architecture/whatsapp-bursts.md).

### Productos de proveedores existentes por WhatsApp — local

Se agregó resolución de proveedores autorizados al planificador de ráfagas,
selección con opciones para homónimos y creación idempotente de productos DRAFT
asociados. La web permite revisar fuentes, editar y confirmar el producto;
informes y métricas incluyen sólo productos confirmados. El proveedor original
conserva sus datos y no se crea otro proveedor. Requiere la migración aditiva
`20261002140000_whatsapp_existing_supplier_products` (21 migraciones locales;
producción sigue con las 19 de `84bb417`). Misma bandera v2, aún desactivada.
Texto/foto/audio, reintento tras escritura, permisos y confirmación probados en
PostgreSQL aislado; medios/modelos reales pendientes de UAT.

## Historial de implementación

Las secciones siguientes conservan resultados y pendientes de cada milestone
histórico. Si contradicen el release de arriba, priorizar este resumen y el plan
de UAT; los conteos de tests, ramas y migraciones antiguos no son el estado actual.

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
- `a33b58f` feat: integrate Evolution WhatsApp transport

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
### Evolution WhatsApp — PASS

- Evolution API v2.3.7 e instancia `nihao` validadas end-to-end en STAGING.
- `ping nihao` responde `Nihao WhatsApp OK ✅` mediante el webhook real.

### Captura TEXT por WhatsApp — VALIDADO

- `TripMember.whatsappPhone` se vincula explícitamente por viaje, normalizado a dígitos e incluyendo código de país.
- El onboarding permite cargarlo y el dashboard permite verlo/modificarlo.
- Un texto de un número vinculado resuelve una única membresía ACTIVE (o PLANNED como fallback), ejecuta el pipeline Mistral existente y crea un `SupplierCapture` DRAFT para revisión humana.
- Transporte WhatsApp y captura TEXT real end-to-end validados en STAGING.

### Business card multi-foto por WhatsApp — IMPLEMENTED / BROCO HAPPY PATH VALIDATED

- Entre una y tres IMAGE de WhatsApp se guardan como `BUSINESS_CARD` en una sola `SupplierCapture` pendiente. Cada foto usa Evolution y `AttachmentService`/R2; no dispara OCR.
- `analizar tarjeta` toma ownership atómico, reúne todas las evidencias y ejecuta `runProductExtraction` con OCR Mistral y el merge conservador existentes. La captura queda `DRAFT` para revisión humana y pasa a `whatsappCardState = ANALYZED`.
- `whatsappCardState` nullable separa este flujo: `NULL` para capturas ajenas, `PENDING` para recibir fotos, `ANALYZING` para procesamiento y `ANALYZED` al terminar. Un índice UNIQUE parcial de PostgreSQL limita a una tarjeta activa (`PENDING`/`ANALYZING`) por viaje y usuario. Un trigger de base de datos bloquea la cuarta foto y la inserción durante `ANALYZING`.
- Dos IMAGE concurrentes se serializan por usuario/viaje con un advisory lock transaccional; la creación maneja colisiones del índice único. `WhatsAppCommandReceipt` consume cada `analizar tarjeta` mediante `UNIQUE(instance, messageId)`, incluso sin tarjeta pendiente o cuando otro comando tomó ownership. El receipt se vincula a la captura y pasa `PROCESSING` → `COMPLETED`/`FAILED`; un duplicate tardío jamás se aplica a otra tarjeta. Tras `FAILED`, sólo un comando nuevo (otro `messageId`) puede reintentar. `ANALYZING` y su receipt `PROCESSING` anteriores a 10 minutos se recuperan como `PENDING` y `FAILED`: los providers usan timeout de 15 segundos y, si ya constan todos los attachment IDs como analizados, se finaliza sin repetir OCR. Las fotos se conservan.
- Cada AUDIO crea una captura DRAFT independiente, conserva OGG/Opus como `audio/ogg`, persiste mediante `AttachmentService`, reutiliza Voxtral y luego el pipeline de extracción existente.
- El webhook responde ACK antes: el procesamiento se agenda con `after()`. Evidence IDs determinísticos y el estado persistido evitan adjuntos y análisis duplicados ante reintentos normales.
- UAT físico frente/reverso BROCO validado en STAGING: una captura DRAFT/ANALYZED, dos BUSINESS_CARD analizados y un receipt COMPLETED; otros escenarios físicos y AUDIO siguen pendientes. No se implementó product photo ni agrupación de texto arbitrario.

### Framework de evals MVP — IMPLEMENTED

- Business card evals, text evals, transcript extraction evals, merge/conflict y human-correction evals, channel behavior y comparación de baselines están implementados en `evals/` y documentados en `docs/development/evals.md`.
- T07 critical hallucination (`"Interesante"` → `interestScore=4`): **FIX IMPLEMENTED / PENDING REVIEW**. El provider Mistral valida la puntuación propuesta contra una valoración numérica explícita en el texto o transcript original antes de aceptarla; expresiones vagas o cualitativas quedan missing. T07 pasó 3/3 en eval local, sin validación en STAGING. El baseline histórico se conserva sin cambios.
- Kendal front/back contact merge P0: **FIX IMPLEMENTED / PENDING REVIEW**. El merge de evidencias reconoce componentes explícitos del `contact` compuesto (nombre, email, teléfono y WeChat), combina los complementarios y mantiene REVIEW ante valores incompatibles o texto libre ambiguo. No cambia schema ni persistencia. El evaluator compara `companyName` con una equivalencia secundaria de espaciado tipográfico estrictamente alfanumérica; `KendalSalud` y `Kendal Salud` pasan sin alterar el dato productivo. Kendal pasó 3/3 evals locales y la suite business cards pasó 1/4; sin UAT nuevo en STAGING.
- Sanatorio province hallucination: **FIX IMPLEMENTED / PENDING REVIEW**. La anotación OCR de Mistral propuso `Santa Fe` aunque el texto OCR bruto sólo decía `Rosario - Argentina`. Para tarjetas, el core ahora acepta `province` únicamente si el valor propuesto aparece explícitamente como palabras completas en las páginas OCR; la evidencia redactada por el modelo no basta. No usa geografía externa ni altera `city`, schema o el baseline privado. Sanatorio quedó sin `province` inventada en 3/3 evals locales; el caso completo sigue FAIL por contacto/teléfono. Falta revisión/UAT en STAGING.
- Los reportes y datasets reales permanecen en `test-data-private/`, ignorado por Git. Los runners usan providers/core productivos con archivos locales o fakes determinísticos; no escriben STAGING ni llaman Evolution.
- Real audio transcription evals: **PENDING FIXTURES**. AI EVALS ≠ UAT: el UAT físico frente/reverso conserva su estado propio.

### Fix de evidence IDs WhatsApp — VALIDATED para IMAGE

- **BUG:** durante UAT real, una business card por WhatsApp devolvía "Identificador de adjunto inválido".
- **CAUSA:** `whatsappEvidenceId()` genera `wae_<sha256>`; `createAttachmentStorageKey()` rechazaba `_` en el object ID, aunque las demás validaciones internas lo aceptaban. El fallo ocurría antes de R2 y OCR. IMAGE y AUDIO comparten este flujo.
- **FIX:** el object ID debe tener entre 8 y 80 caracteres, comenzar con letra o número y contener después sólo letras, números, `_` o `-` (`^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$`, más mínimo de 8). Se mantiene la estructura de storage keys y los IDs determinísticos existentes.
- **ESTADO:** IMAGE VALIDATED en UAT real: WhatsApp → Evolution → AttachmentService → R2 → OCR/Mistral → SupplierCapture DRAFT → respuesta. El error ya no ocurre. AUDIO sigue IMPLEMENTED / PENDING UAT físico.

### Issue UAT pendiente antes de PILOT — MEDIUM

- Un texto conversacional como "Hola" puede crear una `SupplierCapture` DRAFT sin información útil. Clasificación: **MEDIUM / PENDING BEFORE PILOT**. No se modifica ese comportamiento en el milestone multi-foto.

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

**VALIDACIÓN MANUAL DEL RELEASE Y UAT FÍSICO DE CAPTURA / CONECTIVIDAD**

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

## WhatsApp con tools — release v3

Orquestador implementado y validado, con recepción/lecturas durables, consultas, borradores de proveedores/productos y ediciones parciales. Los cambios sobre registros confirmados requieren propuesta enviada y aprobación explícita. Confirmación de nuevos borradores sólo en web. Configuración del release productivo: `WHATSAPP_AGENT_TOOLS_ENABLED=true`, modelo `mistral-small-2603`; nuevas conversaciones v3 y drenaje de versiones previas. Migración aditiva `20261002160000_whatsapp_tool_agent`. 223 pruebas aprobadas; eval real final 75/75 PASS (25 × 3), cero errores/alucinaciones críticas. UAT físico pendiente. Ver [arquitectura y validación](../architecture/whatsapp-agent-tools.md).


### OpenAI para el agente WhatsApp — 2026-10-04

Migración de v3 a `gpt-5.6-luna` usando `OPENAI_API_KEY`: interpretación de texto/transcripciones, contexto, segmentación y tools pasan a OpenAI. OCR, imágenes y transcripción quedan en Mistral. La carga de productos pide proveedor y deriva su empresa; no pide empresa. Se preservan memoria reciente, autorización, aprobación de cambios confirmados y persistencia durable. Validación y publicación se registran en [conversaciones extendidas](whatsapp-openai-extended-evals-20261004.md).

Validación del release OpenAI: 258 tests PASS; 37 escenarios aceptados con recuperación aislada de un ERROR de fixture; estabilidad 12/12 PASS. Tres conversaciones extendidas de 19 intercambios y 101 comprobaciones. TypeScript, lint, Prisma y build aprobados. Configuración del backend Railway: `WHATSAPP_AGENT_MODEL=gpt-5.6-luna`; ambas claves sólo server-side. Los resultados no sustituyen UAT físico de WhatsApp.


### Selector de proveedor por WhatsApp — 2026-10-04

Se agregó **Elegir proveedor**: lista interactiva para resolver el destino de productos pendientes, con nombre, empresa y ciudad de proveedores autorizados. Conserva selección por nombre y alternativa numerada si Evolution rechaza el formato. Máximo diez filas; otros proveedores se buscan por nombre. El producto conserva sus datos comerciales, y la empresa se deriva del proveedor. Selecciones de listas viejas no asignan un proveedor. No requiere migraciones ni variables de configuración nuevas.

Ver [arquitectura](../architecture/whatsapp-agent-tools.md) y [conversaciones de evaluación](whatsapp-supplier-picker-evals-20261004.md). La presentación física del menú en WhatsApp queda pendiente de UAT; la eval usa el modelo real, PostgreSQL aislado y transporte Evolution simulado.

Validación del selector: 266 tests PASS, 3/3 repeticiones con selección interactiva simulada y 5/5 regresiones con modelo real, incluida una conversación de seis turnos. TypeScript, ESLint y build aprobados; 42 hashes de fuentes/fixture coinciden con el código validado.


### Productos pendientes en la web — 2026-10-04

La pestaña Productos del viaje incluye productos `DRAFT` con la etiqueta **Por confirmar**, antes de los confirmados. Muestra proveedor, empresa, FOB, MOQ y plazo. Los pendientes de proveedores existentes abren su detalle; los de proveedores todavía en borrador abren la captura existente para continuar la revisión. La consulta limita los resultados al viaje y empresas autorizadas del usuario. Los informes y métricas de productos confirmados mantienen su alcance. No requiere migración.
