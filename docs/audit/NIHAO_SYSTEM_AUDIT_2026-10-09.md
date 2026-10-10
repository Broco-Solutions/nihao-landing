# Auditoría integral de Nihao Negocios

**Fecha de corte:** 2026-10-10 UTC (nombre de archivo solicitado: 2026-10-09)  
**Repositorio:** `Broco-Solutions/nihao-landing`  
**Modo:** audit only / read only  
**Commit auditado y desplegado en producción:** `ac61c49ceac083988f25d0015f0444a2a30b1d2d`  
**Rama local de auditoría:** `audit/nihao-system-2026-10-09`, idéntica a `origin/main` al iniciar  

## 1. Resumen ejecutivo

La fuente de verdad actual es `main@ac61c49`, porque ese mismo SHA está desplegado tanto en Vercel como en Railway producción y las 29 migraciones versionadas están aplicadas en PostgreSQL producción. `develop@97b2f31` no es staging útil ni source of truth: es ancestro de `main`, no tiene commits exclusivos, está 52 commits y 15 migraciones detrás, y carece de Evolution, OpenAI y las flags del agente v3.

El sistema no tiene hoy un único pipeline canónico efectivo de WhatsApp. Existe un destino v3, pero conviven la captura simple/tarjetas, lotes v1, bursts v2, agente v3, conversaciones legacy y fallbacks automáticos. La selección depende de flags, filas persistidas, tipo de mensaje, tarjeta pendiente, viaje/empresa autorizados y versión del workflow. Eso explica por qué un comportamiento puede cambiar después de un deploy aunque el mensaje sea parecido.

Se confirmó un defecto operativo P1 activo en producción. Hay tres ráfagas v3 `OPEN` vencidas desde hace aproximadamente tres horas; la primera se reprocesa repetidamente y las otras dos no llegaron a construir su grafo de ingesta. La primera tiene `revision=3`, pero `state.evaluatedRevision=2`. El fast-path de terminal del agente retorna antes de actualizar `evaluatedRevision` (`agent-orchestrator.ts:206-219`); `finish()` detecta una falsa revisión nueva y vuelve a dejarla `OPEN` (`prisma-burst-store.ts:145-153`). El worker reclama siempre la más antigua y procesa hasta diez iteraciones (`agent-service.ts:20-24`), produciendo un loop y starvation. Los logs muestran diez pares `worker run`/`agent processed` en el mismo minuto y la base sigue mostrando tres vencidas.

La regresión “no toma las personas” tiene una causa estructural plausible y reproducible: la identidad canónica es `User.whatsappPhone`, pero el único normalizador sólo elimina `+`, espacios, guiones y paréntesis. No transforma variantes argentinas `54`, `549`, prefijo nacional `0` ni móvil `15`; luego todos los repositorios comparan por igualdad exacta. Además, el gate exige una membresía `TripMember.role=TRAVELER`; un administrador de viaje, un usuario removido o un traveler sin una combinación viaje/empresa elegible puede ser ignorado o enviado a otro pipeline.

No se encontró P0. Tras ejecutar la continuación local y remota de sólo lectura se registran **7 P1, 8 P2 y 3 P3**. La recomendación se mantiene en la opción 2: consolidación gradual, con congelamiento inicial, reparación de la cola y autenticidad del webhook, normalización canónica de identidad, reparación del contrato de replay antes de usarlo como gate, y después retiro medido de v1/v2/legacy. No se recomienda una reescritura total ni volver directamente a un commit antiguo: la base ya está en 29 migraciones y no existe un único commit anterior certificado que cubra la funcionalidad actual.

## 2. Método, jerarquía de evidencia y límites

Se aplicó el orden solicitado:

1. código del SHA desplegado;
2. schema y migraciones aplicadas;
3. tests/evals reproducibles;
4. estado read-only de GitHub, Vercel/GitHub Deployments, Railway y PostgreSQL;
5. documentación;
6. comentarios históricos.

Todas las consultas PostgreSQL se ejecutaron dentro de `BEGIN READ ONLY` y terminaron con `ROLLBACK`. No se llamó Evolution, R2 ni proveedores IA. No se aplicaron migraciones. Las variables se inventariaron por nombre; no se copiaron valores. Los teléfonos, IDs de personas y datos comerciales no se incluyeron.

Límites de evidencia:

- Vercel CLI no tenía una sesión utilizable; el frontend se verificó mediante GitHub Deployments/statuses y HTTP público. No se pudieron listar las variables de Vercel.
- No se llamó Evolution por restricción expresa. Su versión, webhook remoto, estado de la instancia y número conectado no pudieron comprobarse; sólo se verificó que producción tiene los nombres de variables requeridos y que el código espera la forma de Evolution v2.3.7.
- R2 no expuso una consola/CLI read-only. Se verificaron configuración por presencia de nombres de variables y uso en código, no inventario ni integridad de objetos.
- En el corte inicial no había PostgreSQL local exclusivo. La continuación autorizó `nihao_audit`, aplicó 29/29 migraciones y ejecutó las suites que escriben fixtures; resultados y límites actuales constan en la sección 21.
- No se ejecutaron evals live de OpenAI, Mistral, Voxtral ni Evolution.

## 3. Estado Git real

### 3.1 Fuente de verdad y forma de la historia

- `origin/main = ac61c49`; es el default branch y coincide con ambos deploys productivos.
- `origin/develop = 97b2f31`; `main` lo contiene y está exactamente 52 commits por delante, 46 de ellos no-merge. `develop` no tiene commits únicos.
- Después del último ciclo visible de PRs `develop → main` (#3–#7), el trabajo se hizo mayormente como commits lineales sobre `main`. GitHub sólo registra los PR #8 y #10 como merges posteriores; el resto de la secuencia productiva no tiene PR asociado.
- No hay tags.
- `main` y `develop` no tienen branch protection; GitHub responde `Branch not protected`, no hay rulesets y `ac61c49` tiene cero check-runs.
- No existe `.github/workflows`; por tanto no hay CI de repositorio, checks requeridos, gate de migraciones ni smoke post-deploy.
- Vercel y Railway despliegan automáticamente los commits de `main`. Railway ejecuta `pnpm prisma:migrate:deploy` como predeploy. Un commit directo puede, por tanto, desplegar frontend, backend y schema productivo sin gate de CI.

### 3.2 Tabla de ramas

| Rama | SHA | Contiene / relación con `main` | Entorno | Estado | Acción recomendada |
|---|---|---|---|---|---|
| `main` | `ac61c49` | Fuente completa; 52 commits delante de `develop` | Producción Vercel + Railway | Activa, desplegada | Conservar; proteger inmediatamente y convertir en única rama permanente |
| `develop` | `97b2f31` | Ancestro de `main`; 0 únicos, 52 detrás | Staging Vercel + Railway | Activa pero obsoleta | No promover. Actualizar staging desde `main`; retirar `develop` tras adoptar estrategia B |
| `release/nihao-multimodal-replay-20261006` | `6955e46` | 25 commits de `main` no presentes; 2 commits propios (`6a1b437`, `6955e46`) no patch-equivalentes | Previews históricos; PR #9 abierto | No mergeada como punta; #8 fue squash/merge a `63e7882` y luego la rama siguió | No mergear sobre `main`. Comparar sólo los assets/fixtures que falten, cerrar #9 y archivar/eliminar la rama |
| `fix/whatsapp-burst-boundaries-20261006` | `8f2e9e8` | Totalmente contenida en `main`; 0 únicos | Preview histórico; luego producción | PR #10 mergeado | Eliminar remota después de confirmar política de retención |
| `fix/whatsapp-context-clarifications-20261007` | `8999d09` | Totalmente contenida en `main`; 0 únicos | Preview histórico; luego producción | Mergeada/alcanzable | Eliminar remota |
| `config/luna-medium-responses` | `e512994` | Totalmente contenida; 28 commits detrás | Producción histórica | Superada | Eliminar remota |
| `feat/nihao-bot-mvp` | `3805ca5` | Totalmente contenida; 94 commits detrás | Histórica | Superada | Eliminar remota |
| `feat/separate-api-origin` | `97cb100` | Totalmente contenida; 88 commits detrás | Histórica | Superada | Eliminar remota |
| `vercel/install-vercel-web-analytics-vvws9e` | `c909c3e` | 1 commit único; 105 commits de `main` ausentes | Preview/PR #1 | Abierta y muy desactualizada | Cerrar; si se aprueba Analytics, recrear rama corta desde `main` |
| `audit/nihao-system-2026-10-09` | `ac61c49` | Igual a `main` al iniciar; sólo contendrá estos documentos sin commit | Ninguno | Local | Conservar hasta revisión de auditoría; luego decidir su descarte/PR |

### 3.3 Deployments no trazables

En los últimos 89 deployments Railway producción listados, 22 no tienen `commitHash` ni `branch`: 21 figuran hoy `REMOVED` y uno `FAILED`, entre 2026-09-29 y 2026-10-08. Son uploads/manual deploys cuyo contenido histórico no puede reconstruirse exactamente desde Git. El deployment activo sí es trazable a `ac61c49`. `docs/development/current-state.md` confirma además que al menos un upload CLI fue en su momento el activo y no exponía SHA.

### 3.4 Contradicciones documentales Git

- `docs/development/current-state.md` aún afirma que bursts v2 y migraciones posteriores eran locales/no desplegados y que producción tenía 19 migraciones. Producción tiene 29 y v3 está activo.
- `docs/development/whatsapp-agent-exact-prompt-20261009.md` dice “sin push ni deploy”; el archivo entró en `a16e8a2`, que GitHub registra desplegado en Vercel y Railway producción el 2026-10-09.
- La misma documentación conserva conteos históricos de 17 fallos, mientras la suite actual expone 550 tests con 35 skips y el eval determinístico de canal falla C06.
- El comentario de `lib/bot/storage/provider.ts:12-15` dice que R2 no fue provisionado, pero `r2-s3-provider.ts` es la implementación productiva y ambos entornos tienen los nombres de variables R2.

## 4. Deployments y entornos

### 4.1 Estado real

| Entorno | Frontend SHA | Backend SHA | DB migrations | Flags | Evolution | Estado |
|---|---|---|---|---|---|---|
| Producción | `ac61c49`, Vercel, 2026-10-09 22:17:57Z; `www.nihaonegocios.com` | `ac61c49`, Railway, SUCCESS, 2026-10-09 22:17:22Z; `api.nihaonegocios.com` | 29/29 aplicadas, 0 incompletas, 0 rollback; PostgreSQL 18.6 | `WHATSAPP_AGENT_TOOLS_ENABLED=true`; `WHATSAPP_BURSTS_ENABLED=false`; sin flags nativas Railway | Configuración presente; versión/instancia/webhook/número no verificados | Front/backend/DB corresponden al mismo release; worker activo pero con loop P1 |
| Staging | `97b2f31`, Vercel, 2026-09-29 02:09:54Z; `staging.nihaonegocios.com` | `97b2f31`, Railway, SUCCESS, 2026-09-29 14:07:48Z; `api-staging.nihaonegocios.com` | 14 aplicadas, 0 incompletas, 0 rollback; PostgreSQL 18.6 | flags de agent/bursts ausentes; sin flags nativas Railway | Variables Evolution y OpenAI ausentes | Coherente internamente pero 52 commits/15 migraciones detrás; no valida producción actual |

Los cinco dominios públicos respondieron: raíz 308 hacia `www`; `www`, staging web, API producción y API staging respondieron 200. Esto valida disponibilidad HTTP, no comportamiento autenticado ni UAT.

### 4.2 Variables, sólo nombres

Producción, además de las variables Railway inyectadas, tiene:

`BETTER_AUTH_COOKIE_DOMAIN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_URL`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `INVITATION_EMAIL_FROM`, `MISTRAL_API_KEY`, `OPENAI_API_KEY`, `PUBLIC_APP_URL`, `R2_ACCESS_KEY_ID`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `WHATSAPP_AGENT_MODEL`, `WHATSAPP_AGENT_TOOLS_ENABLED`, `WHATSAPP_BATCH_SECRET`, `WHATSAPP_BURSTS_ENABLED`.

Staging tiene Better Auth, CORS, DB, email, Mistral, R2, Resend y `WHATSAPP_BATCH_SECRET`, pero no Evolution, OpenAI, `WHATSAPP_AGENT_MODEL`, `WHATSAPP_AGENT_TOOLS_ENABLED` ni `WHATSAPP_BURSTS_ENABLED`.

Las variables Vercel no pudieron inventariarse por falta de sesión CLI. La existencia del cron se prueba por `vercel.json` y por requests productivos por minuto.

### 4.3 Worker real

- Vercel ejecuta `/api/cron/whatsapp-batches` cada minuto (`vercel.json`).
- El cron llama al backend Railway con `WHATSAPP_BATCH_SECRET` (`app/api/cron/whatsapp-batches/route.ts:4-17`).
- El backend responde `{accepted:true}` antes de finalizar el trabajo y delega a `after()` (`app/api/channels/whatsapp/process-batches/route.ts:9-20`). Next 16 documenta que `after()` corre después de responder y que en self-hosting necesita completar trabajo pendiente/graceful shutdown.
- Logs HTTP muestran 200 por minuto, pero ese 200 sólo prueba aceptación. Logs runtime y DB prueban que el trabajo puede quedar en loop.

## 5. Arquitectura vigente

### 5.1 Componentes

- **Web App:** Next.js 16.3.5 App Router, `next-intl`, componentes en `components/app`, frontend Vercel.
- **API:** Route Handlers Next ejecutados en Railway, separados por `NEXT_PUBLIC_API_URL`/CORS.
- **Auth:** Better Auth con Prisma; email/password y reset por Resend (`lib/auth/auth.ts`).
- **Dominio:** viajes, membresías, empresas globales y asignaciones por viaje en Prisma/PostgreSQL.
- **Capturas:** `SupplierCapture` como borrador/evidencia; `Supplier` y `SupplierProduct` como recursos materializados.
- **Adjuntos:** metadata PostgreSQL y objetos privados R2 mediante interfaz `StorageProvider`; URL firmada para lectura.
- **IA:** Mistral para OCR/visión/extracción/segmentación; Voxtral para audio; OpenAI Responses/Luna para agente y tools.
- **WhatsApp:** Evolution adapter; webhook público; inboxes legacy y durables; cron Vercel y worker Railway.
- **Replay/evals:** runners determinísticos y live separados, fixtures públicos de replay y datasets privados ausentes en este checkout.
- **Exports/emails:** PDF/Excel de viajes y emails de invitación/reset.
- **Offline:** IndexedDB por usuario/viaje, IDs determinísticos para captura/adjuntos y reintentos; no hay Service Worker/PWA completo y los blobs no están cifrados.

### 5.2 Diagramas textuales

#### Web App → captura → IA → revisión → confirmación

```text
Browser autenticado
  → ProductCapture
  → POST SupplierCapture DRAFT (clientCaptureId idempotente)
  → uploads AttachmentService
      → metadata PostgreSQL
      → objeto privado R2
  → POST extraction
      → tarjeta: Mistral OCR 4.1
      → texto/transcript: Mistral Small 2603, schema JSON strict, temperature 0
      → audio: Voxtral mini latest → Mistral Small 2603
      → merge conservador / reviewFields / evidence
  → edición humana
  → confirmación o auto-confirmación por reglas del dominio
  → Supplier + SupplierProduct CONFIRMED/DRAFT según flujo
```

#### WhatsApp → webhook → lote/contexto → agente/pipeline → captura

```text
Evolution messages.upsert
  → POST /api/channels/whatsapp/webhook
  → parser de instancia/tipo + gate por teléfono/TripMember TRAVELER
  → durableWhatsAppActive
      ├─ v3 nuevo si agent flag=true
      ├─ v2 nuevo si bursts flag=true y agent=false
      └─ versión persistida conserva su procesador
  → receive idempotente (messageId + advisory lock)
  → WhatsAppBurst OPEN, quiet window 5 s
  → after() inmediato o cron cada minuto
  → lease → descarga Evolution → R2 → OCR/audio/visión
  → grafo de assets/cargas → contexto viaje/empresa
  → OpenAI Luna + 17 tools strict → operaciones transaccionales
  → receipt idempotente → captura/proveedor/producto
  → outbox WhatsAppBurstReply → Evolution

Si durable devuelve null:
  → captura/tarjeta simple legacy o WhatsAppBatch v1
  → WhatsAppConversation para selector viaje/empresa
```

#### Persona/teléfono → usuario → TripMember → empresa → viaje

```text
teléfono remoto
  → normalizeWhatsAppPhone (sólo quita + espacio - ( ))
  → user.whatsappPhone UNIQUE (igualdad exacta)
  → TripMember(userId, tripId, role=TRAVELER)
  → viaje ACTIVE/PLANNED y fecha elegible
  → TripCompany activa
  → TripCompanyMember(userId, companyId)
  → 1 opción: contexto automático
  → >1 opción: aclaración v3/selector legacy
  → 0 opción: fallback legacy o silencio según el punto de corte
```

#### Captura/evidencia → proveedor/producto

```text
SupplierCapture(tripId, companyId, createdById)
  ├─ SupplierAttachment → R2
  ├─ SupplierProduct (puede existir antes/después de Supplier)
  └─ Supplier 1:1 por captureId al confirmar

Evidence graph v3
  → logical load SUPPLIER | PRODUCT | EVIDENCE
  → AgentOperation receipt
  → create/update domain command
  → capture/supplier/product + attachment association
```

#### Retry/idempotencia/receipts/workers

```text
(instance,messageId) UNIQUE en mensajes/receipts
  → advisory lock por instance+phone
  → burst revision + leaseId + leaseUntil
  → save/update con fencing revision+lease
  → AgentOperation id derivado del comando/evidencia
  → COMMITTING / finish
  → reply UNIQUE(burstId,revision)
  → send con lease y estado SENT/SUPERSEDED

Fallo actual:
terminal revision 3 + evaluatedRevision 2
  → finish cree que apareció mensaje nuevo
  → vuelve a OPEN
  → reclamo FIFO repetido
  → starvation de ráfagas posteriores
```

## 6. Inventario de pipelines WhatsApp

| Camino | Entrada/activación | Persistencia/estado | Idempotencia/fallback | Final activo |
|---|---|---|---|---|
| Smoke simple | texto exacto `ping nihao`; durable lo delega | `WhatsAppMessageReply` en el camino legacy | gate previo; luego reply | Activo, sólo para vinculados |
| Captura texto/audio simple | durable inactivo o receive durable=false | `SupplierCapture`, attachments, receipts | `clientCaptureId`/evidence ID deterministas | Compatibilidad activa |
| Tarjetas v1 | imagen con tarjeta pendiente/simple | `whatsappCardState`, `WhatsAppCommandReceipt`; índice parcial y trigger máx. 3 | command receipt por messageId | Compatibilidad activa |
| Batches v1 | empresa resuelta, mensajes agrupados | `WhatsAppBatch`, `WhatsAppBatchMessage`, audio segments, `WhatsAppConversation` | UNIQUE message; puede transferirse a v3 si no fue procesado | Persistidos/legacy activos |
| Bursts v2 | `WHATSAPP_BURSTS_ENABLED=true` para nuevos, o filas v2 existentes | `WhatsAppBurst version=2` | mismo inbox durable; no hay nuevos en prod porque flag=false | Sólo compatibilidad con persistidos |
| Agente v3 | `WHATSAPP_AGENT_TOOLS_ENABLED=true` o fila v3 existente | `WhatsAppBurst version=3`, message/readings, operations, replies, agent context, pending evidence | locks, leases, receipts y effect IDs | Pipeline preferido en producción |
| Fallback legacy | durable devuelve `null`: smoke, media no soportada, tarjeta v1 pendiente, usuario sin catálogo elegible, conflicto legacy | tablas legacy/captura | varias barreras cross-table evitan doble messageId | Activo y silencioso respecto del cambio de semántica |
| Contexto reciente | v3 cuando existe `WhatsAppAgentContext`; bootstrap de operaciones completadas | focus por instance+phone+user; memoria reciente adicional | limpia al cambiar viaje/empresa | Activo |
| Replay | fixture + PostgreSQL local exclusivo + mocks/tape | mismas tablas/dominio productivo, limpieza posterior | red bloqueada en determinístico | Ejecutado en `nihao_audit`; M/O/G/H/K fallan y constituyen NHA-017 |

No se encontró evidencia de que un mismo `messageId` se materialice a la vez en dos caminos: `PrismaBurstStore.receive()` comprueba mensajes v3, v1, replies y command receipts (`prisma-burst-store.ts:29-35`). El riesgo real es otro: mensajes distintos de la misma conversación pueden caer en procesadores distintos y leer contextos diferentes.

Fuentes de contexto coexistentes:

1. `WhatsAppConversation` legacy (stage TRIP/COMPANY/READY/DONE);
2. `WhatsAppBatch` v1 y su análisis;
3. `WhatsAppBurst.state` por workflow;
4. `WhatsAppAgentContext.focus` durable;
5. memoria reciente reconstruida desde operaciones;
6. `WhatsAppPendingEvidence` para condiciones comerciales futuras.

No existe aún UN pipeline canónico operativo. v3 es el candidato canónico, pero los fallbacks son implícitos y no sólo adaptadores de lectura de datos históricos.

## 7. Identidad, personas, viajes y empresas

### 7.1 Identidad canónica real

- No hay modelo `Traveler` o `Person` separado.
- `User` es la identidad de cuenta y contiene `email UNIQUE` y `whatsappPhone UNIQUE` (`schema.prisma:74-99`).
- Ser viajero significa tener `TripMember` con rol por viaje `TRAVELER`; pasaporte y onboarding viven en esa membresía (`schema.prisma:172-185`).
- `User.role` es rol global; `TripMember.role` es rol del viaje. No son intercambiables.
- `Company` es catálogo global; `TripCompany` la asigna a un viaje; `TripCompanyMember` afilia al usuario a esa empresa en el viaje.

### 7.2 Resolución exacta

- Normalización: `lib/bot/whatsapp-phone.ts:3-10`, creada en `65152b6`; sólo remueve caracteres de presentación y valida 8–15 dígitos.
- Match: `PrismaWhatsAppIdentityRepository`, igualdad exacta contra `User.whatsappPhone` y membresía `role=TRAVELER` (`prisma-identity-repository.ts:4-8`).
- Selección inicial: prioriza viajes ACTIVE; usa PLANNED sólo si no hay ACTIVE; más de uno produce `ambiguous` (`identity.ts:9-16`).
- Catálogo v3: además exige viaje elegible por fecha, rol TRAVELER, empresa activa y membresía de empresa (`trip-catalog.ts:5-9`).
- Legacy: considera ACTIVE/PLANNED sin la misma regla temporal y permite compañías distintas según el rol; por eso el conjunto de opciones no es idéntico (`prisma-conversation-repository.ts:17-65`).

### 7.3 Casos solicitados

- `54` vs `549`: quedan como claves diferentes. No hay conversión ni alias.
- `0`/`15`: no se eliminan; un número nacional puede pasar la regex pero no igualar el JID internacional.
- Más de una membresía: el gate marca ambiguous; v3 carga catálogo y pregunta contexto, legacy usa selector numerado. La UX depende del pipeline.
- Sin empresa: el gate puede reconocer el viaje, pero el catálogo v3 queda vacío; durable rechaza y el legacy responde que no pertenece a una empresa.
- Removido del viaje: deja de resolver por WhatsApp. Sus capturas históricas no se eliminan porque `SupplierCapture.createdById` referencia `User`, no `TripMember`.
- ADMIN usando WhatsApp: si su rol de viaje es `ADMIN` y no también una membresía TRAVELER (imposible en la PK actual), el gate no lo reconoce y responde 200 sin mensaje. El global `User.role=ADMIN` no lo corrige.
- Múltiples empresas: v3 debe pedir contexto por carga; legacy persiste la selección en `WhatsAppConversation`.
- Datos históricos: la migración `20260928120000_trip_companies` copió literalmente los teléfonos desde `TripMember` a `User` y no recanonicalizó formatos. Un cambio de JID o una variante histórica puede dejar de resolver.

### 7.4 Integridad read-only observada

| Control | Producción | Staging |
|---|---:|---:|
| Usuarios | 7 | 5 |
| Usuarios con WhatsApp | 5 | 2 |
| Teléfonos inválidos según regla actual | 0 | 0 |
| Colisiones normalizadas actuales | 0 | 0 |
| Usuarios sin Account | 0 | 0 |
| Travelers sin empresa activa | 0 | 0 |
| Empresas globales sin viaje | 0 | 0 |
| Travelers con más de un viaje elegible | 1 | 0 |
| Capturas cuyo creador ya no es TripMember del viaje | 1 | 8 |
| Captura con company/trip incompatibles | 0 | 0 |
| Captura de traveler fuera de su empresa | 0 | 0 |
| Batch con referencias incompatibles/inexistentes | 0 | 0 |
| Contexto/pending evidence con teléfono o referencias incompatibles | 0 | n/a (tablas aún no existen) |

La captura huérfana de producción es DRAFT, pertenece a un viaje PLANNED y fue creada por un usuario global TRAVELER. En staging hay ocho: seis DRAFT y dos CONFIRMED, entre roles globales ADMIN/TRAVELER. Pueden ser historial legítimo después de remover miembros, pero el schema no distingue “histórico preservado” de “ownership inconsistente”.

## 8. Modelo de datos y migraciones

- El repo contiene 29 directorios de migración.
- Producción tiene las 29 aplicadas, sin `finished_at` nulo ni rollback, hasta `20261008050000_whatsapp_pending_evidence`.
- Staging tiene 14, hasta `20260929130000_supplier_products`; le faltan 15.
- Hay dos pares de migraciones con el mismo prefijo horario (`20260929190000_*` y `20261007180000_*`). Prisma usa el nombre completo, por lo que no hay colisión aplicada, pero el orden humano no es inequívoco sólo por timestamp.
- Índices parciales y el trigger `enforce_whatsapp_card_attachment_limit()` viven únicamente en SQL de migración; Prisma no puede expresarlos en `schema.prisma`.
- El índice `WhatsAppBurst_one_worker_sender` sólo excluye concurrencia en `PROCESSING/COMMITTING`; permite varios `WAITING/OPEN` por teléfono, una decisión necesaria para conversaciones suspendidas pero que exige una política explícita de fairness.
- Muchos estados críticos son `String`: `WhatsAppConversation.stage`, batch/message status, burst status, reply status, operation status y pending evidence status. No hay enums/checks DB para estados ni transiciones.
- `WhatsAppConversation.tripId/companyId` no tienen FK; `WhatsAppCommandReceipt.tripId/createdById` tampoco.
- Las FKs garantizan que captura, trip y company existan, pero no que `TripCompany.tripId == SupplierCapture.tripId` ni que el creador siga siendo miembro.
- El único CHECK de negocio hallado es rating de feedback 0–10.
- La migración de empresas aborta ante conflictos legacy, hace backfill de teléfonos, crea empresa legacy por viaje y afilia travelers; no normaliza teléfonos.

Tablas legacy aún activas: `WhatsAppConversation`, `WhatsAppMessageReply`, `WhatsAppBatch`, `WhatsAppBatchMessage`, `WhatsAppAudioSegment`, card states y command receipts. No deben eliminarse hasta migrar o cerrar todas sus filas pendientes y probar replay de compatibilidad.

## 9. IA, prompts y reglas comerciales

| Función | Provider/modelo real | Contrato |
|---|---|---|
| Texto y transcript | Mistral `mistral-small-2603` | JSON schema; temperature 0; timeout base 15 s |
| OCR de tarjeta | Mistral `mistral-ocr-4-1` | annotation JSON schema; sólo campos visibles |
| Visión/clasificación/segunda lectura | Mistral; modelo textual/visual y fallback configurable `mistral-large-4-0` | temperature 0; 20–30 s según etapa |
| Audio | Mistral/Voxtral `voxtral-mini-latest` | multipart; timeout 30 s; transcript persistido |
| Agente/tools | OpenAI Responses `gpt-5.6-luna` en producción | reasoning `medium`, `store:false`, sin temperature, max output 2048, tools strict, no tool calls paralelas |

El agente tiene 17 tools strict y límites soft/hard de 12/24 rondas, watchdog de repetición/no progreso y tools disponibles según el estado. `provider-resilience.ts` aplica concurrencia por lane, dos intentos por defecto, backoff y circuit breaker por provider. Los HTTP 401/403 se clasifican como configuración y no abren circuito; 429/5xx/timeout/network son reintentables.

Separación real:

- imágenes no se envían a OpenAI; OCR/visión va a Mistral;
- texto, resultados OCR, contexto y tools van al agente OpenAI;
- el dominio valida autorización, evidencia, receipts y transacciones después del modelo;
- cambios confirmados usan propuesta/aprobación; algunas creaciones pueden auto-confirmarse por reglas explícitas del backend.

Duplicaciones/contradicciones:

- Web y WhatsApp legacy usan el provider de extracción común, pero v3 agrega clasificación, captions, grouping y el prompt del agente;
- v2 usa `MistralBurstInterpreter`; v3 usa `WhatsAppAgentOrchestrator`; ambos deciden asociación con contratos distintos;
- fixtures/tapes simulan decisiones del modelo y no certifican la semántica de Luna actual;
- documentación histórica sostiene “nunca auto-confirmar”, mientras el código actual contiene `autoConfirmSupplierCapture` y receipts con `confirmationReason`;
- `commercialTypoFacts` corrige typos en extracción, mientras prompts y eval expectations también contienen reglas comerciales; deben tener una especificación única de dominio.

Casos de persona/empresa, proveedor/producto, frente/reverso, audio asociado, ambigüedad y duplicados tienen cobertura parcial. No hay UAT actual de `ac61c49` que certifique el conjunto completo.

## 10. Web App y offline

Better Auth, CORS con allowlist, sesiones con cookies, autorización global/por viaje y acceso por empresa están implementados. Las rutas de capturas usan IDs cliente estables; attachments validan scope y generan keys seguras. R2 usa S3 API, HTTPS obligatorio, objetos privados y URLs firmadas con expiración máxima de siete días.

Offline no significa aplicación completa sin red:

- captura y blobs quedan en IndexedDB, filtrados lógicamente por `userId` y `tripId`;
- el ID local se reutiliza como `clientCaptureId` y cada evidencia como `clientEvidenceId`, dando idempotencia al reintento;
- hay backoff y clasificación auth/forbidden/invalid/server;
- análisis, edición completa, productos y confirmación requieren reconexión;
- no hay Service Worker, caché de shell ni manifest PWA encontrados;
- blobs y texto quedan sin cifrar en el dispositivo;
- no hubo UAT físico actual de cámara, micrófono, cierre/reapertura y reconexión.

Producción registra repetidamente `MISSING_MESSAGE: services.academy.cardText (es)`. `lib/content-i18n.ts:104` solicita la clave; `messages/en.json` e `it.json` la tienen, `messages/es.json` no. El build no lo detecta y la ruta pública continúa 200 con log de error.

## 11. Tests, evals, replay y build

Node real: 24.13.0 local; package manager declarado `pnpm@9.15.9`; Railway resuelve Node 24.21.0 y pnpm 9.15.9.

| Gate | Resultado | Tiempo/observaciones |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS | 3.3 s; warning deprecación `url.parse` |
| `pnpm prisma:generate` | PASS | URL placeholder, sin conexión; cliente 7.10.0 |
| `pnpm prisma:validate` | PASS | 1.45 s |
| `pnpm lint` | PASS con warnings | 0 errores, 4 warnings: 3 navegaciones `window.location.assign`, 1 import no usado en test |
| `pnpm typecheck` | PASS | 30.73 s |
| `pnpm test` | PASS parcial | 550 total, 515 pass, 35 skip, 0 fail, ~20.2 s |
| `pnpm build` | PASS | Next 16.3.5/Turbopack, compile 22.4 s, TS 41 s, 14 páginas estáticas; ~86 s |
| eval merge determinístico | PASS | 7/7 |
| eval batches determinístico | FAIL | 8/9 con integración PostgreSQL; el caso fallido y el exit 0 ante FAIL quedan en NHA-009 |
| eval channel determinístico | FAIL | 9/10; falla `C06-hola` por expectativa de copy desactualizada |
| replay determinístico | NO EJECUTADO | requiere PostgreSQL local exclusivo; no se aplicaron migraciones por restricción |
| eval text/cards/audio/products/agent live | NO EJECUTADO | requieren proveedor real y/o dataset privado; prohibido consumir crédito |

Los 35 skips incluyen lifecycle/capturas PostgreSQL, permisos HTTP, agent operations, picker, memoria, leases, bursts, handoff legacy, pendientes comerciales y replays A–J/34 imágenes. Son precisamente los límites donde se concentran las regresiones observadas.

El runner de evals sólo pone exit code no-cero por `ERROR` o `XPASS`, no por `FAIL` (`scripts/run-evals.mts` al final). Por eso `C06-hola` puede producir un resultado FAIL y aun así dejar exit 0. Además, el runner channel usa servicios en memoria y fakes: no ejercita Prisma, locks, leases, R2, Evolution ni selección productiva de flags.

Los documentos de eval producción del 7 de octubre son evidencia histórica de `c30d278`, no certificación de `ac61c49`; registran 23 pass/6 fail y escrituras EVAL reales. Después hubo 13 commits productivos adicionales.

## 12. CI y proceso de release

La ausencia de protección, workflows y required checks explica directamente cómo `main` quedó 52 commits delante de `develop`. El despliegue automático recompensa el camino más corto: commit a `main` → Vercel/Railway → migraciones → producción. Staging dejó de recibir el desarrollo real y se volvió decorativo.

### Alternativas

- **A. `main=prod`, `develop=staging`:** viable sólo si se obliga a duplicar/mergear cada cambio y mantener ambas ramas. El historial demuestra que el equipo ya no siguió esa disciplina; agrega drift y merges ceremoniales.
- **B. `main` única permanente, ramas cortas + preview + promoción:** recomendada. Coincide con Vercel/Railway, elimina la ambigüedad y permite que staging ejecute exactamente un SHA candidato de `main`/PR.
- **C. release branches permanentes:** no justificada por el tamaño del equipo ni la infraestructura; aumentaría los estados posibles.

### Estrategia recomendada exacta

- **Quién despliega:** GitHub Apps de Vercel/Railway; ninguna laptop hace deploy normal. Una cuenta humana autorizada aprueba el environment de producción.
- **Desde qué rama:** sólo `main`; PRs cortos desde feature/fix. Staging apunta al SHA del PR candidato o al último `main`, nunca a `develop` divergente.
- **Gates bloqueantes:** install frozen, Prisma generate/validate, lint sin errores, typecheck, unit tests, PostgreSQL integration/replay en DB efímera, build, migration lint/status, y smoke HTTP/auth/worker controlado. Evals determinísticos deben fallar el job ante `FAIL`.
- **Migraciones:** primero sobre DB efímera desde cero y snapshot compatible; después staging sobre el mismo SHA; producción sólo como predeploy aprobado, tras backup/check y con migración backward-compatible.
- **Rollback:** promover artefacto/SHA anterior; las migraciones deben ser expand/contract para permitirlo. No usar rollback SQL improvisado.
- **Staging:** desplegar automáticamente el SHA candidato aprobado; copiar sólo la forma de variables/flags, nunca datos productivos. Ejecutar smoke y matriz prioritaria antes de promoción.
- **Prevención de commit directo:** branch protection/ruleset, PR obligatorio, 1 aprobación, checks requeridos, conversación resuelta, bloquear force push/delete y restringir deploy production a environment protegido.

## 13. UAT

La matriz detallada está en `NIHAO_TEST_MATRIX_2026-10-09.md`. Resumen:

- No se declara `VALIDADO REAL` para flujos de usuario del SHA actual. HTTP, logs y SELECT son observación operativa, no UAT controlado.
- Idempotencia básica, parsing, reglas de dominio y numerosos escenarios están `VALIDADO AUTOMÁTICO` sólo en memoria/mocks.
- Teléfonos argentinos variantes y ADMIN de viaje están `ROTO` por inspección/reproducción determinística del resolver.
- Contexto post-restart está implementado, pero la cola actual está `ROTO` por el loop de revisión.
- Auth, onboarding, dashboards, reports, exports y offline/reconnect quedan `IMPLEMENTADO NO VALIDADO` para el release actual.
- Entrega real, audio real y UAT humana siguen sin validar. Evolution (versión/conexión/webhook) y el inventario/reconciliación básico R2 quedaron observados por lectura autenticada; ver sección 21 y NHA-018.

## 14. Hallazgos priorizados

### NHA-001

**Severidad:** P1  
**Área:** WhatsApp worker / integridad operacional  
**Tipo:** bug real activo  
**Síntoma:** tres bursts v3 de producción permanecen `OPEN` vencidos; uno se reprocesa repetidamente y dos no inician ingesta.  
**Causa raíz:** el agente puede persistir terminal/pending de la revisión actual sin actualizar `evaluatedRevision`. En el siguiente run, el fast-path retorna antes de la asignación; `finish()` interpreta `evaluatedRevision` viejo como una revisión nueva y conserva `OPEN`. El orden por `dueAt` y el `break` después de checkpoint/ausencia de snapshot producen starvation.  
**Evidencia exacta:**

- `lib/channels/whatsapp/agent-orchestrator.ts:202-220`;
- `lib/channels/whatsapp/prisma-burst-store.ts:110-125,145-153`;
- `lib/channels/whatsapp/agent-service.ts:20-24,196-220`;
- commit desplegado `ac61c49`; origen de `evaluatedRevision` en `dfbe70f`;
- SELECT 2026-10-10: OPEN=3, versiones 3, oldest overdue ≈183 min; caso líder `revision=3`, `evaluatedRevision=2`, pending revision 3; los otros tienen 13 y 10 mensajes sin grafo;
- logs 00:20:29Z: diez pares `WhatsApp worker run`/`WhatsApp agent processed` dentro del mismo segundo.

**Impacto:** mensajes no finalizan ni reciben respuesta, backlog por teléfono, llamadas/reprocesos innecesarios y falta de confiabilidad del canal.  
**Cómo reproducir:** crear una revisión que finalice en `asked_clarification` por la rama manual del servicio conservando `evaluatedRevision` anterior; ejecutar `processDue(10)` dos veces y observar que vuelve a OPEN.  
**Solución recomendada:** hacer que todo terminal actualice atómicamente `evaluatedRevision`; reparar el fast-path para normalizarlo; agregar invariant `terminal.revision == evaluatedRevision`; selección justa/`SKIP LOCKED` y test PostgreSQL de starvation.  
**Riesgo de la solución:** cerrar erróneamente una revisión realmente supersedida si se elimina el fencing. Mantener comparación con la revisión leída bajo lock.  
**Test de aceptación:** un burst con aclaración pasa una sola vez a WAITING, genera una sola reply; dos bursts posteriores se procesan; reejecutar cron no cambia operations/replies.

### NHA-002

**Severidad:** P1  
**Área:** identidad/personas  
**Tipo:** bug real de resolución; sin colisiones actuales observadas  
**Síntoma:** una persona conocida puede no resolverse cuando el número guardado y el JID difieren entre `54`, `549`, `0` o `15`.  
**Causa raíz:** “normalizar” sólo elimina puntuación y luego se compara exacto. El backfill histórico tampoco canonicalizó.  
**Evidencia exacta:** `lib/bot/whatsapp-phone.ts:3-10`; `prisma-identity-repository.ts:4-8`; `prisma-burst-store.ts:22-24`; migration `20260928120000_trip_companies:1-12`; commit original `65152b6`.  
**Impacto:** webhook ACK 200 sin captura/respuesta; regresión percibida como “no toma las personas”.  
**Cómo reproducir:** guardar `549...` y resolver el mismo abonado como `54...`, o guardar formato nacional con `0/15`; el lookup devuelve cero.  
**Solución recomendada:** canonicalización E.164 argentina única y tabla/alias de teléfonos verificados; backfill auditado con conflictos explícitos.  
**Riesgo:** fusionar dos personas si se aplica una heurística agresiva. Requiere reporte de conflictos y aprobación humana.  
**Test de aceptación:** matriz 54/549/0/15 converge sólo cuando representa el mismo número; colisiones detienen la migración; formatos de otros países no se adivinan.

### NHA-003

**Severidad:** P1  
**Área:** seguridad / webhook  
**Tipo:** vulnerabilidad real de autenticidad  
**Síntoma:** el endpoint acepta cualquier JSON que declare el nombre de instancia correcto; no valida firma, secreto, origen ni API key entrante.  
**Causa raíz:** el route handler pasa directamente el body al parser; el parser sólo compara `payload.instance`.  
**Evidencia exacta:** `app/api/channels/whatsapp/webhook/route.ts:18-38`; `lib/channels/evolution/webhook.ts:74-106`.  
**Impacto:** quien conozca/infiera instancia, message ID y un teléfono vinculado puede inyectar mensajes, provocar llamadas IA y crear/modificar datos dentro de los permisos de esa identidad.  
**Cómo reproducir:** POST sintético válido al endpoint sin header de autenticación; el parser lo trata como message. No se ejecutó contra producción.  
**Solución recomendada:** firma/HMAC o secreto de webhook soportado por el proveedor, replay window y allowlist adicional; rechazar antes de parsear dominio.  
**Riesgo:** cortar Evolution si la firma/config no coincide. Implementar en staging con modo observe y fail-closed planificado.  
**Test de aceptación:** sin firma/incorrecta → 401/403 y cero filas/IA; firma correcta y replay idéntico → una sola recepción.

### NHA-004

**Severidad:** P1  
**Área:** CI/release  
**Tipo:** causa sistémica  
**Síntoma:** commits directos a `main` despliegan automáticamente y aplican migraciones sin check requerido.  
**Causa raíz:** ramas sin protección, cero rulesets, cero workflows/check-runs y Railway predeploy automático.  
**Evidencia exacta:** GitHub branch protection 404 para main/develop; rulesets `[]`; `.github/workflows` ausente; status de `ac61c49` sólo Vercel/Railway; 46 commits no-merge entre develop y main.  
**Impacto:** regresión llega a producción antes de staging/UAT; rollback de código puede quedar incompatible con schema.  
**Cómo reproducir:** un push permitido a main inicia ambos providers; historial GitHub Deployments lo demuestra en cada SHA reciente.  
**Solución recomendada:** estrategia B y gates exactos de la sección 12.  
**Riesgo:** ralentizar hotfixes; resolver con fast lane de PR, nunca bypass silencioso.  
**Test de aceptación:** push directo rechazado; PR no mergea con un gate rojo; producción requiere aprobación y SHA certificado.

### NHA-005

**Severidad:** P1  
**Área:** entornos  
**Tipo:** deuda operativa con impacto real  
**Síntoma:** staging verde no representa producción.  
**Causa raíz:** staging quedó en develop y el desarrollo continuó en main.  
**Evidencia exacta:** staging `97b2f31`, producción `ac61c49`; 52 commits/15 migraciones; staging sin Evolution/OpenAI/agent flags.  
**Impacto:** no existe preproducción donde reproducir identidad, v3, worker, replay o migraciones actuales.  
**Cómo reproducir:** comparar SHAs, `_prisma_migrations` y nombres de variables.  
**Solución recomendada:** recrear/actualizar staging desde el mismo SHA candidato y configuración de forma equivalente.  
**Riesgo:** ejecutar workflows productivos por error; usar instancia/número/bucket/DB totalmente aislados.  
**Test de aceptación:** tabla de release muestra mismo SHA y mismas 29 migraciones; secrets/recursos siguen aislados; matriz crítica pasa.

### NHA-006

**Severidad:** P1  
**Área:** arquitectura WhatsApp/contexto  
**Tipo:** deuda arquitectónica y causa de regresiones  
**Síntoma:** mensajes de una misma persona pueden cambiar de semántica por estado histórico/flag y usar distinto selector/contexto.  
**Causa raíz:** rutas v1/v2/v3 y legacy activas; `handleBurstWebhook` retorna null deliberadamente y el route cae al legacy; versiones persistidas ignoran flags para conservar procesador.  
**Evidencia exacta:** `webhook/route.ts:35-44`; `burst-webhook.ts:7-26`; `durable-routing.ts:8-23`; `prisma-burst-store.ts:22-103`; `prisma-conversation-repository.ts`; seis fuentes de contexto enumeradas.  
**Impacto:** fallbacks silenciosos, aclaraciones distintas, elegibilidad diferente y difícil replay de incidentes.  
**Cómo reproducir:** misma entrada con tarjeta v1 pendiente, burst persistido v2/v3, traveler sin empresa o flags distintas.  
**Solución recomendada:** un inbox/router canónico; adaptadores legacy sólo migran/cargan estado, nunca deciden lógica nueva; fallback explícito y observable.  
**Riesgo:** workflows históricos pueden quedar sin procesador. Requiere inventario/migración por estado y rollback por flag.  
**Test de aceptación:** tabla de routing exhaustiva demuestra una única transición por messageId/contexto y replay de todas las filas legacy pendientes.

### NHA-007

**Severidad:** P2  
**Área:** roles/identidad  
**Tipo:** comportamiento implementado no validado  
**Síntoma:** un ADMIN de viaje usando WhatsApp queda silenciosamente ignorado; global ADMIN no altera esto.  
**Causa raíz:** el gate filtra exclusivamente `TripMember.role=TRAVELER` y corta en `unlinked`, mientras partes legacy contemplan ADMIN.  
**Evidencia exacta:** `prisma-identity-repository.ts:7`; `inbound-gate.ts:12-16`; `prisma-conversation-repository.ts:37-54`; prod actualmente no tiene global ADMIN con membresía TRAVELER.  
**Impacto:** comportamiento contradictorio por canal/rol.  
**Cómo reproducir:** usuario válido con membresía ADMIN y teléfono único; webhook retorna received sin respuesta.  
**Solución recomendada:** decisión de producto explícita; si se permite, resolver identidad separada de autorización de acción.  
**Riesgo:** dar capacidad de captura a un rol no previsto.  
**Test de aceptación:** caso ADMIN tiene resultado deliberado (permitido con scope o rechazo informativo), nunca silencio accidental.

### NHA-008

**Severidad:** P2  
**Área:** integridad de datos  
**Tipo:** deuda con evidencia de datos históricos  
**Síntoma:** 1 captura prod y 8 staging tienen creador que ya no es miembro; estados string y relaciones cruzadas permiten inconsistencias adicionales.  
**Causa raíz:** no hay FK compuesta captura→TripMember, checks company→trip ni enums/checks para workflows; la remoción preserva datos sin marcar ownership histórico.  
**Evidencia exacta:** `schema.prisma:259-325,362-434,545-653`; SELECT de integridad; sólo rating tiene CHECK de negocio.  
**Impacto:** consultas/ownership ambiguos, imposibilidad de distinguir histórico válido de corrupción.  
**Cómo reproducir:** crear captura y retirar TripMember; la captura permanece.  
**Solución recomendada:** política `createdBy` histórica explícita más `ownerMembershipSnapshot`/auditoría; constraints para trip/company y estados/transiciones donde sean expresables.  
**Riesgo:** constraint inmediato puede fallar con historial existente. Auditar/backfill antes.  
**Test de aceptación:** reporte de cero incoherencias no explicadas; remover miembro conserva auditoría pero revoca acceso nuevo.

### NHA-009

**Severidad:** P2  
**Área:** tests/evals  
**Tipo:** bug del gate y cobertura insuficiente  
**Síntoma:** eval channel tiene 1 FAIL, whatsapp-batches tiene 1 FAIL y el runner puede salir 0 ante ambos; la continuación eliminó los skips PostgreSQL, pero reveló NHA-017 en replay.  
**Causa raíz:** C06 espera copy viejo; exit code sólo mira ERROR/XPASS; DB suites son opt-in.  
**Evidencia exacta:** `evals/channel/runner.ts:51-76`; final de `scripts/run-evals.mts`; ejecuciones: channel 9/10, batches 8/9, suite PostgreSQL 746 pass/8 fail/2 skip.  
**Impacto:** una release puede mostrar “tests verdes” sin ejecutar persistencia ni fallar ante regresiones semánticas conocidas.  
**Cómo reproducir:** ejecutar `runChannel()` sin providers; observar FAIL y proceso 0.  
**Solución recomendada:** FAIL debe bloquear; PostgreSQL efímero obligatorio en CI; separar contratos de copy de reglas de conducta.  
**Riesgo:** baselines antiguos bloquearán inicialmente; triage explícito, no XFAIL permanente sin owner/fecha.  
**Test de aceptación:** un caso FAIL produce exit 1 y CI rojo; suites DB/replay reportan ejecutadas, no skip.

### NHA-010

**Severidad:** P2  
**Área:** UAT/replay  
**Tipo:** comportamiento no validado  
**Síntoma:** no hay certificación end-to-end controlada del SHA actual.  
**Causa raíz:** staging obsoleto, fixtures privados ausentes y replay requiere DB local; los evals live históricos certifican SHAs anteriores.  
**Evidencia exacta:** último informe productivo usa `c30d278`; `main` añadió 13 commits; la continuación ejecutó replay recorded y observó Evolution/R2, pero no UAT ni proveedor live.  
**Impacto:** semántica real de Luna, audio, frente/reverso, restart y delivery sigue desconocida.  
**Cómo reproducir:** comparar SHA del informe y deploy.  
**Solución recomendada:** matriz en staging equivalente + replay grabado + UAT humano mínimo antes de producción.  
**Riesgo:** usar datos/proveedores reales; aislar fixtures y presupuesto.  
**Test de aceptación:** cada escenario crítico tiene evidencia SHA/entorno/fecha y clasificación separada automática/real.

### NHA-011

**Severidad:** P2  
**Área:** observabilidad  
**Tipo:** deuda operativa  
**Síntoma:** cron devuelve 200/accepted aunque el trabajo posterior falle, se repita o se estanque.  
**Causa raíz:** `after()` desacopla respuesta y no existe job/run persistido ni healthcheck de backlog/edad.  
**Evidencia exacta:** `process-batches/route.ts:9-20`; HTTP 200 cada minuto; NHA-001 coexistiendo con status verdes.  
**Impacto:** plataforma muestra éxito mientras usuarios no reciben resultados.  
**Cómo reproducir:** burst atascado + cron; status HTTP sigue 200.  
**Solución recomendada:** run ledger, métricas de oldest_due/lease/retries/dead-letter y alerta; endpoint health read-only.  
**Riesgo:** ruido de alertas; definir SLO por estado.  
**Test de aceptación:** backlog vencido vuelve health degradado y alerta; run registra claimed/completed/failed.

### NHA-012

**Severidad:** P2  
**Área:** Web/i18n  
**Tipo:** bug real  
**Síntoma:** producción registra `MISSING_MESSAGE: services.academy.cardText (es)` en la landing.  
**Causa raíz:** código pide la clave, pero falta en español; build no valida paridad de catálogos.  
**Evidencia exacta:** log Railway 2026-10-10 00:20:29Z; `lib/content-i18n.ts:104`; clave presente en `messages/en.json:468` e `it.json:468`, ausente en es.  
**Impacto:** error runtime/placeholder potencial y contaminación de logs.  
**Cómo reproducir:** renderizar landing locale es.  
**Solución recomendada:** agregar paridad de keys al gate y la traducción aprobada.  
**Riesgo:** sólo editorial.  
**Test de aceptación:** render es sin MISSING_MESSAGE y test de catálogos iguales.

### NHA-013

**Severidad:** P2  
**Área:** documentación  
**Tipo:** documentación desactualizada/contradictoria  
**Síntoma:** current-state y reportes dicen local/no deploy, 19 migraciones o nunca auto-confirmar, contrario al código/infra.  
**Causa raíz:** documentos acumulativos por tarea sin encabezado de vigencia ni generación desde deployment.  
**Evidencia exacta:** contradicciones de sección 3.4 y estado infra observado.  
**Impacto:** decisiones operativas basadas en un estado superado.  
**Cómo reproducir:** comparar documentos con GitHub Deployments y `_prisma_migrations`.  
**Solución recomendada:** current-state generado por SHA/entorno; históricos marcados explícitamente como tales.  
**Riesgo:** borrar contexto útil; conservar historial con fecha/SHA.  
**Test de aceptación:** una página de estado muestra SHA, migraciones y flags obtenidos del release; no afirma “local” sobre commits desplegados.

### NHA-014

**Severidad:** P3  
**Área:** trazabilidad de deployment  
**Tipo:** deuda histórica  
**Síntoma:** 22 deployments Railway recientes sin SHA/branch.  
**Causa raíz:** uploads CLI/manuales.  
**Evidencia exacta:** Railway deployment list: 22/89 sin commitHash, uno failed y 21 removed.  
**Impacto:** no se puede reconstruir exactamente qué código estuvo activo en incidentes pasados.  
**Cómo reproducir:** listar deployments y filtrar meta.commitHash vacío.  
**Solución recomendada:** prohibir deploy normal desde CLI; break-glass exige artefacto/SHA y ticket.  
**Riesgo:** menor flexibilidad de emergencia.  
**Test de aceptación:** todo deployment nuevo incluye repo, SHA y actor/aprobación.

### NHA-015

**Severidad:** P3  
**Área:** schema/migraciones  
**Tipo:** deuda técnica  
**Síntoma:** invariantes manuales no visibles en Prisma y prefijos de migración duplicados.  
**Causa raíz:** limitaciones de Prisma y naming manual.  
**Evidencia exacta:** índices/trigger de `20260924210000`, índices parciales de bursts, dos pares de timestamps.  
**Impacto:** introspección/schema review no muestra toda la verdad; orden humano confuso.  
**Cómo reproducir:** comparar schema con SQL aplicado.  
**Solución recomendada:** catálogo versionado de invariantes SQL y test de presencia en `pg_catalog`; timestamp único para nuevas migraciones.  
**Riesgo:** ninguno si sólo se documenta/testea.  
**Test de aceptación:** CI confirma trigger/índices tras migrar DB efímera.

### NHA-016

**Severidad:** P3  
**Área:** offline  
**Tipo:** deuda/riesgo conocido  
**Síntoma:** IndexedDB guarda blobs/texto sin cifrar; no hay app shell offline ni UAT físico actual.  
**Causa raíz:** alcance implementado es cola de captura, no PWA completa.  
**Evidencia exacta:** `lib/offline/capture-store.ts:41-73`; `sync.ts:30-59`; ausencia de service worker/manifest; documentación local reconoce límite.  
**Impacto:** exposición local en dispositivos compartidos y expectativas de offline sobredimensionadas.  
**Cómo reproducir:** inspeccionar IndexedDB o abrir app sin shell cacheado.  
**Solución recomendada:** etiquetar alcance, retención/borrado por logout y análisis de cifrado; UAT reconnect.  
**Riesgo:** cifrado puede complicar recuperación/sync.  
**Test de aceptación:** logout borra datos de la cuenta o política aprobada; captura/reinicio/reconnect no duplica.

### NHA-017

**Severidad:** P1  
**Área:** replay/gate de regresión  
**Tipo:** fallo determinístico reproducible  
**Síntoma:** al habilitar PostgreSQL local, el replay recorded deja 8 tests rojos: fixtures M, O, G, H y K, más aserciones dependientes de M/G.  
**Causa raíz:** M/O/H/K consumen más pasos que sus `agentMock`; K termina en `model_error`/`resume_limit`. G espera cero confirmaciones automáticas, pero el flujo actual confirma una. El runner de evals además sigue devolviendo cero ante `FAIL`.  
**Evidencia exacta:** `pnpm test` contra `nihao_audit`: 756 tests, 746 pass, 8 fail, 2 skip; `tests/bot/whatsapp-replay.test.mts`; reportes rendered de M/O/G/H/K.  
**Impacto:** no hay baseline determinístico íntegro para certificar cambios en el pipeline durable; un gate podría pasar aunque haya `FAIL`.  
**Solución recomendada:** decidir por caso si cambió el contrato o hay regresión; versionar fixture/tape/expectativa junto al cambio y hacer que `FAIL` produzca exit no-cero.  
**Test de aceptación:** A–P y los tapes derivados pasan offline con cero red; una divergencia intencional falla el proceso y se ve en CI.

### NHA-018

**Severidad:** P2  
**Área:** R2 / retención e integridad de evidencia  
**Tipo:** configuración e inventario incompletos  
**Síntoma:** el inventario autenticado ve 429 objetos: las 159 filas de `SupplierAttachment` tienen objeto, pero quedan 12 objetos bajo `trips/` sin fila asociada y 258 bajo `whatsapp/` que no pertenecen a ese modelo. Las APIs de CORS y lifecycle devuelven `AccessDenied`.  
**Causa raíz:** no hay reconciliación/retención versionada ni permiso read-only de auditoría para configuración de bucket.  
**Evidencia exacta:** `ListObjectsV2` paginado; PostgreSQL remoto dentro de `BEGIN READ ONLY`/`ROLLBACK`; prefijos `trips=171`, `whatsapp=258`, referencias `SupplierAttachment trips=159`; cero referencias sin objeto.  
**Impacto:** no se puede certificar la retención, CORS ni el destino de los 12 objetos. No se concluye que los 258 `whatsapp/` sean basura: pertenecen a otro flujo de almacenamiento.  
**Solución recomendada:** otorgar lectura de configuración, definir inventario por owner/modelo y clasificar los 12 objetos antes de cualquier borrado.  
**Test de aceptación:** reconciliación periódica distingue referencias, objetos temporales y huérfanos; CORS/lifecycle quedan visibles para auditoría; cero eliminación automática sin política aprobada.

## 15. Causa sistémica de regresiones

No es un único prompt ni un único commit. Es la combinación de:

1. producción como primer entorno real para 52 commits;
2. auto-deploy y auto-migrate sin gate;
3. compatibilidad acumulativa que agrega caminos sin retirar el anterior;
4. identidad resuelta de manera exacta y mezclada con autorización/contexto;
5. múltiples fuentes de estado conversacional;
6. worker asíncrono cuyo ACK no representa resultado;
7. suites críticas opt-in y evals que no fallan ante `FAIL`;
8. documentación narrativa que conserva estados históricos como si fueran actuales.

El defecto `evaluatedRevision` demuestra el patrón: fencing e idempotencia existen, pero una transición manual fuera del punto canónico viola la invariante, y no había test DB obligatorio ni alerta de edad de backlog para detectarlo antes.

## 16. Solución objetivo

### Opción 1: conservar y corregir puntos concretos

Ventaja: menor cambio inmediato. Desventaja: mantiene router, contextos y state machines duplicadas; resolvería síntomas pero no la causa de regresión. Útil sólo para Fase 1.

### Opción 2: consolidar gradualmente módulos duplicados

**Recomendada.** Primero estabiliza sin perder datos; después mueve todos los mensajes a un inbox/state machine canónico y convierte legacy en importadores/adaptadores explícitos. Permite flags y rollback por etapa.

### Opción 3: volver a un commit estable y reintroducir

No recomendada como plan principal. No hay un commit anterior que combine funcionalidad, 29 migraciones y UAT completo. Revertir código sin revertir datos/schema puede aumentar el daño. Mantener como contingencia para desactivar agent v3 y volver temporalmente a un procesador compatible si se demuestra seguro con las filas existentes.

### Arquitectura objetivo

```text
Transport adapters (Evolution / Web / futuro WeChat)
  → CanonicalChannelMessage(channel, account, externalMessageId, senderRaw, sentAt, payloadRef)
  → Authenticity + dedupe
  → PhoneIdentity(raw, canonicalE164, userId, verifiedAt, aliases)
  → AuthorizedContextResolver(user, eligible trips, companies)
  → ConversationWorkflow
      RECEIVED → READY → LEASED → WAITING_USER
                     ├→ RETRY_AT
                     ├→ FAILED/DEAD_LETTER
                     └→ DONE
  → Evidence pipeline (transport-agnostic)
  → Domain commands (supplier/product/capture)
  → Agent adapter (advisory; no direct persistence)
  → Effect receipts + outbox
  → transport sender
```

Principios:

- una identidad de teléfono canónica con aliases y conflictos auditables;
- una state machine con estados/constraints y transición única;
- lease con heartbeat o trabajos acotados; fairness entre workflows;
- idempotencia persistida en ingreso, efectos y salida;
- un único `ConversationContext`, con memoria derivada y versionada;
- IA sin autoridad de acceso ni escritura fuera de comandos validados;
- fallbacks nombrados (`LEGACY_MIGRATION_REQUIRED`, `UNSUPPORTED_MEDIA`), nunca `null` silencioso;
- replay registra envelope, decisiones externas, estado y receipts, sin copiar secretos;
- observabilidad por workflow y SLO de oldest due;
- flags sólo para promoción de versión, con fecha de retiro y métricas;
- Web/WhatsApp/WeChat comparten dominio y evidencias, no transporte.

## 17. Recomendación y orden

Recomendada: **opción 2, consolidación gradual**, con este orden:

1. congelar releases y preservar evidencia;
2. reparar loop/starvation y proteger webhook;
3. definir/canonicalizar identidad y política ADMIN/removidos;
4. desplegar staging equivalente y ejecutar replay/UAT crítico;
5. hacer v3 único para mensajes nuevos y migrar/cerrar estados legacy;
6. asegurar Web/offline/regresiones;
7. activar CI/protección/promoción por SHA;
8. producción canary, observación, rollback por artefacto.

El detalle ejecutable está en `NIHAO_STABILIZATION_PLAN_2026-10-09.md`.

## 18. Riesgos de la recomendación

- canonicalizar teléfonos puede revelar conflictos reales y requiere resolución humana;
- migrar conversaciones WAITING puede asociar respuestas a preguntas antiguas si no se conserva message/reply binding;
- constraints nuevas pueden fallar por historia legítima;
- cambiar worker con backlog activo exige snapshot y rollout controlado;
- retirar legacy demasiado pronto puede dejar tarjetas/lotes históricos sin procesar;
- staging equivalente debe usar número/instancia/bucket/DB aislados para no enviar mensajes reales;
- replay determinístico prueba contrato/backend, no la semántica live del modelo.

## 19. Decisiones que requieren aprobación humana

1. Política de teléfonos argentinos y autoridad para resolver colisiones de backfill.
2. Si ADMIN de viaje puede operar WhatsApp como traveler o debe recibir rechazo explícito.
3. Retención/ownership de capturas cuando una persona es removida.
4. Cierre de PR #9 y destino de sus dos commits/fixtures únicos.
5. Cierre/recreación de PR #1 Analytics.
6. Presupuesto y dataset consentido para evals live/UAT real.
7. Provisión de Evolution staging aislado y acceso read-only a configuración real.
8. Política de datos offline en dispositivos y borrado al logout.
9. Aprobación de estrategia B y de los owners/aprobadores de producción.

## 20. Accesos/bloqueos pendientes

- CORS/lifecycle de R2: el inventario y la reconciliación por objetos ya son read-only verificables, pero las APIs de configuración responden `AccessDenied`;
- reparación/versionado de los fixtures y tapes de replay M/O/G/H/K antes de declarar el gate operativo;
- datasets privados y presupuesto/consentimiento para los evals que requieren IA real; quedaron deliberadamente sin ejecutar;
- UAT humana con cuentas/roles/dispositivos representativos; no se enviaron mensajes ni se hicieron llamadas IA live;
- información de branch protection/required reviewers si se gestiona fuera de la API consultada (GitHub mostró none).

## 21. Continuación de auditoría — 2026-10-10 UTC

La continuación no modificó ningún servicio remoto. Vercel se consultó mediante el proyecto explícito `nihao-landing`, sin enlazar el directorio: producción contiene `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CRON_SECRET`, `DATABASE_URL`, `MISTRAL_API_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AUTH_URL`, las cuatro variables R2 y `WHATSAPP_BATCH_SECRET`; preview contiene las URLs/DB/secret de batch y development no contiene variables. Railway producción contiene el conjunto del backend, incluido Evolution y las flags del agente. La comparación es por presencia, no por valor: los únicos solapamientos operativos requeridos por el cron/frontend son DB, URLs públicas, R2 y `WHATSAPP_BATCH_SECRET`; Evolution y OpenAI son correctamente sólo backend.

Evolution fue consultado exclusivamente por GET autenticado: raíz 200 con versión 2.3.7, `fetchInstances` 200 con estado `open`, y `webhook/find` 200 con webhook habilitado y dos eventos. No se expusieron URL, número ni credenciales, y no se mandó WhatsApp. Esto cierra la incertidumbre de versión/conexión/configuración mínima, no una UAT de entrega ni NHA-003.

La DB local `postgresql://nihao_audit:nihao@127.0.0.1:5434/nihao_audit` quedó con 29/29 migraciones. Para que los guards de las suites aceptaran esta base explícitamente autorizada se permitieron sólo los paths locales `/nihao_agent_test` o `/nihao_audit` y `/nihao_burst_test` o `/nihao_audit`; no se relajó el bloqueo contra hosts/proyectos remotos. El resultado es 746/756 tests aprobados, 8 fallos de replay y 2 skips explícitos de HTTP autenticado/IA real.

Los evals sin proveedor live produjeron merge 7/7, channel 9/10 y whatsapp-batches 8/9 (incluye integración PostgreSQL). Text, transcript, whatsapp-products y whatsapp-agent requieren proveedor Mistral/IA real; se registraron como ERROR deliberado, sin cargar `.env.local` ni llamar a proveedores. La recomendación de opción 2 se mantiene, pero F0.3 (replay) y F0.4 (R2) pasan a ser precondiciones de cualquier gate/promo.

