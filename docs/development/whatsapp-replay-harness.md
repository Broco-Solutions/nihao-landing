# Nihao: Replay Harness reproducible

Estado: implementación local, 6 de octubre de 2026. Sin push, deploy, nuevos modelos ni cambios de reglas de negocio. Etapas 1 y 2 permanecen. GPT-5.6 Luna, Responses API, reasoning medium, sin temperature.

## Arquitectura

El fixture reemplaza la entrada WhatsApp y provee catálogo autorizado/objetos locales. Ejecuta **WhatsAppAgentService → BurstReader → MistralBatchAnalyzer/MistralExtractionProvider → ingestBurst/buildEvidenceGraph → WhatsAppAgentOrchestrator/AgentTools → PrismaAgentDomain**, con los mismos parsers, validaciones, agrupación, herramientas, transacciones, idempotencia y confirmación de producción.

Reutiliza createAgentEnvironment/localAgentDatabase del entorno existente: únicamente localhost/127.0.0.1 y base nihao_agent_test. Si falta esa URL o apunta a otra base, rechaza la ejecución. Crea contexto de prueba y luego elimina sus filas; storage y outbox son locales/en memoria. Nunca invoca Evolution ni envía WhatsApp. No requiere migraciones nuevas. El harness puede continuar hasta diez invocaciones del worker cuando hay checkpoints; conserva límites productivos por invocación y no reintenta ciegamente un error general.

No duplica decisiones del dominio. En deterministic sólo se sustituyen respuestas externas: los parsers de OCR, segmentación, extracción estructurada y visión siguen siendo los reales. La transcripción utiliza el contrato TranscriptionProvider existente. La secuencia de herramientas de un fixture sintético es una simulación explícita de respuestas del modelo, no un algoritmo alternativo de negocio.

La instrumentación de producción agrega groupingAttempts y associationAttempts al grafo existente; registra señales que el código ya usa y candidatos evaluados, sin modificar selección ni thresholds. agent-provider.ts conserva opcionalmente usage de Responses para medir tokens. No expone chain-of-thought ni razonamiento cifrado en reportes.

## Instalación y base aislada

Desde la raíz nihao-landing, con dependencias/client Prisma generados y PostgreSQL local:

```sh
createdb -h 127.0.0.1 -p 5432 nihao_agent_test
DATABASE_URL=postgresql://localhost:5432/nihao_agent_test npm run prisma:migrate:deploy
export EVAL_AGENT_DATABASE_URL=postgresql://localhost:5432/nihao_agent_test
```

Ese comando de migración es **exclusivamente para la base local indicada**, nunca producción. En esta validación ya existía la base aislada, con migraciones aplicadas, en 127.0.0.1:15434. Se reutilizó y se detuvo el PostgreSQL iniciado para la tarea al finalizar.

## Formato del fixture v1

JSON más assets dentro del mismo directorio. Ver [caso completo G](../../fixtures/whatsapp-replay/public/G-product-audio.json) y [tipos](../../evals/whatsapp-replay/fixture.ts).

```json
{
  "version": 1,
  "id": "incident-001",
  "description": "Vaso con audio comercial y proveedor explícito",
  "catalog": {
    "trips": [{
      "id": "trip", "name": "Replay China",
      "companies": [{ "id": "company", "name": "Demo" }],
      "suppliers": [{ "id": "base", "captureId": "base-capture", "companyId": "company", "name": "Proveedor Demo", "city": null }]
    }]
  },
  "messages": [
    { "id": "photo", "type": "IMAGE", "asset": "assets/vaso.png", "mimeType": "image/png", "timestamp": "2026-10-06T12:00:00Z" },
    { "id": "audio", "type": "AUDIO", "asset": "assets/nota.wav", "mimeType": "audio/wav", "timestamp": "2026-10-06T12:00:01Z", "quotedMessageId": "photo" },
    { "id": "context", "type": "TEXT", "text": "Para Proveedor Demo", "timestamp": "2026-10-06T12:00:02Z" }
  ],
  "expected": [
    { "category": "association", "path": "associations.audio.selected", "equals": ["photo"] },
    { "category": "write", "path": "write.productsCreated", "equals": 1 }
  ]
}
```

Tipos: TEXT/IMAGE/AUDIO/DOCUMENT. Se conserva orden del array como secuencia de recepción y timestamps originales para el orden productivo. IDs de fixture son aliases estables, distintos de IDs técnicos de la base. Opcionales: whatsappMessageId original; quotedMessageId (alias interno o ID externo); selectionId; context con metadata original para auditoría; priorOCR y priorTranscript. OCR/transcripción previos evitan esas llamadas como ocurre con checkpoints; no reemplazan clasificación visual ni grouping. Un reply externo se conserva, pero no se inventa un asset/contexto inexistente para resolverlo.

Assets y symlinks deben permanecer dentro del directorio del fixture. TEXT no necesita archivo; los otros tipos requieren asset/mimeType. Catalog permite viajes/empresas y proveedores iniciales; productos o propuestas preexistentes y conversaciones anteriores no se importan todavía.

Expectations son opcionales y parciales. path usa puntos y admite índices de arrays. Ejemplos:

- assets.card_front.visionExtraction.companyName = "Alfa Tools"
- assets.card_back.visionExtraction.emails = ["ventas@alfatools.test"]
- assets.photo.visionExtraction.description / brand / model
- assets.card_bad.status = "NEEDS_REVIEW"
- loads.0.assets = ["card_front", "card_back"]
- associations.audio.selected = ["card_front"] o []
- write.suppliersCreated, write.productsCreated, write.clarificationRequested
- write.receipts.0.resourceStatus = "CONFIRMED"
- counts.logical_loads_total, counts.supplier_loads, counts.front_back_grouped

Con varios productos por audio, selected puede contener varios aliases y attempts permite verificar segmentos por separado. Las categorías extraction/association/write son independientes: se calcula accuracy sólo sobre assertions declaradas de esa categoría; sin assertions se devuelve null, nunca un 100% ficticio.

## Deterministic por defecto

```sh
npm run replay -- fixtures/whatsapp-replay/public/C-explicit-alfa.json
npm run replay -- fixtures/whatsapp-replay/public/G-product-audio.json --verbose
```

Los casos públicos tienen mock.vision, mock.ocr, mock.transcript y opcional mock.extraction por mensaje. mock.extraction describe datos sintéticos para construir una respuesta estructurada del modelo; el extractor productivo valida esa respuesta. agentMock declara llamadas del modelo con argumentos y referencias: @trip, @company, @seedSupplier, @evidenceIds, @activeSources y @message:alias. Estas referencias se resuelven sólo en el adaptador de respuestas sintéticas. Las tools siguen validando el contrato strict real.

Un caso real sin esos mocks requiere --tape. Si falta una respuesta, se agota la secuencia o difiere una llamada del tape, falla explícitamente. No hay fallback a una API. Tests normales no ejecutan live; una prueba bloquea fetch durante replay completo y reproducción del tape.

```sh
npm run replay -- fixtures/whatsapp-replay/public/G-product-audio.json \
  --record replay-output/G-tape.json --report replay-output/G-report.json
npm run replay -- fixtures/whatsapp-replay/public/G-product-audio.json \
  --tape replay-output/G-tape.json --report replay-output/G-offline.json
```

Los archivos de salida no se sobrescriben: usar un nombre nuevo o retirar explícitamente el propio archivo anterior. Exit code 0 si pasan las assertions y no hay errores de reproducibilidad/worker; 1 si falla. Un asset en revisión puede formar parte de un replay exitoso si ése era el resultado esperado.

## Live AI y grabación

Requiere **ambas** autorizaciones técnicas: --live y LIVE_AI=true. Sin ellas no inicializa clientes reales. No carga automáticamente .env.local, y rechaza override de modelo distinto de Luna.

Guardar claves y EVAL_AGENT_DATABASE_URL local en un .env.replay.local ignorado, o exportarlas en shell. No poner claves en fixtures/comandos públicos:

```sh
LIVE_AI=true node --env-file=.env.replay.local --import tsx scripts/replay-whatsapp.mts \
  fixtures/whatsapp-replay/local/incident-001/fixture.json --live \
  --record replay-output/incident-001-tape.json \
  --report replay-output/incident-001-live.json

npm run replay -- fixtures/whatsapp-replay/local/incident-001/fixture.json \
  --tape replay-output/incident-001-tape.json \
  --report replay-output/incident-001-offline.json
```

Se reutilizan los clientes reales actuales: Mistral para imágenes/OCR y Voxtral para transcripción; OpenAI Responses para texto/segmentación/extracción y agente. La grabación conserva respuestas por llamada, errores sanitizados y duración; sólo guarda hash del request, no headers ni credenciales. Responses se guarda en el contrato adaptado existente, incluidos items opacos necesarios para replay de historial; esos items no aparecen en reportes.

El tape tiene versión/configHash. Cada request se canonicaliza y compara por SHA-256, en orden estricto. IDs aleatorios del entorno local, IDs técnicos y versiones de registros se normalizan con un mapa reversible. Cambiar prompt/schema/modelo requiere nueva grabación. Un cambio backend se identifica por pipelineHash/Git SHA; si modifica requests/orden, el tape lo denuncia. No se sirve una respuesta grabada para un request diferente. Si se anonimiza un asset o cambia el texto, hay que grabar/curar nuevamente: sus huellas cambian.

## Lectura de reportes

Siempre se guarda JSON privado en replay-output; consola usa un resumen por asset/carga/audio/grouping. --verbose añade OCR, transcripción, extracción, facts/context y resultado. JSON conserva todos esos campos, intentos y checkpoints, sin historial de razonamiento.

Ejemplo del caso G:

```text
PASS G-product-audio (deterministic, ~200 ms)
assets=3 loads=2 writes=1/1 review=0 failed=0 termination=completed
vaso: PRODUCT UNKNOWN_SIDE readable → IMAGE_OF:vaso/HIGH PROCESSED
audio_vaso: AUDIO → FACTS_FOR:vaso/MEDIUM PROCESSED
AUDIO audio_vaso: selected=vaso; ambiguous=false; reason=VISUAL_PRODUCT_REFERENCE
```

La segunda carga EVIDENCE corresponde al contexto explícito de proveedor. El producto queda confirmado por imagen PRODUCT asociada y persistida, no por el texto del modelo.

Ejemplo de error diagnosticable:

```text
FAIL association: associations.audio_alfa.selected
  Expected: ["card_beta"]
  Actual: ["card_alfa"]
AUDIO audio_alfa: selected=card_alfa; reason=EXPLICIT_SUPPLIER_NAME
candidates=card_alfa(explicit=true,visual=false,distance=2) / card_beta(explicit=false,visual=false,distance=1)
```

Por asset: original/message IDs, metadata/timestamp, tipo, clase/lado, legibilidad, OCR/transcripción, extracción y lecturas independientes, intentos/retries, parse status, cargas/relaciones/confianza y error. Por carga: assets, razones, estado, facts/context, resourceId, recibos y confirmación. Por audio: todos los targets elegibles de cada segmento, nombre, referencia explícita, coincidencia visual, distancia de secuencia, destino/razón/confianza y necesidad de aclaración. Distancia es un dato de auditoría, no una puntuación ni prioridad de asociación. Grouping registra pares evaluados frente/reverso, identidad de empresa/dominio/persona/teléfono/email/branding, complementariedad y distancia, con GROUP/DO_NOT_GROUP/AMBIGUOUS.

El JSON incluye fixture ID, timestamp, Git SHA y dirtyWorktree, modelo/reasoning, hashes de prompt/tools/pipeline/configuración, modo, checkpoints, assertions/diffs, contadores y respuesta construida por servidor.

## Métricas

Todos los contadores del pedido están en counts:

- assets_total/classified/parsed/needs_review/failed; business_cards/products/documents/other.
- logical_loads_total/supplier_loads/product_loads.
- front_back_candidates/grouped/ambiguous (pares evaluados, no cantidad de proveedores).
- audio_total/explicit_associations/semantic_associations/ambiguous (audios; attempts conserva segmentos).
- second_read_attempts/resolved/still_ambiguous.
- writes_attempted/successful/failed; automatic_confirmations/automatic_confirmations_blocked.
- rounds_used y termination_reason; ejecución por carga también disponible.

classified cuenta clases visuales; parsed cuenta lectura completa, incluyendo una lectura estructurada ambigua; documentos nativos sin parser se indican NOT_PARSED. writes_attempted cuenta llamadas a tools de mutación; successful cuenta operaciones COMPLETED distintas; failed cuenta rechazos explícitos. Confirmaciones automáticas cuentan recibos con razón de completitud; blocked incluye resultados draft y rechazos de imagen/asset/asociación. No se infiere éxito de prosa del LLM.

ai mide duración total local (incluye preparación y cleanup), llamadas visión/OCR/Luna/transcripción, second reads, duración por llamada y usage/tokens disponibles. En live se cuentan requests físicos, incluyendo retries internos; Luna incluye agente, extracción y segmentación. En deterministic sin métricas grabadas son llamadas simuladas, no costo facturado. recordedProviderUsage conserva métricas del live original para consultar luego. No se estima precio monetario ni tokens ausentes; tokenTotals es null cuando no están disponibles.

## Golden fixtures reales: pasos

1. Crear fixtures/whatsapp-replay/local/incident-ID/assets y copiar todos los originales de la ráfaga, manteniendo orden, timestamps y replies.
2. Revisar contenido; anonimizar nombres/contactos/textos, voces o imágenes cuando corresponda **antes** de la grabación. No cambiar una sola evidencia si rompe referencias entre audio/tarjeta/frente/reverso.
3. Crear fixture.json, catálogo de contexto y suppliers existentes necesarios; conservar OCR/transcripción previos sólo si se quiere reproducir un checkpoint que ya los tenía.
4. Ejecutar live con los dos flags y --record/--report en replay-output. Revisar reportes antes de compartirlos.
5. Agregar expectations verificadas por una persona en extraction/association/write, sin convertir salida de IA en verdad esperada automáticamente.
6. Ejecutar deterministic con --tape, sin claves IA. Ante mismatch, revisar configuración, bytes, contexto y request ordinal antes de volver a grabar.
7. Si se propone incorporar el caso a public, revisar/anonimizar también JSON, respuestas, OCR, transcripciones, screenshots y metadata. No mover originales reales a public por defecto.

.gitignore excluye fixtures/whatsapp-replay/local, replay-output y .env*. El writer rechaza destinos fuera de replay-output, symlinks hacia fuera, sobreescrituras y usa permisos 0700/0600. Redacta patrones de tokens/Bearer y claves IA presentes en entorno. Los contactos comerciales se conservan en archivos privados porque son necesarios para evaluar lectura/asociación; no se promete anonimización visual automática ni borrado seguro del almacenamiento físico de PostgreSQL.

## Casos y validación

Casos permanentes A–J: 20 tarjetas con 1/3 revisiones sin rollback; Alfa explícita aunque Beta sea última; audio ambiguo; frente/reverso; tarjetas consecutivas distintas; producto/audio; audio del producto A aunque B sea más reciente; second read resuelto; second read ambiguo sin escritura. K agrega documento nativo y reply, sin PDF extraction.

Se corrigió un fixture de producto que omitía contexto literal del proveedor: la validación productiva AMBIGUOUS_TARGET lo rechazó. Se agregó el contexto al fixture, sin relajar el backend. No se modificaron reglas funcionales para hacer pasar los casos.

Tests adicionales: opt-in live, request/config mismatch y sobrantes de tape, errores sanitizados y semántica de validación, rutas/IDs inválidos, archivos ignorados/redacción, captura/replay completo offline sin fetch, diff de asociación independiente de accuracy de escritura. No se ejecutó live AI ni se usaron originales del cliente durante esta implementación.

```sh
EVAL_AGENT_DATABASE_URL=postgresql://franc@127.0.0.1:15434/nihao_agent_test \
WHATSAPP_BURST_TEST_DATABASE_URL=postgresql://franc@127.0.0.1:15434/nihao_burst_test \
node --import tsx --test tests/bot/*.test.mts
npm run typecheck
npm run lint
git diff --check
```

**Resultado final: 373 tests aprobados, 0 fallidos, 0 omitidos; 24 tests nuevos sobre los 349 de etapas 1–2.** Suite completa: aproximadamente 5.2 segundos. Typecheck aprobado; lint sin errores y cuatro warnings preexistentes de frontend; git diff --check limpio. CLI deterministic con grabación y posterior lectura de tape también aprobado. El replay PostgreSQL de A–K tarda aproximadamente 2–3 segundos para todos los casos en esta máquina; un G individual midió 212 ms y su replay con tape 171 ms incluyendo preparación/cleanup (el arranque de Node/npm agrega tiempo). No son números extrapolables a live ni métricas de accuracy real del cliente.

## Archivos de esta etapa

Nuevos: evals/whatsapp-replay/fixture.ts, tape.ts, runner.ts, report.ts; scripts/replay-whatsapp.mts y generate-replay-fixtures.mts; tests/bot/whatsapp-replay.test.mts; este documento; fixtures/whatsapp-replay/public/*.json, assets/* y README.md.

Modificados: .gitignore; package.json (script replay); lib/channels/whatsapp/ingestion-types.ts y evidence-grouping.ts (tracing estructurado); lib/channels/whatsapp/agent-provider.ts (usage); docs/development/current-state.md (estado). Las modificaciones locales de etapa 2 preexistentes se conservaron; no son cambios nuevos del harness.

## Troubleshooting y límites

- EVAL_AGENT_DATABASE_URL requerida: iniciar PostgreSQL local y preparar sólo nihao_agent_test. No usar DATABASE_URL de producción como fallback.
- Live AI requiere LIVE_AI=true: también debe pasar --live. No basta tener claves o un fixture sin mocks.
- Tape inválido/config mismatch: grabar con la configuración correcta. No borrar hashes para forzar el replay.
- AI call N mismatch: revisar ese ordinal y checkpoints; puede indicar cambio de texto/assets, orden, prompt/tools o input de cargas.
- Worker resume_limit: queda reporte parcial; revisar tiempos/estado. No se incrementan límites de dominio para ocultarlo.
- Los rechazos de AMBIGUOUS_TARGET exigen contexto literal de proveedor, como en producción; que exista un seed supplier no autoriza asignarlo por defecto.
- Fixture generator opcional usa say/afconvert de macOS para voces sintéticas y PNG de código; los assets ya incluidos se reproducen en cualquier plataforma sin esas utilidades.
- No importa todavía historias de múltiples conversaciones, productos/propuestas iniciales ni menú/pending state externo; quoted metadata externo se conserva pero requiere que el contexto necesario esté representado. No reproduce redelivery/timing de WhatsApp ni red/colas de producción.
- Wall clock, timestamps/IDs locales y latencia real cambian entre ejecuciones. Se normalizan IDs para requests; la reproducibilidad garantiza respuestas/argumentos y resultados/assertions observables, no byte-identidad de reportes con timestamp. Un timeout HTTP grabado no recrea la espera real.
- Cambios backend que alteren inputs del modelo pueden requerir otra grabación o mocks curados: un tape estricto no permite reutilizar respuestas fuera de su contexto original.
- Fixtures públicos son sintéticos y no calibran thresholds. Los assets reales y los replays live quedan como siguiente validación autorizada por el operador.

## Preparación de aceptación con originales

Se pueden construir batches locales a partir de originales disponibles cuando no existe una ráfaga exportada. Declarar explícitamente esa procedencia y los timestamps/orden artificiales en context; no presentar ese dataset como una exportación original de WhatsApp. Copiar los archivos sin cambios y verificar SHA-256, guardar ground truth independiente antes del live, separar originales únicos de exposiciones repetidas y dejar campos no confirmados sin puntuar.

Un replay live que falla por conectividad no mide precisión. Verificar si hubo respuestas reales; requests intentados no equivalen a llamadas exitosas ni a tokens facturados. Si el tape sólo contiene errores de transporte, el replay offline puede reproducir sus consecuencias, pero no una lectura visual inexistente. Conservar la captura y usar otro directorio de salida al reintentar. Un TypeError de fetch puede requerir un diagnóstico local adicional de DNS/TLS: el tape conserva la categoría sanitizada, no la causa detallada de red.

Los receipts acreditan operaciones y status. No alcanzan por sí solos para certificar exactitud campo por campo de todo lo persistido; contrastar también los datos de dominio antes de declarar incorrect_write_rate = 0. Métricas sin cobertura real se reportan N/A, incluyendo asociaciones cuando no se probaron audios/productos.
