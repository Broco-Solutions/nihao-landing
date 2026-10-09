# Alineación funcional de WhatsApp — 2026-10-09

Implementación local de las cuatro decisiones: condiciones sin producto pendientes, updates directos, escritura + consulta y reset exclusivo del foco. Sin cambios de system prompts, modelo, reasoning, thresholds ni reglas de grouping. Sin push, deploy ni evals. Todos los tests ejecutados fueron deterministas, con mocks y PostgreSQL exclusivamente local; la prueba opcional de AI real estuvo deshabilitada.

## 1. Diagnóstico anterior a la implementación

- `lib/channels/whatsapp/capture-evidence.ts`, `captureEvidence`: incorporaba FOB/MOQ/leadTime de `caption.pendingFacts` al candidate de la tarjeta cuando no había productos ni referencia explícita a otro proveedor. El soporte BUSINESS_CARD decidía el destino comercial sin indicación semántica de generalidad.
- `lib/channels/whatsapp/prisma-agent-domain.ts`, `persistCaptions`: para cargas SUPPLIER aplicaba todos los `pendingFacts` como patch del proveedor. Sólo preservaba pendientes en cargas PRODUCT sin producto observado.
- En el mismo archivo, `persistImageLoad` y `write(create_supplier_draft)` copiaban los campos comerciales de la evidencia a SupplierCapture mediante `enrichSupplierCapture`. La promoción podía llevarlos después a Supplier.
- `conversationContext` marcaba todos los pendientes del usuario/phone/instance como DISCARDED cuando el foco estaba limpio. `resetConversationContext` delegaba en esa función; la detección automática anterior al loop también la llamaba. Además, `rememberCompleted` descartaba pendientes de otros proveedores al avanzar el foco y `persistCaptions` podía crear filas directamente DISCARDED por un foco posterior. Esa retención no permitía regresar a Alfa después de pasar por Beta.
- `agent-tools.ts`, `finish_turn`: rechazaba cualquier response junto a una escritura COMPLETED con UNVERIFIED_RESPONSE, aunque outcomes incluyera QUERY. Su comprobación de respuesta de consulta también se omitía cuando había escrituras.
- El orchestrator ya concatenaba resultados de receipts con response. `agent-service.ts` reemplazaba luego ese texto por `renderBatchSummary`; el procesamiento por tarjetas también vaciaba el terminal.
- Los updates ya cumplían la decisión: `write` aplica `applyPatch` directamente, termina la evidencia/media y devuelve COMPLETED, incluso en CONFIRMED. No crea nuevas propuestas. `resolve`, apply/cancel y la recuperación de PROPOSED existentes siguen siendo necesarios.

El diagnóstico se comunicó antes de editar código. La base de comparación fue `main`, commit `2288dfe`.

## 2. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `lib/channels/whatsapp/capture-evidence.ts` | Retira la incorporación implícita de condiciones del caption al candidate de proveedor. |
| `lib/channels/whatsapp/pending-commercial-evidence.ts` | Comparte las tres claves comerciales y la comprobación literal de alcance general. |
| `lib/channels/whatsapp/prisma-agent-domain.ts` | Corrige captions y creación automática/conversacional; valida alcance en update_supplier; conserva pendientes al limpiar o cambiar foco. |
| `lib/channels/whatsapp/product-observation.ts` | Evita heredar al producto visual condiciones explícitamente generales del proveedor. |
| `lib/channels/whatsapp/conversation-association.ts` | No interpreta verbos como «trabaja» como nombre de proveedor. |
| `lib/channels/whatsapp/conversation-context.ts` | Reconoce Empecemos, Cambiemos y Reiniciemos, incluido punto final; reiniciar el worker no equivale a reset conversacional. |
| `lib/channels/whatsapp/message-outcomes.ts` | QUERY no puede ocultar otro fragmento FACTS sin resolver dentro de un mensaje con writes declarados. |
| `lib/channels/whatsapp/agent-tools.ts` | Acepta composición con QUERY, exige una lectura real para response mixto y conserva los guards de escrituras y outcomes. |
| `lib/channels/whatsapp/agent-contract.ts` | Añade checkpoint interno de respuestas de consulta por revisión y carga; no cambia el schema de tools. |
| `lib/channels/whatsapp/agent-service.ts` | Compone resumen de receipts y consultas al finalizar; evita duplicar resúmenes y perder respuestas por carga/retry. |
| `tests/bot/whatsapp-pending-evidence.test.mts` | Prueba retención, aislamiento, alcance comercial, creación y recuperación real con PostgreSQL. |
| `tests/bot/whatsapp-agent-db.test.mts` | Prueba updates directos y mixed turn/resume; distingue por nombre los tests de proposals históricas. |
| `tests/bot/whatsapp-image-rules.test.mts` | Actualiza expectativas incompatibles sobre condiciones de tarjeta; la prueba de condiciones generales expresa ahora su alcance explícito. |
| `tests/bot/whatsapp-mixed-outcomes.test.mts` | Nuevas regresiones deterministas de finish_turn, composición y guards. |
| `docs/development/whatsapp-functional-alignment-20261009.md` | Este informe. |

El documento no trackeado `nihao-operations-production-release-20261008.md` ya existía y no fue modificado.

## 3. Cambios de comportamiento

- Una tarjeta con «FOB 50 MOQ 15000» crea/preserva al proveedor, pero esos importes no se asignan a sus campos comerciales: quedan pendientes del producto bajo su capture autorizado.
- Una condición explícitamente general, como «para todos sus productos», puede actualizar Supplier directamente.
- Un producto identificado conserva su propia ruta de creación/update, incluyendo los productos nombrados en captions y los productos observados visualmente.
- Una actualización válida seguida de consulta puede terminar con ambos bloques en un único mensaje.
- Reset o cambio de proveedor conserva las filas pendientes con su propietario original. No las expone globalmente ni reasigna condiciones.

## 4. Solución para pendingFacts

Se separa el soporte físico del alcance comercial. `captureEvidence` ya no incorpora automáticamente los `pendingFacts` del caption a la tarjeta. `persistCaptions` divide FOB/MOQ/leadTime entre condiciones explícitamente generales y pendientes, y usa upsert estable con mensaje original, fecha, sequence, usuario, instance, phone, trip, company y capture.

La creación automática y la creación conversacional de proveedor filtran los campos comerciales antes de enriquecer SupplierCapture. Las condiciones de texto sin producto identificado pueden preservarse atómicamente junto a la creación de su propietario. Un producto literalmente identificado conserva su escritura separada; no se deja por esa creación un duplicado destinado al siguiente producto.

`update_supplier` no convierte condiciones sin alcance general en condiciones del proveedor: devuelve PRODUCT_FACTS_REQUIRE_PRODUCT y dirige al mecanismo preserve_product_facts. El guard se aplica a operaciones nuevas; no invalida la recuperación de operaciones ya persistidas.

La comprobación de generalidad exige texto literal, una cita comercial no ambigua y alcance explícito en la misma cláusula. Un FOB general no convierte automáticamente un MOQ vecino en general. Tampoco se introduce moneda por defecto.

**Notes no amplían scope:** preserve_product_facts continúa conservando únicamente FOB/MOQ/leadTime. Las notes cualitativas de captions mantienen su ruta anterior. Las notes en filas pendientes históricas mantienen su consumo previamente soportado; ese test sigue usando una fila legacy explícita.

La recuperación/consumo conserva los filtros existentes de pendingWith, incluida la exclusión del mismo mensaje fuente, cronología, permisos y captura. Las filas compatibles se marcan APPLIED dentro de la transacción del producto. No se migran condiciones históricas ya asignadas a Supplier ni se resucitan filas DISCARDED anteriores.

## 5. Composición write + query

El schema existente admite varios outcomes del mismo mensaje y varios mensajes. Se mantiene tool_choice obligatorio.

- Cada write declarado debe tener FACTS preparados y un receipt COMPLETED del tipo correcto. QUERY no oculta FACTS sin resolver cuando hay writes declarados.
- Con un write completado, response sólo se permite para un outcome QUERY y necesita una lectura exitosa real de get/search supplier/product en el turno/carga correspondiente.
- Los guards rechazan prosa mutativa, incluyendo «Guardé», «Apliqué» y resúmenes de éxito con emojis en un mixed turn. Una consulta pura conserva su formato actual.
- Si una consulta obtuvo resultados, la escritura no permite omitir su response: se mantiene MISSING_QUERY_RESPONSE.
- Si la lectura falla/no se verifica, response=null permite conservar el write y agregar un aviso factual fijo del backend, sin un valor inventado.
- Las consultas verificadas estructuralmente se checkpointan por revisión/carga. Un retry reemplaza la respuesta de esa carga; no la duplica. Varias cargas pueden aportar consultas a una sola respuesta final.
- El worker genera el resumen con renderBatchSummary/renderSavedResults desde receipts reales y agrega las respuestas de consulta. No reutiliza un resumen redactado por el modelo como prueba de una escritura.

Un write fallido no satisface UPDATE/CREATE en outcomes y no produce resumen de éxito. Una consulta independiente y segura puede responder por QUERY; los receipts fallidos no se renderizan como writes completados.

La verificación de consultas conserva el contrato factual existente de texto libre: valida lectura/outcomes y prohíbe claims mutativos; no es un verificador semántico exhaustivo de cualquier paráfrasis del agente.

## 6. Nuevo reset

`resetConversationContext` y la detección automática comparten conversationContext/contextWith. Vacían supplierIds, productIds, referencias/operaciones de foco y trip/company del foco persistido; mantienen el activeBurstId operativo usado por recepción.

Se eliminan los descartes automáticos por foco limpio, cambio de proveedor y procesamiento tardío de captions. No se alteran pendingWith ni sus permisos/alcance. Reset no cancela proposals, no modifica proveedores/productos y no elimina originales.

Los tests demuestran Alfa → pendiente → reset → Beta → producto de Beta sin condiciones de Alfa, y posterior regreso explícito a Alfa mediante la ruta validada de escritura. La recuperación depende de las reglas actuales; no se amplía la búsqueda automática por el mero hecho de sobrevivir al reset.

## 7. Updates directos y compatibilidad

La operación de update y completeMedia permanece directa; no se introdujo aprobación ni creación de PROPOSED. Se agregó únicamente validación de alcance comercial para proveedores. Los tests nuevos prueban Supplier CONFIRMED y Product CONFIRMED con COMPLETED y cero propuestas nuevas.

Las propuestas históricas siguen siendo sembradas como PROPOSED por el helper legacy y prueban apply, cancel, conflictos y expiración. Se cambió su nombre de «edición confirmada» a «propuesta histórica persistida» para evitar que se interpreten como el flujo actual.

## 8. Regresiones agregadas/actualizadas

- MOQ, FOB y leadTime actuales sin producto, con proveedor inequívoco: pending; update_supplier inválido no crea efecto.
- BUSINESS_CARD con condiciones: supplier sin esos campos, pending durable y consumo posterior.
- Generalidad explícita en caption y update_supplier; generalidad sobre foto de producto sin herencia al producto visual.
- Creación conversacional de proveedor con condiciones pendientes, atómica e idempotente.
- Captions con producto nombrado, follow-ups e imágenes conservan condiciones y originales correctos.
- Alfa/Beta con diferentes pendientes, reset automático y explícito, retry de reset y nueva instancia PrismaAgentDomain; Alfa permanece PENDING y sólo se aplica al destino compatible.
- Reset no altera suppliers, products, attachments ni proposals históricas.
- Aislamiento por usuario, phone, instance y pendiente/capture incompatible; consumo cronológico una sola vez y overrides literales actuales.
- Update + query, create + query, varios writes + varias queries, write solo y query sola; errores de write y query; respuesta omitida; claims de éxito falsos; consultas por distintas cargas y checkpoints.
- Worker real con PostgreSQL: create + query, envío interrumpido, recuperación sin repetir modelo mock ni producto, y una sola aparición de cada bloque.

Las expectativas anteriores que asignaban condiciones de tarjeta a Supplier fueron actualizadas porque contradicen expresamente la nueva decisión, no para ocultar fallos. Las pruebas legacy de proposals no se eliminaron.

## 9. Resultados de tests

| Ejecución | Total | Pass | Fail | Skip |
| --- | ---: | ---: | ---: | ---: |
| Focalizados: pending-evidence, agent-db, mixed-outcomes, image-rules, conversation-context | 88 | 87 | 0 | 1 |
| Tests específicos `whatsapp-*.test.mts` | 545 | 527 | 17 | 1 |
| Suite completa `pnpm test` | 744 | 725 | 17 | 2 |
| Suite completa sobre main limpio `2288dfe` | 718 | 699 | 17 | 2 |

Se compararon los nombres de fallos: **cero fallos nuevos; los mismos 17 fallos que main**. El conteo incluye dos suites padre fallidas y 15 casos hijos.

Fallos preexistentes:

- `whatsapp-bursts-db.test.mts`: ocho casos de recepción/leases del flujo legacy, iniciados por una respuesta 503 en lugar de 200; la suite padre también falla.
- `whatsapp-replay.test.mts`: M-product-notes, O-product-notes-target, G-product-audio, H-product-not-last, K-document-reply, capture once/replay G y caption extraction/replay M; la suite padre también falla. Agotan respuestas mock y G también incumple su expectativa de automatic_confirmations, igual en main.

Las pruebas de AI real y de HTTP que necesitan un servidor externo quedaron omitidas. No se ejecutaron comandos eval, eval:all, scripts de evals, ni llamadas reales a Mistral/OpenAI. Las variables de base de datos con prefijo EVAL son las que usan los fixtures de tests existentes para imponer exclusivamente PostgreSQL local; no implican una ejecución de evals.

Logs locales de validación: `/tmp/nihao-functional-new-tests.log`, `/tmp/nihao-functional-whatsapp-final.log`, `/tmp/nihao-functional-full-final.log`, `/tmp/nihao-functional-main-suite.log`.

## 10. Typecheck

`pnpm typecheck`: PASS. Log: `/tmp/nihao-functional-typecheck-final.log`.

## 11. Lint

Lint de todos los archivos de código/tests modificados: PASS, sin warnings.

`pnpm lint` global: FAIL por ocho no-require-imports en cuatro scripts **locales ignorados y preexistentes** de replay-output: production-cleanup.cjs, production-cleanup-apply.cjs, production-cleanup-pending.cjs y production-cleanup-verify.cjs. También hay cuatro warnings anteriores en AppShell.tsx, TripsClient.tsx, components/app/api.ts y nihao-capture-lifecycle.test.mts.

Main limpio tiene cero errores y los mismos cuatro warnings. Copiando únicamente esos cuatro artefactos locales al checkout de main se reproducen exactamente ocho errores y cuatro warnings. No se modificaron ni eliminaron los artefactos del usuario ni se cambió la configuración de lint.

Logs: `/tmp/nihao-functional-scoped-lint.log`, `/tmp/nihao-functional-lint-final.log`, `/tmp/nihao-functional-main-lint.log`, `/tmp/nihao-functional-main-lint-with-artifacts.log`.

## 12. Diff

`git diff --check`: PASS. No commits, push ni deploy. Sin migraciones ni cambios de configuración de modelos/proveedores.

## 13. Prompt actual: puntos a revisar después

No se modificó ninguno de los tres prompts.

- WHATSAPP_AGENT_PROMPT, CIERRE: **«Después de guardar, mostrá el resultado»** puede inducir al agente a redactar éxito de write en response. El backend ahora exige que el agente aporte únicamente la consulta factual en un mixed turn y genera el éxito desde receipts.
- FORMATO: **«Usá emojis con función clara: ✅ resultado, 📦 producto»** requiere aclarar que los símbolos de éxito de writes pertenecen al renderer. Se conserva la presentación de una consulta pura; en mixed turns el agente no debe agregar un segundo resumen de escritura con esos símbolos.
- CAMBIOS: **«Si una tool genera una propuesta, terminá el turno y esperá aprobación explícita»** debe quedar delimitado a compatibilidad con propuestas históricas; no describe nuevas actualizaciones directas.
- La instrucción existente de reset es compatible con limpiar foco, pero no explicita que pendingEvidence sobrevive y no se reasigna. Es una omisión que conviene aclarar, no una orden actual de descartar.
- Las instrucciones existentes sobre preservar condiciones sin producto y actualizar confirmados directamente ya son compatibles. WHATSAPP_AGENT_CLARIFICATION_PROMPT no tiene una contradicción funcional nueva. WHATSAPP_AGENT_MEMORY_PROMPT restringe FACTS provenientes de memoria reciente; pendingEvidence usa su propio mecanismo autorizado, y no se debe presentar como una ampliación de recentMemory.

## 14. Riesgos pendientes

- La comprobación literal de generalidad es conservadora: formulaciones no reconocidas o citas repetidas quedan pendientes/requieren preparar mejor la evidencia, antes que asignarse automáticamente a Supplier. No se ejecutaron evals para medir comprensión real del agente.
- La consulta mantiene texto factual libre del agente y su contrato de no inventar; leer un registro no demuestra semánticamente toda frase de una respuesta. Los writes, en cambio, se verifican contra receipts y no toman sus resultados de ese texto.
- Las 17 fallas de tests preexistentes y los artefactos locales que rompen lint global siguen presentes y documentados; no se expandió esta tarea para corregirlos.
- No hay reparación retroactiva de condiciones incorrectamente guardadas por versiones anteriores ni de pendientes ya descartados. Eso requeriría una tarea de datos aparte con procedencia verificable.
- Los prompts todavía necesitan su reescritura posterior para delimitar composición, compatibilidad legacy y retención tras reset.
