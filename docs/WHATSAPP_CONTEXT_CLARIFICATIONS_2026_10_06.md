# Contexto operacional y aclaraciones de WhatsApp

## Causa raíz

`PrismaBurstStore.catalog` seleccionaba memberships TRAVELER de viajes ACTIVE/PLANNED y empresas activas autorizadas, pero no comprobaba endDate. Un viaje terminado por fecha y todavía ACTIVE seguía ofrecido. PLANNED ya admitía cargas futuras.

`operationalContext` infería la empresa única pero sólo persistía tripId. Los proveedores ejecutan turnos independientes; faltaba un destino compartido durable. `ask_clarification` y el final del procesamiento concatenaban texto libre y opciones. El resumen era un párrafo compacto.

## Elegibilidad

- Autorización existente: miembro TRAVELER y empresa activa con membership del usuario.
- Status permitido: ACTIVE o PLANNED. COMPLETED/ARCHIVED excluidos.
- Fecha del formulario: día calendario guardado a medianoche UTC y mostrado con UTC. El endDate incluye todo ese día en la zona de negocio.
- Otros timestamps con hora explícita: endDate >= instante actual.
- Zona por defecto: America/Argentina/Cordoba; configurable con WHATSAPP_BUSINESS_TIME_ZONE. No depende de TZ del worker.
- endDate null conserva la política previa: viaje sin fecha definida elegible según status/autorización.
- No se exige startDate <= now: futuros PLANNED conservados.

`trip-eligibility.ts` comparte la política. `PrismaBurstStore.catalog` filtra en SQL por status/fecha y aplica la comprobación final antes de construir opciones. `operationalContext` agrega defensa para catálogos inyectados. La creación valida vigencia dentro de la transacción; recupera primero un receipt idempotente previo, conservando los efectos ya realizados. Las reglas de confirmación, actualización/aprobación y lecturas históricas no se modificaron.

## Contexto de la ráfaga

`burst-context.ts` persiste `operationalContext: {tripId, companyId}` en el JSON existente. No requiere migración.

1. Resuelve una única combinación elegible antes del turno AI.
2. Intenta resolver proveedores existentes mediante el mecanismo fuerte ya existente antes de preguntar. La búsqueda automática respeta la empresa seleccionada.
3. Si quedan cargas nuevas sin contexto, pregunta una sola vez por la ráfaga. No las convierte en NEEDS_REVIEW por faltar la selección.
4. El número o etiqueta elegidos se aplican a todos los proveedores posteriores y sobreviven al checkpoint/restart.
5. Una pregunta redundante de contexto recibe CONTEXT_ALREADY_RESOLVED; un draft que intenta otro destino recibe BURST_CONTEXT_MISMATCH.
6. Como excepción, declaraciones textuales inequívocas `Proveedor — Viaje — Empresa` permiten destinos por load. Se exigen nombres completos exactos, únicos y autorizados; no se usa OCR, proximidad temporal ni fuzzy matching. Si falta un destino de esa ráfaga explícitamente separada, se pregunta por esa load.
7. Preguntas legacy de viaje/empresa identificables con opciones `Viaje — Empresa` se reconocen; una opción vencida no se reinterpreta como otro número. Se publica una lista vigente nueva si hace falta.

## Rendering y reanudación

`clarification-rendering.ts` se reutiliza en ask_clarification, pending questions del servicio, cierre/respuesta y resumen. Contexto y productos son secciones separadas; opciones numeradas, una asociación por línea, ejemplos al final. Receipts separados por párrafos. Las preguntas adicionales libres se conservan.

El contexto resuelto no se vuelve a preguntar. Una respuesta a contexto no elimina pendingProducts. Respuestas numéricas, numerales con asociaciones y quoted replies conservan el routing de WAITING. Asociaciones explícitas `Nombre literal del producto → Proveedor` también reanudan sin quote; imágenes nuevas y texto comercial independiente no se capturan como respuesta a esa pregunta.

## Antes / después

Antes:

> Para poder continuar, necesito definir la asociación de cada carga: ¿a qué opción corresponde FUJIE TECHNOLOGY, IWO y YKO blocks manufactory? Además...

Después, con único contexto:

```text
Necesito confirmar dos asociaciones antes de continuar.

📦 Productos

• Caja de bloques → ¿Pertenece a YKO blocks manufactory?
• PANLOS → ¿A qué proveedor pertenece?

Podés responder una asociación por línea, por ejemplo:

Caja de bloques → YKO blocks manufactory
PANLOS → nombre del proveedor
```

Con dos contextos se agrega una única sección Viaje con ambas combinaciones vigentes, antes de Productos.

## Replay y pruebas

Fixture público conceptual: `fixtures/whatsapp-context/six-evidence-clarification.json`. Reconstruye el problema de contexto sin afirmar que sea una captura/tape de producción: cuatro suppliers (tres nombres del incidente y uno sintético) y dos productos. Clasificación/identidad se simulan; no llama AI ni modifica datos reales.

Resultado: 6 evidencias / 6 cargas, 4 proveedores existentes resueltos, 2 asociaciones pendientes, 0 revisiones/fallos. Selecciona Viaje de Pruebas — Broco Solutions, no muestra Feria Demo ni pregunta por viaje. Reporte local ignorado: `replay-output/six-context-clarification.json`.

`tests/bot/whatsapp-context-clarification.test.mts`: 30 regresiones. Incluye días inclusivos/cambio de día en Argentina, timestamp vencido, active/future/undated/completed/archived, catálogo Prisma real, rechazo de creación con ID vencido, selección única y múltiple, resolución previa de existentes, reanudación del servicio con número, destino diferente explícito, contexto obsoleto, legacy options, productos preservados, formato, replies compuestos/citados, separación de uploads nuevos.

El test nullable de `whatsapp-agent-priorities.test.mts` usa una duda de evidencia en lugar de preguntar un viaje único: mantiene su objetivo original de recuperación del motivo de terminación.

Comandos locales (PostgreSQL exclusivamente de tests):

```sh
EVAL_AGENT_DATABASE_URL=postgresql://franc@127.0.0.1:15436/nihao_agent_test \
WHATSAPP_BURST_TEST_DATABASE_URL=postgresql://franc@127.0.0.1:15436/nihao_burst_test pnpm test
pnpm typecheck
pnpm lint
git diff --check
```

Replay conceptual con reporte:

```sh
EVAL_AGENT_DATABASE_URL=postgresql://franc@127.0.0.1:15436/nihao_agent_test \
CONTEXT_REPLAY_REPORT=replay-output/six-context-clarification.json \
node --import tsx --test tests/bot/whatsapp-context-clarification.test.mts
```

## Archivos

- Nuevos: trip-eligibility.ts, burst-context.ts, clarification-rendering.ts (lib/channels/whatsapp).
- Integración: prisma-burst-store.ts, prisma-agent-domain.ts, agent-policy.ts, agent-orchestrator.ts, agent-service.ts, agent-tools.ts, burst-routing.ts.
- Metadata JSON opcional: burst-types.ts y agent-contract.ts. Tool schemas strict sin cambios.
- Tests, fixture conceptual y este informe.

## Límites

No se probó AI real ni se reejecutó el incidente contra producción. No se cambiaron statuses/fechas históricos. Viajes sin fecha continúan habilitados por compatibilidad. Confirmar otra zona de negocio requiere configurar el environment; la default actual es Argentina. Los nombres contextuales exactos están soportados; declaraciones informales/ambiguas siguen requiriendo aclaración. Texto libre puede necesitar criterio del modelo, aunque las secciones, contadores, opciones y contexto ya resuelto se controlan en backend.

No se tocaron classifier, OCR, reconciliación, grouping, notes, modelo, reasoning, thresholds ni confirmation rules. Sin push ni deploy.

## Validación final

- Nuevos tests: 30 pass, 0 fail, 0 skip.
- Suite completa: 507 pass, 0 fail, 0 skip (incluye replay A–J, estrés 34/50 y cobertura de lifecycle/hardening existente).
- Typecheck: OK.
- Lint: 0 errores, 4 warnings frontend preexistentes.
- git diff --check: OK.
- No regresiones detectadas. No push, deploy ni migraciones.
