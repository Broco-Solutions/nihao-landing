# Producto identificado, texto ilegible y condiciones con typo — 2026-10-09

## Incidente y alcance

La foto del mueble fue clasificada PRODUCT con confianza 1,0 y una descripción utilizable, pero `readability: unreadable` deshabilitó `productImageVerified` y generó `UNCERTAIN_VISUAL_READING`. LEOCH RENEWABLE ENERGY CO., LTD estaba inequívocamente en el foco persistido. Los mensajes posteriores fueron «Fon 15» y «Moq 10».

No hubo creación ni preservación real de MOQ 10. El agente preparó evidencia, declaró preservaciones y llamó finish_turn; la derivación temprana a aclaración por la imagen evitó validar esas declaraciones. La respuesta enviada describía el estado interno y sugería reenviar/reintentar sin identificar qué faltaba.

La regresión inicial falló en identificación visual utilizable, verificación de preservación antes de la aclaración y mensaje específico. No se realizó inferencia real para reproducirla.

## Cambios

- `multimodal-reading.ts`, `burst-reader.ts`, `product-observation.ts`: criterio compartido de producto identificado. Se mantiene confianza mínima 0,85, tipo PRODUCT, descripción no vacía y exclusión de ambigüedad. La ilegibilidad textual ya no bloquea identificar el objeto. Se preserva la clasificación original; tarjetas/documentos conservan sus validaciones.
- `commercial-typos.ts`, `mistral-extraction-provider.ts`: interpretación acotada de líneas comerciales «Fon 15», también con decimal y USD/EUR/CNY explícitos. Se aplica en extract y extractReading. No modifica texto, citas, source ni offsets: el campo FOB usa rawText y evidencia literales. Moneda/unidad ausentes permanecen null. No interpreta preguntas, referencias a teléfonos, alternativas, varias líneas Fon o combinación con otro FOB explícito. Otros errores ortográficos siguen dependiendo de la extracción semántica; no se agregó un corrector general.
- `evidence-grouping.ts`: único ajuste de asociación necesario: una condición estructurada breve y extraída después de una foto identificada sigue ese producto aunque la tarjeta esté en un turno anterior. No sustituye referencias explícitas, citas no resueltas ni la última tarjeta por una foto anterior. No agrupa prosa que presenta otro producto.
- `message-outcomes.ts`, `agent-tools.ts`: la validación común de escrituras declaradas se ejecuta antes de la salida anticipada hacia una aclaración de ingestión. PRESERVE_PRODUCT_FACTS exige receipt COMPLETED de preserve_product_facts con las evidencias correspondientes; prepararlas no basta. Una preservación completada conserva su receipt al pedir aclaración por otra evidencia.
- `evidence-grouping.ts`: reemplaza razones internas y recomendación colectiva de reenviar/reintentar por preguntas específicas para producto no identificable, nombre/contacto de tarjeta incompleta, diferencias entre lecturas, documento, audio y asociación. Sólo los errores retryable ofrecen reintento; no se pide reenviar un producto ya identificado.

No fue necesario modificar agent-service ni clarification-rendering: su composición existente conserva resultados reales y la aclaración específica. No se modificaron los tres prompts exactos, modelo, reasoning, thresholds, reset, permisos, schemas de tools, proposals o receipts de negocio. Sin migraciones.

## Pruebas

Nueva `whatsapp-product-capture-regression.test.mts`:

- BurstReader real con respuestas mock de clasificación/OCR: producto identificado pese a texto ilegible.
- Imagen ambigua/baja confianza, descripción vacía, tarjeta y documento ilegibles siguen en revisión.
- Declarar preservación sin receipt no evade validación aunque haya revisión de imagen.
- Preservación completada se conserva junto con aclaración independiente.
- Preguntas específicas y separación de fallos temporales de problemas de identidad.
- Foto + condiciones breves, sin tarjeta en la misma ráfaga, forman una carga compatible.
- PostgreSQL local: producto de LEOCH, FOB 15 y MOQ 10, moneda/unidad null, rawText Fon 15, imagen vinculada y reejecución idempotente.
- Cita no resuelta, tarjeta de otro proveedor y prosa de producto nuevo no heredan condiciones desde la foto anterior.
- Orquestador real con cliente mock y contratos estrictos: herramientas disponibles, creación COMPLETED, cierre sin aclaraciones innecesarias y reanudación del checkpoint sin otra llamada al modelo ni duplicación.

`mistral-extraction-provider.test.mts`: ambas entradas de extracción y contraejemplos de normalización ambigua.

`whatsapp-burst-boundaries.test.mts`: se reemplazó la aserción textual «tarjeta legible» por la pregunta concreta por el nombre faltante. Se mantienen controles de incompletitud, ilegibilidad y ausencia de recurso/confirmación indebida.

## Operación y límites

Cambios implementados y probados localmente. No se modificaron registros de producción, no se enviaron mensajes externos y no se reprocesó la conversación real. La corrección no reescribe retroactivamente lecturas ya persistidas como NEEDS_REVIEW: recuperar ese turno requiere un procedimiento específico sobre sus originales después de publicar la corrección. No debe confundirse recuperación de un caso con reprocesamiento global.

La inferencia semántica de Luna sigue siendo necesaria para escoger las herramientas. Los mocks prueban que el backend admite y valida la secuencia correcta; no garantizan la elección del modelo real. Las normalizaciones fuera de los patrones soportados permanecen en el flujo semántico existente.

## Validación final

- Regresión nueva: 10/10 pasan, incluidos PostgreSQL y loop completo con mocks.
- Focalizados finales (regresión, extracción, límites de ráfaga y outcomes mixtos): 59/59 pasan.
- WhatsApp sin eval/replay: 524 tests; 514 pasan, 9 fallos preexistentes y 1 skip de AI real.
- Repositorio sin eval/replay: 715 tests; 704 pasan, los mismos 9 fallos preexistentes y 2 skips.
- Los nueve fallos corresponden al padre de whatsapp-bursts-db y sus ocho casos legacy. Sus nombres coinciden con el baseline anterior de 17 fallos. Los otros ocho pertenecen a replay y no se ejecutaron por la instrucción de no hacer evals.
- No se ejecutaron `whatsapp-replay.test.mts`, `whatsapp-product-evals.test.mts` ni `evals-framework.test.mts`, ni scripts de eval. LIVE_AI=false y EVAL_IMAGE_RULES_REAL_AI=false; las DB usadas fueron exclusivamente locales.
- Typecheck: PASS.
- ESLint de los archivos TypeScript modificados: PASS.
- git diff --check: PASS.
- agent-orchestrator.ts es idéntico al commit desplegado a16e8a2, incluidos los tres prompts exactos.
- Sin push ni deploy en esta implementación.

Logs locales: `/tmp/nihao-product-red.log`, `/tmp/nihao-capture-targeted-final.log`, `/tmp/nihao-capture-whatsapp-final.log`, `/tmp/nihao-capture-full-final.log`, `/tmp/nihao-capture-typecheck-final.log`, `/tmp/nihao-capture-lint-final.log`.
