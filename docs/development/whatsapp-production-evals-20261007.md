# Evaluaciones de WhatsApp contra producción — 7 de octubre de 2026

Se guardaron **27 productos EVAL confirmados** en **Viaje de Pruebas**: **15 mediante el agente** y **12 mediante la API web autenticada**. Los 27 carecen de imagen. La lectura final de PostgreSQL verificó cantidades, estados, asociaciones, precios y ausencia de propuestas pendientes.

Las evaluaciones del código desplegado produjeron **23 casos aprobados y 6 fallidos, sobre 29 ejecutados**. Un intento de aprobación dependiente del caso 16 no se ejecutó porque no hubo propuesta; una corrida separada verificó satisfactoriamente propuesta y aprobación explícita. Los 12 POST de la API web devolvieron 201 y se contabilizan aparte de los casos del agente.

## Entorno y alcance

- Cuenta: `fvelazquez@brocosolutions.com`; autenticación y pertenencia al viaje verificadas.
- Viaje: `60e57ace-136b-4604-b3e1-a44f0a1e1e32`, empresa Broco Solutions.
- Código evaluado: `c30d278401c9935fc98ae8afb753c2b6609175c1`, exportado mediante `git archive` a una carpeta aislada. No se incluyeron cambios locales del agente encontrados durante la sesión.
- Modelo y razonamiento del deploy: `gpt-5.6-luna`, `medium`; claves de los proveedores de producción, PostgreSQL de producción y almacenamiento R2 reales.
- Se utilizaron nueve archivos distintos de `/Users/franc/Downloads/Tarjetas_Nuevas`: tarjeta individual, reenvío, frente/reverso, batch de seis tarjetas y tarjetas acompañadas de mensajes. La carpeta contiene 34 archivos; no se certificaron los 34 contra el commit desplegado.
- La recepción de mensajes y descarga de medios se inyectaron desde archivos locales. Las respuestas se capturaron; **no se enviaron a un teléfono por Evolution**. Las filas de outbox `SENT` de los namespaces EVAL representan entrega al capturador de la evaluación.
- El catálogo y las escrituras se limitaron al viaje autorizado. Las actualizaciones se limitaron a productos EVAL creados por esta sesión. Los namespaces `production-eval-*` mantuvieron estas conversaciones separadas del canal real.
- El cliente remoto de Prisma utilizó un timeout transaccional de 60 segundos. Los tiempos de ejecución incluyen la latencia de acceso desde esta máquina; no constituyen una medición de rendimiento del servicio Railway.

## Casos aprobados

| Caso | Resultado verificado |
| --- | --- |
| Tarjeta WATERSY y reenvío | Ambas resolvieron el mismo proveedor existente, sin recrearlo. |
| Batch de seis tarjetas | Seis resultados y cierre “Todo listo”, sin pregunta adicional genérica. |
| Proveedor nuevo por texto | Se creó el proveedor ficticio `Nihao Proveedor EVAL-…`. |
| Dos productos en un mensaje, sin foto ni FOB | Ambos persistieron como CONFIRMED. |
| Dos mensajes de productos en un batch | Ambos productos persistieron por separado. |
| Pares con FOB y MOQ diferentes | Los pares 1 y 2 conservaron los valores de cada producto. |
| Referencia explícita después de una tarjeta de otro proveedor | La botella quedó asociada a WATERSY. |
| Producto individual sin foto ni FOB | Persistió como CONFIRMED. |
| Cita de un mensaje de contexto con dos productos | Mantel y sorbetes persistieron por separado. |
| Proveedor explícito inexistente | Aclaración pendiente; no se creó un producto para otro proveedor. |
| Proveedor omitido y respuesta numérica | La respuesta retomó el mismo burst y creó el producto para la opción elegida. |
| Proveedores homónimos | Se pidió una decisión sin elegir arbitrariamente ni crear el producto. |
| Búsqueda fuzzy `WATERSI` | Se pidió selección; después de la respuesta numérica se creó para WATERSY. |
| Cambio de FOB con aprobación | El producto conservó USD 3 antes de aprobar y pasó a USD 6 después de `sí`. |
| Cancelación de propuesta | El FOB de los vasos siguió siendo null después de cancelar la propuesta de USD 9. |
| Idempotencia del mismo ID | Una sola fila de mensaje, revisión 1 antes y después. |

## Fallos reproducidos con el código desplegado

| Caso | Entrada / resultado | Evidencia |
| --- | --- | --- |
| Frente y reverso YKO | El reverso de la tarjeta fue clasificado como PRODUCT. El resultado incluyó una tarjeta sin nombre y una pregunta para asociar “el producto de la caja”. | `f9510158-6f35-456e-8cc4-28097e2d4dc8` |
| Tres productos con condiciones distintas en un solo mensaje | No se crearon. El agente intentó cerrar; backend devolvió UNFINISHED_OPERATION. Luego intentó opciones de acción inválidas y recibió INVALID_OPTIONS. | `4544a981-009f-43fb-a611-2b459f26b4c1` |
| Producto en respuesta a una tarjeta citada | Sólo se procesó el proveedor. La respuesta dijo “Todo listo” aunque el producto solicitado no fue creado. No hubo llamadas del orchestrator para ese producto. | `28d5eb55-cdb4-4b2e-bc69-90ce649fffe7` |
| Proveedor del producto reciente | Se encontró la bandeja y su proveedor WATERSY, y se prepararon FACTS y CONTEXT. No se creó el nuevo producto; la respuesta afirmó que la creación no estaba disponible. | `795cdbc9-bd6e-4abe-a02f-a2e396b57c78` |
| Propuesta para servilletas | Se encontró el producto confirmado y se prepararon FACTS. No se llamó a update_product; terminó en aclaración, sin propuesta. También aparecieron UNFINISHED_OPERATION e INVALID_OPTIONS. | `930b47cb-0851-42ec-b995-a8eddd0ee5b4` |
| Tercer par de mensajes independientes | No se crearon cubiertos ni botella. Se prepararon FACTS y se había encontrado WATERSY, pero el agente terminó preguntando nuevamente por el proveedor. | `06b5510c-409b-4acc-96ae-00aef5bfdd91` |

No se cambiaron reglas, schemas, prompts ni expected behavior para convertir estos fallos en aprobados. Las afirmaciones del modelo sobre disponibilidad de tools no prueban un fallo de permisos ni de cache; la causa de esas decisiones requiere una investigación adicional.

## Productos persistidos

| Corrida | Vía | Productos confirmados |
| --- | --- | ---: |
| `EVAL-2026-10-07-ad32dde9` | Agente, prueba individual | 1 |
| `EVAL-2026-10-07-14906c93` | Agente, batches y referencias | 9 |
| `EVAL-2026-10-07-de05355d` | Agente, pares de mensajes | 4 |
| `EVAL-2026-10-07-c8b91a6f` | Agente, selección fuzzy | 1 |
| `EVAL-WEB-2026-10-07-b984b745` | API web autenticada | 12 |
| **Total** | | **27** |

Los nombres contienen la marca EVAL y los datos comerciales son ficticios. Permanecen en el viaje para revisión. Las corridas individuales y de batches que no alcanzaron el mínimo de productos configurado en su propio runner emitieron un error de mínimo; no se descartó ese resultado. El requisito global de al menos diez productos sí quedó satisfecho y verificado, incluso contando únicamente el agente.

## Corridas excluidas de la evaluación del deploy

Las corridas iniciales se separaron del resultado principal:

- `07648da4`: clave OpenAI local sin saldo; no demuestra un problema de la clave de producción.
- `660f5033`: errores de infraestructura/persistencia del cliente remoto.
- `e2a535d0`: recorrido inicial de los 34 archivos con un árbol de trabajo que incluía cambios locales del agente. Sus resultados no certifican el código publicado.
- `e2d0a6ab`: prueba de producto con ese mismo árbol modificado.

Las capturas y proveedores escritos durante la preparación permanecen en el viaje autorizado, incluidos registros similares/duplicados que requieren revisión. No se borraron ni fusionaron proveedores reales o de prueba. La pregunta genérica observada después de un batch en la corrida modificada **no** volvió a aparecer en el batch equivalente del commit desplegado.

## Validación y artefactos

- Suite del commit aislado: **452 aprobados, 21 omitidos, 0 fallidos**. El primer intento encontró un test que requiere metadata Git; después de inicializar un repositorio temporal en la exportación, la suite completa pasó.
- Typecheck del commit aislado y del workspace: aprobado.
- Lint del commit aislado: 0 errores y 3 warnings preexistentes. Los scripts `.mts` están excluidos por la configuración de lint del repositorio.
- `git diff --check`: aprobado.
- Resumen privado verificable de la corrida (artefacto local ignorado, no disponible en este checkout): `replay-output/production-eval-20261007-summary.json`.
- Cada corrida posee `report.json`, estados en cada revisión, estados finales, respuestas y errores de tools dentro de `replay-output/<runId>/`. Los reportes son privados y están ignorados por Git.
- Runner: [production-cards-eval.mts](../../scripts/production-cards-eval.mts); verificaciones: [production-eval-idempotency.mts](../../scripts/production-eval-idempotency.mts) y [production-eval-assess.mts](../../scripts/production-eval-assess.mts).
- La API autenticada final devolvió 200 y mostró los 26 productos EVAL asociados a WATERSY; el producto de la selección numérica pertenece al proveedor elegido en esa prueba. Se cerraron 17 workflows simulados pendientes de las corridas de esta sesión, conservando los checkpoints, recursos, evidencias y receipts. No quedan workflows EVAL activos ni propuestas pendientes de estas corridas.

El runner exige `PRODUCTION_EVAL='Viaje de Pruebas'`. Los modos usados fueron `CARDS_EDGE_ONLY=1`, `PRODUCTS_ONLY=1` (prueba individual), `2` (batches/referencias), `3` (pares/proveedor nuevo), `4` (homónimos/fuzzy) y `5` (aprobación sobre un producto de esta sesión). Para repetirlos, hay que ejecutar contra una exportación del commit publicado, con sus dependencias y credenciales de producción; `PRODUCTION_SOURCE_COMMIT` registra la procedencia. No ejecutar estos scripts desde un árbol con cambios de negocio no publicados.

No se ejercitaron audio real, documentos, firma del webhook ni entrega real de mensajes/listas por Evolution. Tampoco se certificó el procesamiento de las 34 tarjetas con el deploy. No hubo push, deploy ni modificación del código de negocio por esta tarea.

## Alcance aclarado el 8 de octubre

El usuario confirmó que las tarjetas se enviarán como imágenes individuales, sin frente y reverso. El caso YKO de frente/reverso queda conservado como evidencia histórica de esta corrida, pero se excluye del criterio de aceptación y de los evals futuros del flujo previsto. El runner usa una sola imagen en ese paso por defecto; el replay histórico requiere `EVAL_FRONT_BACK=1` explícito. Esta aclaración no altera los resultados históricos ni modifica el clasificador o la agrupación del backend.
