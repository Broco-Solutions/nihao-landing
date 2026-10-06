# Hardening operativo WhatsApp — inspección del código 2026-10-06

## Lifecycle antes de esta etapa

Inspección directa de agent-service, multimodal-ingestion, burst-reader, prisma-burst-store,
agent-provider, prisma-agent-domain, durable-routing y rutas process-batches/cron.
No se inspeccionaron secretos ni se consultó producción.

```text
webhook → inbox durable (messageId único) → quiet period 20 s
cron cada minuto → POST process-batches → after (maxDuration = 300 s)
  → persistedVersions → worker v3 → worker v2 → worker legacy
  → claim CAS revision/status + leaseId, lease 330 s; attempts++
  → v3 deadline local = inicio + 220 s
  → cada asset secuencial: download/storage → checkpoint reading JSON
      → visión/classificación → checkpoint
      → OCR → checkpoint
      → extracción OCR → checkpoint
      → segunda visión si corresponde → checkpoint
      → segmentos/candidatos → checkpoint complete=true
  → buildEvidenceGraph → checkpoint state JSON
  → cada logical supplier load: bounded agent loop + checkpoint history/tools
      → domain write + operation WRITTEN en misma transacción
      → media + confirmación + receipt COMPLETED
  → finish state + DONE/WAITING + outbox en transacción
crash → lease vencido → claim nuevo → lecturas existentes + receipts → continuar
```

El índice es implícito: cada mensaje tiene reading JSON con campos presentes y complete.
No hay timeout total por asset; requests usan 15/20/30 s (AI), con límites propios
para download/storage/transcripción. Agent watchdog y rounds no limitan ingestion.
El guard de ingestion reserva 30 s solamente antes del asset; un asset puede hacer
varias llamadas. Checkpoints del reader no controlan el tiempo ni fencing del lease.
OCR y visión son secuenciales por burst, sin limiter central entre workers.
Fetch AI arroja HTTP sin headers, sin Retry-After, backoff ni circuit breaker.
Ingestion captura errores por asset: dos intentos inmediatos; después FAILED retryable
requiere mensaje reintentar. Un fallo de saveReading puede abortar la burst (correcto:
no avanzar si no se pudo persistir). Errores de domain/model por carga abortan worker.
Worker v2 tiene loop de lectura sin aislamiento. Los servicios ejecutados en serie
reinician su deadline: pueden exceder juntos los 300 s de la ruta.

Idempotencia v3 existente: operationId por burst+argumentos+evidence IDs (sin nombres
como mecanismo de deduplicación), advisory lock + mutación + WRITTEN atómicos;
recuperación de WRITTEN completa media; receipts() reconstruye efectos COMPLETED.
finish no publica hasta terminar el worker; un checkpoint no tiene mensaje de éxito.
Cron tiene 60 s y HTTP timeout 55 s pero la respuesta accepted precede al after.

Límites efectivos de las cuentas OpenAI/Mistral no constan en configuración versionada.
No puede deducirse RPM/TPM del nombre del modelo o del plan: deben observarse headers
permitidos y 429. La concurrencia local no garantiza un límite global entre instancias.

## Lifecycle después del hardening

```text
burst durable → claim (CAS + lease)
  → ventana compartida por procesadores: safeDeadline = runtime - shutdownBuffer
  → cola lógica de mensajes pendientes: hasta 2 assets concurrentes
      → antes de cada etapa costosa: quedan ≥30 s?
      → download → original durable → checkpoint DOWNLOADED
      → validar bytes (el original se conserva también si es inválido)
      → clasificación/visión → checkpoint VISION_COMPLETED
      → OCR → checkpoint OCR_COMPLETED
      → candidato OCR → checkpoint ocrCandidate
      → second read → checkpoint SECOND_READ_COMPLETED
      → parse → checkpoint complete=true / PARSED
  → drenar todos los assets iniciados
  → si hay deadline o infraestructura pendiente: release OPEN, dueAt +30 s
      → siguiente claim reconstruye reading JSON y omite etapas ya completas
  → cuando ingestion está resuelta: grouping → checkpoint graph
  → cada supplier load: historial/checkpoints + operación idempotente
      → fallo externo: PENDING_RETRY de esa carga; otras cargas continúan
      → crash tras write: receipts recupera WRITTEN/COMPLETED
  → finish transaccional + outbox, sólo cuando no queda continuación técnica
```

El presupuesto productivo sigue siendo 220 s efectivos: ruta 300 s menos buffer 80 s.
El buffer conserva el margen previamente disponible, ahora explícito, y cubre cierre de
requests (hasta 30 s), streaming/storage (20 s), checkpoints y liberación. Route passes
su maxDuration real; CLI/default usa WHATSAPP_WORKER_RUNTIME_MS. Webhook cuenta también
la espera de quiet period. v3, v2 y legacy reciben el mismo deadline desde el cron/CLI;
legacy verifica tiempo antes de reclamar y entre lecturas, y no consume attempts cuando
sale por deadline. El outbox deja de reclamar replies si no quedan 8 s para envío.
No se usa Promise.race para abandonar mutaciones: R2 recibe abortSignal; sólo la lectura
de un stream tiene race con cancelación. No hay timeout global fijo por asset: existe
presupuesto de ventana y límites por request/stream; las etapas completas sobreviven.

### Checkpoints y fencing

Cada message.reading conserva storageKey, MIME, validated, clasificación, OCR, candidato
OCR, lecturas visuales independientes, segmentos/candidatos, complete y operational.
Estados añadidos son descriptivos; para reutilizar una etapa se verifica su resultado
persistido, nunca sólo su etiqueta. CLASSIFIED sigue siendo compatible. Una lectura
complete sólo se marca al terminar parse. Se conserva el checkpoint del segundo read.

saveReading(message, reading, snapshot) bloquea la fila burst y verifica leaseId y
leaseUntil antes de escribir. Claim/release no puede intercalarse con ese checkpoint.
Los domain writes rechazan también leases vencidos. Fallos de persistencia detienen la
ventana: no se convierten en errores del asset ni permiten avanzar sin checkpoint.
El pool drena tareas iniciadas antes de release; no quedan writes del pool en segundo
plano. Un crash abrupto se recupera al vencer el lease de 330 s; salida controlada libera
lease inmediatamente y deja dueAt +30 s. Cron reclama cada minuto.

El graph de la misma revisión se reutiliza: no se regenera al reanudar una escritura.
Nuevas revisiones conservan cargas procesadas y la metadata operacional de retries.
No se modifican los criterios de agrupación/relación ni sus thresholds.

### Idempotencia y efectos

Se reutiliza operationId existente (burst + argumentos + IDs de evidencia), advisory
locks y la transacción mutación + WRITTEN. No se introduce deduplicación por nombre.
Una interrupción entre dominio y checkpoint del caller reconstruye receipts. Si la
copia de adjuntos falla, la operación queda WRITTEN y la carga PENDING_RETRY; otras
cargas continúan. La recuperación completa media y el receipt sin crear otro recurso.
Las copias conservan clientEvidenceId determinístico existente. Receipts de una carga
activa no reintentan media de todas las otras cargas en cada vuelta del agente.

### Taxonomía y retries

| Categoría | Estado y acción |
| --- | --- |
| 429 | PROVIDER_RATE_LIMIT; backoff con Retry-After |
| 5xx | PROVIDER_UNAVAILABLE; retry automático |
| timeout/abort/ETIMEDOUT | PROVIDER_TIMEOUT; retry automático |
| DNS/reset/socket/red | PROVIDER_NETWORK_ERROR; retry automático |
| circuit abierto | PROVIDER_CIRCUIT_OPEN; pendiente hasta cooldown |
| 401/403 | PROVIDER_CONFIGURATION; retry acotado, luego revisión |
| bytes/formato inválidos, validación determinística | NEEDS_REVIEW; no retry ciego |
| error desconocido | retry acotado; evidencia retenida |
| política agotada por infraestructura | NEEDS_REVIEW, PROVIDER_UNAVAILABLE_AFTER_RETRIES |
| ambigüedad visual | razones de evidencia existentes, sin confundir con infraestructura |

Dos intentos como máximo por request HTTP; las ventanas mantienen hasta cinco fallos
por asset/carga. Backoff = min(30 s, 500 ms × 2^(attempt-1)) × jitter[0.5,1.5), y nunca
menos que Retry-After válido (segundos o fecha HTTP). Si no cabe demora + request de
30 s, se checkpoint/requeue. No hay retry inmediato en el loop de assets. La metadata
nextAttemptAt evita empezar antes del backoff persistido; dueAt del worker puede ser
anterior, en cuyo caso esa ventana vuelve a dejarlo pendiente. Reintentar permite
recuperar fallos agotados retryable y los FAILED retryable previos se recuperan en cola.
Timeouts internos siguen siendo los existentes (15/20/30 s según llamada); el signal
del request limita la ventana total de sus retries. No se cambia modelo ni parámetros.

### Concurrencia, rate limits y circuit breaker

Defaults: assets=2, OCR=2, visión=2, texto=2, transcripción=2. Configurables mediante
WHATSAPP_ASSET_CONCURRENCY y WHATSAPP_{OCR,VISION,TEXT,TRANSCRIPTION}_CONCURRENCY.
El pool de assets impone backpressure; 34 originales no se descargan todos juntos.
Slots centrales compartidos por proceso/provider/lane, incluidos requests de varias
instancias de servicios dentro de ese proceso. OCR y visión tienen lanes separados;
la suma puede llegar a cuatro requests Mistral por proceso con varias bursts activas.
Dos limita memoria, sockets y presión respecto de fan-out libre, permitiendo progreso
paralelo. No se afirma que estos números sean cuotas del proveedor.

Breaker compartido por provider en el proceso: tres fallos consecutivos retryable,
cooldown mínimo 30 s (o Retry-After mayor), y una sola probe cuando vence. Éxito cierra.
OpenAI y Mistral tienen circuitos distintos. Assets no iniciados permanecen pendientes.
Un circuit abierto no consume el presupuesto de fallos del asset: no hubo request real.
Transcripción también usa slots, breaker, backoff y observación de headers.

Fetch registra provider/status/latency y whitelist de Retry-After, x-ratelimit-* y
ratelimit-*; wrappers agregan attempt, lane, retries y razón sanitizada. No registra
Authorization, API keys, payloads, imágenes ni cuerpos de errores de proveedor.
No hay métricas de cuentas actuales versionadas: RPM/TPM/OCR efectivos quedan por
confirmar desde consola del proveedor y headers de requests reales tras una futura
publicación. No se hizo AI live para inferirlos. Las fuentes oficiales respaldan
inspección de headers y backoff, y no permiten inferir la cuota de esta cuenta:
[OpenAI rate limits](https://developers.openai.com/api/docs/guides/rate-limits),
[Mistral usage and limits](https://docs.mistral.ai/admin/billing-usage/usage-limits),
[Mistral errors](https://docs.mistral.ai/resources/error-glossary).

### Resumen y métricas

La respuesta espera que no quede una continuación técnica. Deadline y PENDING_RETRY
no ejecutan finish ni crean una respuesta de éxito: internamente OPEN + checkpoints,
con log PROCESSING_CONTINUES. Al terminar, el resumen conserva conteos de procesadas,
pendientes de aclaración, revisión y fallidas, y batchStatus distingue COMPLETED,
PARTIAL, NEEDS_REVIEW y FAILED. WAITING representa decisiones/revisión del usuario.
Las reglas de confirmación existentes siguen determinando estados comerciales.

Logs JSON: batch_assets_total/completed/pending/failed/needs_review;
worker_runs_per_batch (sumar eventos por burst), worker_deadline_exits,
worker_crash_recoveries (claim con lease expirado); provider_calls_openai/mistral,
provider_429/5xx/timeout/network_error, provider_retry_count;
ocr_concurrency_peak/vision_concurrency_peak; batch_duration_total desde createdAt;
asset_duration_p50/p95 calculados a partir de duración acumulada en reading.operational.
Las duraciones de asset miden lectura/ingestion, sin espera humana ni tiempo en cola.
Los logs son investigables mediante batchId/assetId/provider/lane, sin dashboard nuevo.

### Tests y replay

whatsapp-operational.test.mts usa BurstReader, service, orchestrator y operationId reales
con transportes/domain determinísticos y snapshots clonados al reiniciar. Cubre:
34 y 50 imágenes con reloj/deadline forzado, múltiples ventanas, cero pérdidas, una
visión/OCR/download por asset completado; crashes después de download, OCR, visión,
grouping y write; errores terminales en 7 y en 3/11/29; timeout con backoff; 429 con
Retry-After; 503 abre circuito, provider vuelve y probe cierra; slots máximos con
34 solicitudes; DNS persiste retryable y agotamiento conserva 34 originales; ninguna
respuesta de finalización durante ventanas incompletas. También utiliza ReplayTape.

Tests PostgreSQL reales comprueban crash después del efecto proveedor/producto antes
del checkpoint del caller: no receipt en state previo, recuperar operación y obtener
un solo recurso/operation; worker stale no puede sobrescribir reading. Los tests
previos de media comprueban WRITTEN → COMPLETED sin duplicar producto ni adjunto.
El test parcial de media ahora comprueba dos ventanas y progreso de la otra tarjeta.
Los tests de validación permanente expresan explícitamente ValidationError en lugar
de simular una indisponibilidad de infraestructura como error terminal.

Fixture L-operational-34.json: 34 assets sintéticos, checkpoint tras cada siete nuevos
assets, un OCR 503, retry, más de cinco ventanas, 34 supplier loads. Replay real contra
PostgreSQL local y replay offline del tape pasan: 34 visiones, 35 llamadas OCR (una
fallida), 34 efectos finales. El runner serializa transportes de fixture para conservar
orden determinístico de tapes previos; los tests del pool productivo validan concurrencia.
El reporte expone workerRuns/workerRetries/checkpoints. Fixture no usa datos del cliente.

### Archivos de esta etapa

Nuevos: operational-runtime.ts, provider-resilience.ts, whatsapp-operational.test.mts,
este documento y fixtures/whatsapp-replay/public/L-operational-34.json.

Cambios operativos: .env.example; app/api/channels/whatsapp/process-batches/route.ts;
lib/channels/whatsapp/{agent-service,agent-provider,agent-orchestrator,burst-reader,
burst-service,burst-types,burst-webhook,durable-routing,batch-service,prisma-burst-store,
prisma-agent-domain,ingestion-types,multimodal-ingestion,evidence-grouping}.ts;
lib/bot/{transcription,extraction/mistral-extraction-provider,storage/r2-s3-provider}.ts;
scripts/run-whatsapp-batches.mts; evals/whatsapp-replay/{fixture,runner,report}.ts;
tests/bot/{whatsapp-multimodal,whatsapp-replay}.test.mts.
Los cambios locales previos y sus documentos/fixtures permanecieron preservados.

### Riesgos y alcance pendiente

- Limiters y circuitos son locales al proceso. Varias instancias suman concurrencia;
  para un límite global estricto se necesita coordinar slots usando DB/infra existente.
  La cuota efectiva de las cuentas no fue accesible en la configuración versionada.
- Un crash de plataforma durante request puede repetir esa request no checkpointed;
  los efectos de negocio siguen protegidos por operaciones idempotentes.
- Un crash en download antes del checkpoint puede repetir descarga/put de la misma
  key determinística. No se crean nuevas keys ni efectos comerciales por eso.
- Leases vencidos tardan hasta 330 s + próximo cron en recuperarse; normal yield es
  más rápido. DB inaccesible impide liberar/checkpoint; se conserva inbox y se espera lease.
- Se espera ingestion resuelta antes de grouping para evitar asociar resultados parciales.
  Una caída externa puede demorar escrituras válidas mientras se agotan retries; las
  lecturas válidas permanecen checkpointed. Cargas proveedor ya agrupadas sí se aíslan.
- v2 conserva su política histórica de hasta cinco retries de worker y WAITING con
  evidencia guardada. Ahora drena lecturas independientes, pero un asset fallido puede
  posponer su interpretación global. Legacy v1 conserva su semántica histórica; recibe
  deadline compartido y checkpoint OCR existente. P0 per-asset completo corresponde a v3.
- Outbox conserva semántica existente: un crash después de enviar WhatsApp y antes de
  marcar SENT puede repetir el mensaje; la garantía de efectos únicos cubre el dominio.
- Se agregaron campos JSON y variables locales; no hay migraciones nuevas ni cambios
  de configuración de producción. No se probó throughput AI live ni caída real de proveedor.

## Validación final de esta etapa

- Suite completa con PostgreSQL aislado: **398 aprobados, 0 fallidos, 0 omitidos**;
  incluye 25 casos adicionales frente a los 373 documentados de la etapa previa.
- `pnpm typecheck`: aprobado.
- `pnpm lint`: 0 errores; 4 warnings preexistentes en frontend, sin editar frontend.
- `git diff --check`: limpio.
- PostgreSQL sólo local en 127.0.0.1:15436; bases nihao_agent_test y nihao_burst_test,
  preparadas con migraciones existentes. Sin DB de proyecto/producción ni requests AI reales.
- Logs de ejecución: /tmp/nihao-hardening-all-db.log, /tmp/nihao-hardening-types.log,
  /tmp/nihao-hardening-lint.log. Son locales y no se incorporan al repositorio.

```sh
EVAL_AGENT_DATABASE_URL=postgresql://franc@127.0.0.1:15436/nihao_agent_test \
WHATSAPP_BURST_TEST_DATABASE_URL=postgresql://franc@127.0.0.1:15436/nihao_burst_test \
pnpm test
pnpm typecheck
pnpm lint
git diff --check
```

No push. No deploy. No cambios de modelo, reasoning, prompts, clasificación,
reconciliación semántica, thresholds, audio association, confirmation rules,
prepare_evidence_batch ni frontend durante esta etapa. El diff respecto de HEAD
incluye cambios locales previos de la etapa multimodal/replay, preservados.

## Publicación autorizada posteriormente

Después de cerrar la validación local, el usuario pidió subir los cambios a producción.
Se publica el hardening sobre el último main remoto (etapa multimodal/replay ya publicada),
preservando el historial local previo. Build Next/Webpack y Prisma validate aprobados.
Railway nihao-bot/production usa main; no se modifican modelo, reasoning ni credenciales.
