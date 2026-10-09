# Reemplazo exacto del prompt WhatsApp — 2026-10-09

Se reemplazaron exclusivamente los tres textos proporcionados por el usuario. Se conservaron párrafos, signos, acentos y saltos de línea internos, sin los delimitadores BEGIN/END ni saltos adicionales en los extremos. No hubo reformulación, cambios de modelo/reasoning, lógica de negocio, thresholds ni grouping. Sin push ni deploy.

## Archivos de esta tarea

- `lib/channels/whatsapp/agent-orchestrator.ts`: los tres valores de prompt; el resto del archivo coincide con el snapshot previo.
- `tests/bot/whatsapp-agent-prompt.test.mts`: hashes SHA-256 fijan exactamente los tres textos aprobados, además de las pruebas existentes de composición.
- `tests/bot/whatsapp-agent-memory.test.mts`: sustituye la búsqueda del encabezado antiguo «Memoria reciente:» por la del nuevo texto completo. Sigue verificando disponibilidad de `resolve_recent_reference`; no cambia una expectativa funcional.
- Este informe.

Los cambios de backend ya existentes, documentados en `whatsapp-functional-alignment-20261009.md`, se conservaron y no forman parte del reemplazo.

## Medición

Caracteres Unicode incluyendo espacios/saltos internos; palabras separadas por espacios; tokens aproximados = ceil(caracteres / 4), sin tokenizer ni APIs. La reducción se calcula sobre caracteres: el signo negativo indica aumento.

| Texto | Caracteres antes → después | Palabras antes → después | Tokens aproximados antes → después | Reducción |
| --- | --- | --- | --- | --- |
| Principal | 7691 → 7728 | 1092 → 1100 | 1923 → 1932 | −0,48% |
| Aclaración | 595 → 682 | 88 → 100 | 149 → 171 | −14,62% |
| Memoria | 167 → 317 | 20 → 43 | 42 → 80 | −89,82% |

Los textos suministrados no reducen tamaño. Se respetaron exactamente, sin acortarlos para cumplir una métrica.

## Auditoría de descriptions

Se revisaron las 17 descripciones en `agent-contract.ts`. Ninguna contradice explícitamente pending product facts, updates directos, WRITE + QUERY o reset que conserva pendingEvidence. No se modificó ninguna descripción ni schema.

## Reglas y ejemplos retirados

Se eliminaron del system las instrucciones anteriores completas, incluidos ejemplos concretos y detalles internos. La cobertura existente permanece:

- Cámaras analógicas/digitales y recurso nuevo frente a actualización: `whatsapp-agent.test.mts`, `whatsapp-followup-continuity.test.mts`.
- Escritorios y botellas: `whatsapp-agent.test.mts`, `whatsapp-image-rules.test.mts`, `whatsapp-followup-continuity.test.mts`.
- Notes y descuento por cantidad: `whatsapp-notes.test.mts` y regresiones de producto.
- Varios productos, atribución de FACTS/CONTEXT y citas: `whatsapp-agent-db.test.mts`, `whatsapp-agent.test.mts` y replay offline existente.
- Referencias recientes y aclaraciones numéricas: `whatsapp-agent-memory.test.mts`, `whatsapp-context-clarification.test.mts`, `whatsapp-followup-continuity.test.mts`.
- Contexto, pendingEvidence y reset: `whatsapp-conversation-context.test.mts`, `whatsapp-pending-evidence.test.mts`.
- Receipts, outcomes, WRITE + QUERY, updates directos y proposals históricas: `whatsapp-mixed-outcomes.test.mts`, `whatsapp-agent-db.test.mts`, `whatsapp-agent-priorities.test.mts`.

No se trasladaron las recetas internas ni ejemplos retirados a otras instrucciones del agente. No se cambiaron expected behaviors del replay.

## Validación

- Focalizados: 134 tests, 134 pasan, sin fallos ni skips.
- Replay CLI offline `C-explicit-alfa.json`: pasa; asociación 2/2 y escritura 1/1. Reporte local ignorado por Git: `replay-output/exact-prompt-C-20261009.json`. El primer intento ejecutó el replay pero rechazó guardar un reporte fuera de `replay-output`; se repitió con la ubicación permitida y terminó correctamente.
- Las suites amplias incluyen el replay completo y regresiones de producto, notes, descuentos, múltiples productos y aclaraciones. Se ejecutaron con `LIVE_AI=false` y `EVAL_IMAGE_RULES_REAL_AI=false`, DB PostgreSQL local y mocks/tapes. No se ejecutaron scripts de eval externos ni APIs reales de OpenAI/Mistral.
- Typecheck: pasa.
- ESLint de los tres archivos TypeScript modificados: pasa.

## Límites

La interpretación semántica, separación de intenciones y elección de tools siguen dependiendo de Luna. Las pruebas offline validan contratos, backend y secuencias mock; no miden cómo responderá el modelo real al nuevo wording. Los tapes vinculados al hash de prompt anterior requieren nueva grabación cuando se quiera evaluar esa versión, sin eludir la comprobación de configuración. No se realizó esa grabación externa en esta tarea.

### Resultados finales de suites

- WhatsApp: 546 tests; 528 pasan, 17 fallan, 1 skip de AI real.
- Completa: 745 tests; 726 pasan, 17 fallan, 2 skips.
- Los nombres de los 17 fallos coinciden exactamente con los logs de baseline anteriores, cuya comparación con main está documentada en el informe de alineación funcional. No hay fallos nuevos. Corresponden a los ocho casos legacy de bursts y su padre, seis casos replay y su padre, y captura/replay offline de caption. No se modificaron sus expectativas.
- El único fallo adicional observado inicialmente era la aserción textual del encabezado de memoria reemplazado. Se corrigió esa aserción; ambas suites finales vuelven al baseline de 17.
- Typecheck repetido después de todos los cambios: pasa.
- `git diff --check`: pasa.

Logs locales de esta tarea: `/tmp/nihao-exact-focused.log`, `/tmp/nihao-exact-whatsapp-final.log`, `/tmp/nihao-exact-full-final.log`, `/tmp/nihao-exact-replay.log`, `/tmp/nihao-exact-typecheck-final.log`, `/tmp/nihao-exact-lint.log`.
