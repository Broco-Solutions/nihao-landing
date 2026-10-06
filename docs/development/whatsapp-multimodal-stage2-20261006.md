# Nihao: entregable de segunda etapa multimodal — 2026-10-06

Implementación local sobre etapa 1. **Sin push y sin despliegue.** No se ejecutó ninguna migración contra producción ni se accedió a datos de producción para probar. Se mantiene GPT-5.6 Luna, Responses API, reasoning.effort medium, sin temperature. No se cambiaron las 15 tools strict, gating, memoria reciente condicional, soft/hard limits, watchdog, idempotencia técnica ni reglas de aprobación de propuestas.

## Arquitectura y causas localizadas

Evolution → validación de viajero → mensajes/ráfaga durable → BurstReader → agente con tools → PrismaAgentDomain → outbox. La integración OpenAI real sigue en agent-provider.ts: adapta el contrato interno de chat a /v1/responses; ese adaptador no cambió. Visión/OCR/transcripción siguen utilizando la infraestructura media existente.

| Problema observado | Punto concreto previo | Corrección |
| --- | --- | --- |
| Una tarjeta fallida interrumpe la batch | agent-service.ts, lectura completa dentro del try global; rondas compartidas entre tarjetas | Lectura aislada por asset, checkpoints y loop por carga de tarjeta; operaciones independientes |
| Audio en proveedor incorrecto | Input de mensajes individuales en agent-orchestrator.ts y falta de validación de destino en agent-tools.ts | Enlaces persistidos por segmento, razones/candidatos y comparación con IDs reales |
| Lectura dudosa aceptada | burst-reader.ts, candidato derivado del OCR sin contraste estructurado | Visión original + validación + comparación OCR + segunda lectura independiente; revisión bloquea escritura |
| Frente/reverso convertidos en dos proveedores | No existía representación previa de tarjetas lógicas | Agrupación determinística anterior al agente, expansión de evidencia y guardas contra duplicación |
| Imagen no clasificada correctamente | Clasificación limitada a BUSINESS_CARD/PRODUCT_IMAGE/OTHER, sin DOCUMENT ni sides | Cuatro clases, lado y legibilidad en JSON cerrado validado |
| Producto visual poco útil | Descripción visual breve sin observaciones ni vínculo verificable | Descripción/marca/modelo/texto/packaging y asociación semántica al audio; sin inferir precios |

No se encontró una transacción PostgreSQL única sobre toda la batch. El fallo era interrupción del pipeline; no se introdujeron savepoints innecesarios ni se debilitó la consistencia de las transacciones del dominio.

## Cambios realizados

1. Estados e intentos explícitos de ingesta por asset, con errores recuperables/determinísticos y resultados parciales conservados.
2. Clasificador visual original BUSINESS_CARD/PRODUCT/DOCUMENT/OTHER y FRONT/BACK/UNKNOWN_SIDE, con legibilidad y esquema cerrado en servidor.
3. Lectura estructurada de tarjeta y validación de contactos/webs; normalización sin inventar dígitos. OCR deja de ser la única verdad.
4. Segunda lectura visual independiente ante discrepancias/omisión de contacto/incertidumbre; la duda persistente impide mutación y conserva las lecturas.
5. Cargas SUPPLIER/PRODUCT/EVIDENCE con IDs estables, resourceId y estado/ejecución por carga.
6. Grafo en JSON existente: FRONT_OF/BACK_OF/IMAGE_OF/FACTS_FOR/CONTEXT_FOR/POSSIBLY_RELATED y derivaciones OCR/transcripción DERIVED_FROM.
7. Frente/reverso por identidad y complementariedad; nombres distintos impiden agrupación, branding/orden solos no bastan. La aclaración de varios frentes se recuerda.
8. Asociación por segmento de audio/texto, referencias explícitas/alias únicos/contexto/semántica visual/citas. Nunca último proveedor por proximidad sola.
9. Aclaración automática con candidatos y fuente/segmento persistidos para asociaciones ambiguas; selección numérica reconstruye el enlace.
10. Guardas de prepare_evidence y mutaciones contra cargas mezcladas, proveedor destino incorrecto, grupo de tarjeta incompleto o foto de otro producto.
11. Imagen válida requiere PRODUCT + IMAGE_OF confiable + media persistida. Tarjeta/documento/OTHER/OCR no confirma producto; proveedor combina nombre/contacto de ambos lados.
12. Ingesta v3 habilitada en composición actual; aislamiento por tarjeta con sus límites/watchdog; remainder permite productos/consultas después de tarjetas y conserva su respuesta.
13. Fallo de media conserva operación WRITTEN y carga recuperable, también al aplicar propuesta; otras cargas continúan. Idempotencia existente y autorización permanecen.
14. Native documentMessage entra como DOCUMENT, conserva archivo privado dentro del límite existente y revisión explícita; no se agrega parser de PDF.
15. Input/prompt ajustado mínimamente a cargas agrupadas/activeLoadId y ambigüedad. Resumen final del servidor muestra evidencias, cargas, procesadas, pendientes, revisiones y fallidas con recibos reales.
16. Metadata/logs de asset, batch y candidatos de audio disponibles para investigar incidentes sin dashboard nuevo.

Antes, los mensajes eran unidades individuales para el modelo. Ahora las cargas agrupadas son la unidad explícita de trabajo; las fallas parciales quedan visibles y una lectura dudosa no puede autorizar herramientas de escritura. Un audio sin referencia suficiente produce pregunta aunque llegue último. Documentos nativos se conservan como revisión en lugar de quedar fuera del v3.

## Todos los archivos modificados o agregados

| Archivo | Cambio |
| --- | --- |
| lib/channels/evolution/webhook.ts | Tipo y parser DOCUMENT/media documentMessage |
| lib/channels/whatsapp/agent-composition.ts | Habilita lector e ingesta multimodal en v3 |
| lib/channels/whatsapp/agent-contract.ts | scopeId, carga de pregunta, associationSource y logicalLoadIds de recibos |
| lib/channels/whatsapp/agent-orchestrator.ts | Input lógico, alcance por carga y ajuste mínimo del prompt |
| lib/channels/whatsapp/agent-service.ts | Pipeline, procesamiento parcial y resumen/checkpoints por carga |
| lib/channels/whatsapp/agent-tools.ts | Guardas/expansión de evidencia, preguntas y estados de recibos |
| lib/channels/whatsapp/burst-reader.ts | Visión/OCR/reconciliación y conservación de documentos |
| lib/channels/whatsapp/burst-types.ts | Metadata de lectura y grafo en state; tipo DOCUMENT |
| lib/channels/whatsapp/burst-webhook.ts | Admisión durable de DOCUMENT |
| lib/channels/whatsapp/prisma-agent-domain.ts | Guards, prueba IMAGE_OF, trazabilidad y aislamiento de media |
| lib/channels/whatsapp/prisma-burst-store.ts | Conserva compatibilidad v2 y admite DOCUMENT en v3 |
| lib/channels/whatsapp/ingestion-types.ts (nuevo) | Tipos cerrados de ingesta, cargas y grafo |
| lib/channels/whatsapp/multimodal-reading.ts (nuevo) | Visión estructurada, validación y reconciliación |
| lib/channels/whatsapp/multimodal-ingestion.ts (nuevo) | Orquestación por asset, retries y checkpoints |
| lib/channels/whatsapp/evidence-grouping.ts (nuevo) | Agrupación, asociación, grafo y validaciones reutilizables |
| tests/bot/whatsapp-multimodal.test.mts (nuevo) | Cobertura obligatoria y regresiones adicionales |
| docs/architecture/whatsapp-multimodal-ingestion.md (nuevo) | Arquitectura detallada, Mermaid y límites |
| docs/architecture/whatsapp-agent-tools.md | Referencia a etapa 2 local |
| docs/development/current-state.md | Estado local etapa 2 y release previo de etapa 1 |
| docs/development/whatsapp-multimodal-stage2-20261006.md (nuevo) | Este entregable |

El archivo ya existente sin seguimiento docs/development/whatsapp-agent-prompt-and-tools-20261006.md no se modificó. No hay cambios frontend, schema Prisma, migraciones, modelo, reasoning ni temperatura.

## Cobertura automatizada

Archivo nuevo: tests/bot/whatsapp-multimodal.test.mts. Los números corresponden al pedido:

| Casos | Verificación |
| --- | --- |
| 1–2 | PostgreSQL local real + servicio/orquestador/domain: 20 tarjetas, 1/3 fallos; 19/17 confirmadas persistidas y 1/3 fallidas, sin rollback global |
| 3–6 | Frente/reverso misma empresa, tarjetas distintas consecutivas, reverso sin nombre por contacto/dominio, branding parecido con nombres distintos |
| 7–10 | Alfa explícita aunque Beta sea última, audio ambiguo y aclaración/respuesta, producto por nombre, este producto único |
| 11–14 | Enums y validación de BUSINESS_CARD/PRODUCT/DOCUMENT/OTHER; OTHER ilegible queda revisión en lector |
| 15–16 | Vaso y martillo: asociación por observación visual/contenido de transcripción |
| 17–18 | Tarjeta/documento/imagen genérica no confirma producto en PostgreSQL |
| 19–21 | OCR y visión coincidentes; discrepancia con retry independiente/reconciliación; discrepancia persistente con original y ambas lecturas conservados |
| 22 | PostgreSQL: frente aporta nombre, reverso email, una sola carga/proveedor confirmado; retry técnico no duplica |
| 23–24 | PostgreSQL: nombre + PRODUCT asociado confirma; nombre + BUSINESS_CARD queda draft |

Adicionales: esquema cerrado/contactos inválidos; descripción visual sin inventar comercio; escritura de audio/foto en otra carga rechazada; fallo de copia de media conserva WRITTEN y deja continuar otra tarjeta; errores determinísticos sin retry ciego; documento nativo conservado sin lectura ficticia; alias único/ambiguo; reconstrucción de grupo mantiene ID y resourceId; nombre no permite foto de otro producto; quotes de dos segmentos/productos mantienen vínculos separados; elección de frente ambiguo persiste; contacto OCR omitido por ambas lecturas queda revisión.

La suite previa de etapa 1 verifica strict Responses, gating, progreso/límites, idempotencia, completitud en creación/update y recursos ya confirmados. Se ejecutó junto con la nueva suite, sin omisiones.

## Validaciones ejecutadas

```sh
EVAL_AGENT_DATABASE_URL=postgresql://franc@127.0.0.1:15434/nihao_agent_test WHATSAPP_BURST_TEST_DATABASE_URL=postgresql://franc@127.0.0.1:15434/nihao_burst_test node --import tsx --test tests/bot/*.test.mts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
git diff --check
```

Resultado final: **349 tests aprobados, 0 fallidos, 0 omitidos**; 38 tests adicionales respecto de la suite previa (incluyendo subtests). Typecheck sin errores. Lint sin errores y cuatro warnings preexistentes en frontend (AppShell, ProductCapture, TripsClient y components/app/api.ts). git diff --check limpio. PostgreSQL fue local aislado, con migraciones ya existentes; las respuestas de proveedores IA y el envío WhatsApp se simularon. No se probaron llamadas reales a proveedores IA ni imágenes originales del cliente.

## Riesgos y pendientes

- Se requiere UAT con tarjetas/audios reales para medir lectura, agrupación y coste. Confianza 0.85 y vocabulario visual no están calibrados contra ese corpus; no se garantiza legibilidad universal ni se elimina el riesgo de errores coincidentes de OCR/visión.
- La agrupación es conservadora: dos lados UNKNOWN, logos sin identidad y nombres legales/branding divergentes pueden quedar separados o necesitar una mejor imagen/aclaración. No hay deduplicación global.
- Asociación semántica usa referencias y tokens visuales; sinónimos, audios complejos/multientidad sin segmentación fiable o contexto faltante deben aclararse. No se fuerza asociación por orden.
- Documentos nativos/PDF se conservan y quedan para revisión; parser multimodal de archivos no se implementó. El límite existente de 8 MB permanece. Si descarga falla, se conserva envelope/error, no se puede prometer un original que no se obtuvo.
- Las observaciones de tarjeta retienen dirección/texto/OCR completo, pero no se trasladan automáticamente todos los campos adicionales del candidato OCR a columnas del proveedor sin corroboración. Algunos datos pueden requerir evidencia posterior.
- Más lecturas visuales y un loop por tarjeta aumentan llamadas/latencia; el worker conserva checkpoints dentro de su ventana existente. Los lotes de productos mantienen su presupuesto existente y pueden requerir continuación; no se agregó tool batch.
- Operaciones de negocio siguen decididas por Luna dentro de las guardas. Una carga procesada acredita recibos reales, no garantiza extracción perfecta de todo hecho comercial imaginable.

Diseño, flujo, reglas de asociación y política de confirmación detallados: [arquitectura multimodal](../architecture/whatsapp-multimodal-ingestion.md).
