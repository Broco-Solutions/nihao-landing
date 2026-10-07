# Correcciones de unidades de ingestión de WhatsApp — 2026-10-06

## Estado y alcance

Implementación local de lifecycle, grouping seguro, resolución de proveedores existentes, scope de cierre y resolución histórica. Sin push, deploy, migraciones ni reparaciones de datos en producción.

No se modificaron modelo, reasoning, thresholds de reconciliación, OCR, canonicalización, arquitectura de notes, confirmación, concurrencia/retries, audio association ni el prompt general del agente.

**La clasificación visual final todavía necesita validación con AI real.** Las primeras variantes del prompt siguieron confundiendo YKO/Panlos con packaging y algunas respuestas usaron un boolean en `branding`. El prompt final distingue soporte físico y contenido impreso, y ahora usa JSON Schema cerrado con tipos explícitos. Su nueva comprobación live no pudo acceder al proveedor: DNS devolvió `ENOTFOUND`. Los tests de contrato y los replays con mocks no demuestran la precisión del modelo. Por tanto, no se declara cumplido todavía el criterio de clasificación de los originales.

## Causas y cambios

| Capa | Causa anterior | Corrección |
|---|---|---|
| CARD_READING / clasificación | Tipo determinado junto con contenido comercial, confusión entre tinta y volumen físico; contrato pedido sólo en texto | Instrucción enfocada en silueta, espesor y caras físicas. JSON Schema cerrado. Una tarjeta publicitaria, con ilustración o sólo marca sigue siendo BUSINESS_CARD. PRODUCT requiere objeto/envase realmente volumétrico; DOCUMENT requiere hoja, factura, catálogo o equivalente. |
| GROUPING | Sólo BUSINESS_CARD participaba; nombres comerciales/legales distintos excluían candidatos | El dominio compartido y caras complementarias conservan el grouping seguro existente. Nombre comercial/razón social distintos con persona y branding compartidos generan POSSIBLY_RELATED auditable; nunca autorización automática de merge. |
| BURST_LIFECYCLE | `status != DONE` absorbía todo mensaje nuevo; índice único impedía conservar dos workflows | WAITING representa workflow suspendido. Uploads independientes crean otra burst. Migración permite WAITING y OPEN múltiples; mantiene un worker PROCESSING/COMMITTING por teléfono/instancia. Claim serializado con advisory lock. |
| SUMMARY_COUNTING | Contadores de todo el graph acumulado | Cada burst nueva tiene su propio graph/contadores; los receipts y llamadas usados al cerrar se limitan a revisión/carga actual. |
| SUPPLIER_DEDUP | Encontrar un supplier no resolvía la carga; búsqueda sólo textual de nombre | Identidad exacta y autorizada puede producir receipt real RESOLVED_EXISTING_RESOURCE, asignar resourceId y marcar PROCESSED, sin crear ni actualizar proveedor. Search acepta email/domain/phone exactos. |
| HISTORICAL_BACKLOG | No existía resolución independiente de la lectura original | Metadata RESOLVED_BY_LATER_EVIDENCE conserva status/error original y referencias a asset/load/burst/recurso posteriores. Ya no cuenta como revisión pendiente. |
| COMPLETENESS | Cara sólo con marca entraba como producto o se confundía con lectura dudosa | BUSINESS_CARD legible sin identificación/contacto queda SUPPLIER_INCOMPLETE / READABLE_BUT_INCOMPLETE, sin inventar datos ni confirmar. Las tarjetas con nombre conservan el flujo de borrador existente. |

## WAITING y respuestas explícitas

Una pregunta anterior se conserva en su burst. El estado guarda el ID de la respuesta outbound entregada por Evolution. Una respuesta citada a ese ID, selección firmada vigente, opción numérica válida, etiqueta exacta o referencia explícita a la pregunta permite retomar el workflow correspondiente. Confirmación/cancelación conserva las reglas de aprobación existentes. Un upload sin referencia no retoma automáticamente WAITING.

Cuando varias preguntas pueden aceptar la misma selección, no se elige arbitrariamente una WAITING. Una respuesta citada/signed selection identifica el workflow. El contexto autorizado de viaje se obtiene por el flujo actual; con un único viaje autorizado se utiliza el mismo contexto inequívoco antes de buscar el proveedor existente.

No se fusionan graphs ni contadores entre bursts. La conversación y los workflows anteriores siguen disponibles; no se implementó un indicador frontend nuevo.

## Identidad y receipts

`SupplierIdentity` reúne companyName grounded en OCR y contactos visuales no inciertos. Se usa canonicalización existente; para identidad, `www` y el host sin `www` coinciden. No hay fuzzy matching ni deduplicación por nombre solamente.

Se exige más de una clase de contacto exacto, o nombre canónico compatible y email exacto. Los conflictos de nombre grounded o contactos impiden resolución; varios proveedores coincidentes impiden escoger automáticamente. Se conservan autorización y scope por viaje/empresa. Email y su dominio no se cuentan como dos clases independientes: el dominio requiere website visible.

El evento estable por burst/load/supplier se persiste en WhatsAppAgentOperation. Es un evento de resolución, no una mutación ficticia. Se recupera tras crash antes de checkpoint final. `get_supplier` también puede vincular la carga activa si coincide inequívocamente. Los replays distinguen operaciones de escritura de resoluciones existentes.

`finish_turn` y el contexto mostrado al modelo filtran receipts por carga activa o revisión actual. Las llamadas nuevas guardan revisión y carga. Una propuesta pendiente explícitamente relacionada sigue disponible, y refrescar su receipt preserva la atribución checkpointed. Los receipts históricos siguen auditables.

## Resolución histórica

Sólo se resuelven cargas NEEDS_REVIEW / AMBIGUOUS_CARD_READING con identidad fuerte compatible para **cada asset**. La consulta se limita a WAITING sin lease del mismo usuario/teléfono/instancia y viaje autorizado. No se cambian OCR, visión, error ni status original.

Metadata: status de resolución, originalStatus, originalError, resolvedByAssetId, resolvedByLoadId, resolvedByBurstId, resourceId, timestamp, reason y señales de identidad. Los contadores accionables excluyen cargas resueltas. Se refresca sólo la pregunta de revisión generada por el pipeline; las preguntas de negocio y propuestas de aprobación se conservan.

La resolución histórica se ejecuta fuera del catch por asset: un fallo en mantenimiento histórico checkpoint/retry no convierte una escritura de dominio exitosa en un asset fallido.

## Replays de ocho tarjetas

Fixture público `P-eight-independent-cards.json`: imágenes sintéticas sin datos de clientes, visión/extracción mock, PostgreSQL local y replay offline exacto del tape. Comprueba integración, no precisión de clasificación del proveedor.

El fixture privado usa los ocho originales locales y OCR de producción. Para YKO reverso, Leoch frente/reverso y Panlos utiliza **etiquetas humanas de clasificación/lectura esperada**. No son respuestas nuevas del modelo. Los originals, OCR, IDs reales, tapes y reportes están en directorios ignorados por Git.

| Tarjeta | Resultado de integración esperado y obtenido |
|---|---|
| YKO frente | NEEDS_REVIEW; se conserva incertidumbre real de teléfonos/QQ |
| YKO reverso | SUPPLIER; candidato POSSIBLY_RELATED con frente, sin merge por alias inseguro |
| Dragino | PROCESSED; receipt de proveedor existente |
| Leoch frente/reverso | Un supplier load de dos assets por dominio y caras complementarias; creación/confirmación usando reglas existentes |
| Fujie | PROCESSED; receipt de proveedor existente |
| iWo | PROCESSED; mismo proveedor existente, resourceId, sin create_supplier_draft ni no_progress |
| Panlos | Legible, SUPPLIER_INCOMPLETE, sin contacto inventado ni confirmación |

Resumen en ambos replays de integración: **8 evidencias, 7 cargas; 4 procesadas, 0 pendientes, 3 para revisar, 0 fallidas**. Son contadores de cargas, no de assets. La load Leoch contiene dos assets. No se mezclan las 36 anteriores. La nota literal `lawn mower batteries` se verificó en el recurso persistido usando FACTS asociados; no se cambió notes. Con AI real, su conservación depende de que la lectura capture esa anotación.

Comprobación adicional con checkpoints reales históricos de Dragino/Fujie: dos assets resueltos por identidad fuerte; OCR/status originales conservados. No se escribió en producción.

## Tests y validación

Tests nuevos en `whatsapp-burst-boundaries.test.mts`: seis contratos de clasificación, schema visual, grouping por domain, tarjetas diferentes, candidato de alias, incompletitud, routing explícito, conservación de workflows, búsqueda exacta/scoped, resolución/idempotencia, crash después del evento, no llamada de creación ni watchdog, scope de receipts, resolución histórica/no supersede dudoso, callback de delivery, refresco de pregunta y preservación de atribución de propuestas.

Replay P: ocho assets, grouping seguro, tres resoluciones existentes y una creación, notes persistida y replay offline exacto. Se mantienen A–J, replays de notes y estrés 34/50 con ventanas cortas. El fixture operacional ahora contiene email válido; un mock sin contacto no era apropiado para probar procesamiento completo de proveedores.

Suite completa: 477 tests aprobados, 0 fallidos y 0 omitidos. Typecheck, Prisma validate y git diff --check aprobados. Lint aprobado sin errores. Lint conserva cuatro warnings preexistentes de frontend, sin errores.

## Archivos

- Classifier: `lib/channels/whatsapp/multimodal-reading.ts`.
- Lifecycle/routing: `burst-routing.ts`, `prisma-burst-store.ts`, `burst-types.ts`, `supplier-picker.ts`; callback en `lib/channels/evolution/client.ts`.
- Identidad/histórico: `supplier-identity.ts`, `historical-resolution.ts`, `prisma-agent-domain.ts`, `ingestion-types.ts`.
- Grouping/ejecución/cierre: `evidence-grouping.ts`, `agent-service.ts`, `agent-tools.ts`, `agent-contract.ts`, `agent-orchestrator.ts`.
- Migración: `prisma/migrations/20261006220000_whatsapp_suspended_workflows/migration.sql`. Aplicada sólo a bases locales de tests.
- Replay: `evals/whatsapp-replay/{fixture,runner,report}.ts`, fixture P y ocho PNG públicos, `scripts/generate-burst-boundary-fixture.mts`.
- Tests: `tests/bot/whatsapp-burst-boundaries.test.mts`, `whatsapp-replay.test.mts`, fixture válido en `whatsapp-operational.test.mts`.

## Riesgos pendientes

1. Validar el prompt/schema finales con AI real y los originales: no se puede afirmar que el modelo dejó de confundir dibujos con packaging. DNS impidió esta comprobación. Las primeras variantes fallaron; no se oculta ese resultado.
2. YKO requiere aclaración; persona/branding compartidos no autorizan merge ni resolución de teléfonos dudosos.
3. No se separaron retroactivamente las 44 evidencias ya persistidas ni se reparó el backlog de producción. La nueva semántica aplica a ingresos futuros; resolución histórica se ejecuta al procesar evidencia segura posterior.
4. Migration y versión del worker deben coordinarse al desplegar en el futuro. Restaurar el índice anterior requiere primero resolver workflows simultáneos. No hubo deploy ni migración productiva en esta tarea.
5. Si Evolution no devuelve un outbound ID, quedan las opciones explícitas/signed selection; la correlación por quote del mensaje del bot no estará disponible.
6. La búsqueda exacta conserva scoping pero filtra los registros autorizados en memoria, como la búsqueda existente. El recorrido de WAITING históricos también necesita observarse si crece mucho el backlog.
7. No se añadió una política de expiración o cancelación de workflows WAITING sin resolver.
