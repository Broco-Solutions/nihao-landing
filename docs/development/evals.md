# Evals del MVP de Nihao

Tres capas distintas: `pnpm test` verifica comportamiento determinístico; `eval:*` mide IA y conflictos con el core real; UAT físico prueba teléfono/WhatsApp/Evolution/conectividad. **AI EVALS ≠ UAT.** Un PASS de eval no valida el canal.

## Suites y comandos

Usar Node 24 y credenciales **locales** para Mistral. No se usa STAGING, Evolution ni R2 productivo. Los runners de imágenes cargan archivos locales en el `BusinessCardResolver` de producción; texto y transcripts usan `SupplierExtractionService` y los modelos/prompts productivos sin modificaciones. Merge/human corrections usan merge y repositorio de archivo existentes con datos sintéticos temporales. Channel usa fakes locales.

| Comando | Alcance |
|---|---|
| `pnpm eval:business-cards` | Cuatro tarjetas privadas, OCR Mistral y merge multi-foto |
| `pnpm eval:text` | Ocho textos sintéticos versionados |
| `pnpm eval:audio` | Seis transcripts sintéticos; extracción, **no** transcripción real |
| `pnpm eval:real-audio` | Voxtral y extracción si existe `test-data-private/audio/manifest.json`; si no, `SKIPPED — NO FIXTURES` |
| `pnpm eval:merge` | Siete casos determinísticos, conflictos y correcciones humanas |
| `pnpm eval:channel` | Diez casos con fakes, incluidos saludo, ayuda y consulta de borradores |
| `pnpm eval:whatsapp-batches` | Agrupación de 10 fotos y 5 proveedores, evidencia ambigua, OCR real opcional e integración PostgreSQL local opcional |
| `pnpm eval:whatsapp-agent` | 38 escenarios v3 con OpenAI real para contexto/tools, Mistral para imágenes; PostgreSQL exclusivamente local mediante `EVAL_AGENT_DATABASE_URL`, transcripts literales y selección interactiva simulada |
| `pnpm eval:whatsapp-products` | 12 casos con Mistral real: productos para proveedores existentes, alias, homónimos, aclaración numérica, foto complementaria y varios productos |
| `pnpm eval:all` | Todas las suites |
| `pnpm eval:compare -- <baseline-dir> <candidate-dir>` | Compara métricas y regresiones caso por caso |

Agregar `--runs 3` para medir estabilidad, o `--run-id mvp-baseline-001` para nombrar el reporte. Por defecto hay una repetición para controlar costo. Los reportes se escriben exclusivamente en `test-data-private/eval-reports/<run-id>/` (`summary.json`, `summary.md`, `cases.json`) y nunca deben agregarse a Git. `cases.json` puede contener datos privados: no compartirlo públicamente. Cada run guarda timestamp, SHA, rama, modelos, hashes de fuentes/fixtures, versiones y latencia. El runner registra los contadores de usage que Mistral incluya en su respuesta; no estima tokens faltantes ni dinero.

## Productos por WhatsApp

La suite `whatsapp-products` requiere `MISTRAL_API_KEY`: usa extracción, segmentación y planificación productivas, más OCR y lectura visual reales para una foto sintética local. Los audios se representan mediante transcripts literales; no ejecuta Voxtral ni valida el canal físico. No escribe en la base, Evolution ni R2. Evalúa tipo de carga, proveedor autorizado, empresa, cantidad de productos, asociación de evidencias, preguntas y campos comerciales explícitamente esperados o pendientes. El caso de instrucciones maliciosas evalúa el proveedor destino; no valida confirmación o persistencia. Guarda respuestas originales del planificador, lecturas y usage en el reporte privado para investigar fallos. Los errores del validador se conservan como `ERROR`, sin reparar automáticamente el JSON del modelo.

Baseline local del 2 de octubre de 2026: `whatsapp-products-baseline-20261002`, **4 PASS, 4 FAIL, 4 ERROR**. El planificador confunde algunos productos con nuevas cargas de proveedores; la foto complementaria y otros casos producen referencias de mensajes en lugar de fragmentos, o repiten fragmentos entre grupos. La respuesta numérica tampoco resolvió el caso de homónimos en esa ejecución. Estos resultados no permiten considerar lista la funcionalidad; los fallos se conservan sin cambiar prompts ni expectativas.

Estabilidad con los mismos prompts y expectativas: `whatsapp-products-stability-20261002`, 12 casos repetidos tres veces, **12 PASS, 9 FAIL, 15 ERROR** (33,3% PASS). Los 15 errores corresponden a planes rechazados por el validador: 13 por referencias inválidas/duplicadas y 2 por proveedor incompatible con la evidencia; no fueron errores HTTP del servicio. Sólo falta de proveedor (WP08) y dos productos para proveedores distintos (WP11) pasaron 3/3. El producto explícito (WP01), alias (WP02), foto/audio complementarios (WP03), desambiguación por empresa (WP06), dos productos en un transcript (WP09) e instrucciones maliciosas (WP12) pasaron 0/3. La aclaración numérica pasó 1/3. No hubo hallucinations en los campos comprobados de los planes que pudieron evaluarse; los casos abortados no permiten concluir que sus datos comerciales sean correctos. El siguiente paso es corregir clasificación, referencias y continuidad de las aclaraciones, y comparar una corrida candidata contra este baseline.

## Fixture de audio real futuro

Crear localmente `test-data-private/audio/manifest.json` con `{ "cases": [{ "caseId": "...", "file": "sample.ogg", "expectedTranscript": "...", "expectedNihao": {}, "mustRemainMissing": [] }] }`, y el audio en `test-data-private/audio/<caseId>/sample.ogg`. Sólo agregar recordings consentidos; no versionarlos. `expectedTranscript` se compara y se registra por separado de la extracción. Sin archivos reales, la suite se salta y no se presenta audio sintético como UAT.

## Scoring

Cada campo esperado se clasifica `correct`, `missingExpected` o `wrong`. Un valor en `mustRemainMissing` es `hallucinated`, con foco crítico en FOB, MOQ, entrega e interés. `WRONG` es más grave que `MISSING`; la tabla de métricas no decide automáticamente si un modelo mejoró. Los comparadores normalizan espacios/case, email, teléfono, URL y valor+unidad comercial sin fuzzy matching amplio. `contact` Tier 1 combina nombre/email/teléfono y admite sólo un teléfono: cuando la tarjeta muestra varios, cualquiera de los números visibles es válido, sin exigir almacenar todos. Website y otros facts sin columna Tier 1 quedan observacionales. El OCR de business cards productivo sólo admite empresa/contacto/ciudad/provincia: los `expectedNihao` privados siguen siendo la expectativa y sus fallos se reportan sin alterar el extractor.

Un caso pasa sólo si sus expectativas explícitas son correctas, no viola `mustRemainMissing`, y satisface REVIEW/merge/human override cuando corresponda. `XPASS` exige revisar el issue. El caso de corrección verbal en transcripts es `OBSERVATIONAL` hasta definir su política. Los reportes de comparación muestran precision, recall, wrong, missing, hallucinations, review, merge y regresiones concretas. Guardar un baseline nuevo antes de cambiar prompts/modelos; no modificar el core para hacer pasar fixtures.

La suite `whatsapp-batches` mantiene fixtures sintéticos versionados en `evals/whatsapp-batches/`. Con `MISTRAL_API_KEY` ejecuta OCR y agrupación reales; sin clave verifica las reglas determinísticas. Con `EVAL_DATABASE_URL` apuntando exclusivamente a PostgreSQL local comprueba recepción, ventana de 60 segundos, cinco borradores, adjuntos y aclaración posterior. El runner rechaza bases remotas para evitar escribir datos de eval en staging o producción.

## T07 — interés comercial inventado

El baseline `mvp-baseline-001` registró la hallucination crítica `"Proveedor de iluminación. Interesante."` → `interestScore=4`. **FIX IMPLEMENTED / PENDING REVIEW**: la core sólo acepta el score propuesto por Mistral si el texto o transcript original contiene una valoración numérica explícita del mismo valor, por ejemplo `Interés 4 de 5`, `Interés 4/5` o `Interest 4 out of 5`. `Interés 4` conserva el contrato previo. `Interesante`, otras frases vagas e `interés alto/medio/bajo` no tienen conversión automática documentada y permanecen missing; una persona puede corregir el campo durante la revisión. El eval local T07 pasó 3/3; esto no equivale a validación STAGING/UAT. No cambiar los expected ni el baseline histórico.

## Kendal — contacto complementario frente/reverso

El baseline `mvp-baseline-001` perdió nombre, email y teléfono porque el merge comparaba dos strings `contact` completos como si fueran contradictorios. **FIX IMPLEMENTED / PENDING REVIEW**: el merge productivo separa sólo componentes reconocibles del formato actual, normaliza equivalencias razonables y vuelve a serializar al mismo campo. Nombre/email/teléfono complementarios se conservan; valores incompatibles o texto libre no interpretable siguen en REVIEW. No hubo migration ni cambio de expected. Una equivalencia **sólo del evaluator para `companyName`** acepta diferencias de espaciado cuando la secuencia de letras y números es idéntica (`Kendal Salud`/`KendalSalud`); no hace fuzzy matching ni afecta otros campos. Kendal pasó 3/3 evals locales y la suite business cards pasó 1/4. AI EVALS ≠ UAT físico.

## Sanatorio — provincia inferida sin evidencia

El baseline `mvp-baseline-001` mostró `province = Santa Fe` en la anotación de Sanatorio, pero ninguna página OCR contiene esa provincia. **FIX IMPLEMENTED / PENDING REVIEW**: para business cards, el provider contrasta la provincia propuesta con el texto bruto de las páginas OCR, mediante comparación conservadora de palabras completas (case, acentos y puntuación normalizados). Si no aparece, descarta tanto el valor como la evidencia generada para `province`, y el campo queda missing. `city` permanece independiente. Esto no es geocoding y no cambia las expectativas privadas ni otros fallos de contacto/teléfono del caso. Sanatorio quedó sin hallucination de provincia en 3/3 ejecuciones locales; la suite completa mantiene Kendal PASS y ningún caso agregó hallucinations. Pendiente de revisión antes de push y de validación STAGING.

## Orquestador con tools — v3

Ver [arquitectura y ejecución de v3](../architecture/whatsapp-agent-tools.md). La suite conserva los 12 casos originales de productos y agrega 13 escenarios de consultas y cambios. A diferencia del planificador v2, mide las operaciones resultantes en PostgreSQL local, no un JSON propuesto. Un producto sin destino debe conservarse en la pregunta pendiente sin crear registros. Las transcripciones son literales y las respuestas de Evolution se representan mediante outbox local; no sustituye UAT físico. Los hashes se capturan antes de ejecutar los casos para conservar la versión probada.

Aceptación final `whatsapp-agent-production-gate-20261002`: 75/75 PASS (25 × 3), cero FAIL/ERROR/alucinaciones críticas y cero reanudaciones necesarias. Solicitudes reales espaciadas; recuperación limitada de timeouts y HTTP 429/502/503/504 queda registrada en metadata si ocurre. Suite determinística completa con PostgreSQL aislado v2/v3: 223/223 PASS. Transcripts provistos; UAT físico/audio real pendiente.

## OpenAI y conversaciones extendidas — 2026-10-04

La suite v3 ahora tiene 37 casos: 12 de productos, 18 de operaciones/memoria, 4 de recepción/recuperación y 3 conversaciones extendidas de 6, 6 y 7 turnos de usuario. Para ejecutar `pnpm eval:whatsapp-agent`, configurar `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `WHATSAPP_AGENT_MODEL=gpt-5.6-luna` y `EVAL_AGENT_DATABASE_URL` exclusivamente para PostgreSQL local `/nihao_agent_test`. Los escenarios de imágenes usan OCR/visión real de Mistral; texto, contexto, segmentación y tools usan OpenAI. No copiar claves en Git ni usar bases del proyecto para evals.

Las conversaciones extendidas verifican persistencia después de cada turno, memoria entre conversaciones terminadas, destino del proveedor, condiciones comerciales conservadas y aprobación/cancelación de cambios. [Conversaciones reales y resultados](whatsapp-openai-extended-evals-20261004.md). Los fallos funcionales se conservan; sólo timeouts y HTTP 429/502/503/504 admiten recuperación limitada registrada.
