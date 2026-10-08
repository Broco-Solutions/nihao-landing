# Auditoría de tarjeta con condiciones y cámara con imagen — 2026-10-08

## Alcance y evidencia

Auditoría solicitada para los mensajes reales de `fvelazquez@brocosolutions.com`, número `+5493416049145`, instancia `nihao`, viaje `Viaje De Pruebas`. Código desplegado: `847cc1a31eaa0221fbe8c8c85225c34ba0aed4d3`.

Se consultaron PostgreSQL mediante transacciones `READ ONLY`, estados/checkpoints del agente, operaciones durables, respuestas enviadas, adjuntos, productos y foco persistente. Se contrastaron 349 entradas de logs de Railway entre 03:25 y 03:29 UTC y se reprodujeron las validaciones con lecturas originales ya guardadas, sin llamar a modelos ni escribir en producción. Dos subagentes revisaron por separado ingesta/persistencia y resolución de contexto.

Los horarios de este informe son UTC según los logs y el envelope original. Las columnas Prisma son timestamps sin zona; la lectura inicial con `pg` en esta máquina los convirtió con un desplazamiento de tres horas. Los mensajes ocurrieron a las 00:25 y 00:27 de Argentina, no a las 03:25 y 03:27 informadas inicialmente.

| Evento | UTC | Identificador |
| --- | --- | --- |
| Tarjeta con `FOB 50 MOQ 15000` | 03:25:40 | mensaje `d0f45a0b-4d85-4930-bfb9-cf90d107fcc6` |
| Tarjeta finalizada | 03:26:19 | ráfaga `3f1ec11c-67da-46e2-99d0-aae98026a60d` |
| Cámara con `Camara con usb` | 03:27:48 | mensaje `102ea6dc-c91f-4b97-85a4-d39399409ac8` |
| Cámara con aclaración pendiente | 03:28:29 | ráfaga `adeeb78b-9aa7-436d-8fc5-fdf33848a2b5` |

Son dos ráfagas distintas, separadas por más de dos minutos. No fueron un batch compartido.

## 1. La cámara se reconoció bien; falló la referencia de evidencia

La lectura persistida es `PRODUCT`, confianza `0.98`, legibilidad `readable`, `imageKind=PRODUCT_IMAGE`, `productImageVerified=true`. El grafo identifica `IMAGE_OF` con confianza `HIGH`. El texto factual es `chouze\nCamara con usb`. La imagen fue descargada y conservada.

La secuencia real de tools fue:

1. `search_products`, query `chouze Camara con usb`, proveedor `was_cfe05afcaf83af0db1d152bc91c5c1f30c4f858f` (YKO recién cargado). Sin resultados.
2. `prepare_evidence` con **messageId de la tarjeta anterior** `d0f45a0b...` y quote **de la cámara** `chouze\nCamara con usb`.
3. Backend devuelve `ASSET_NEEDS_REVIEW`.
4. `ask_clarification` con nombre `chouze / Cámara con USB`: backend devuelve `UNGROUNDED_NAME` por no ser una cita literal.
5. `ask_clarification` corregido a `Camara con usb`: pregunta si se puede confirmar nombre e intención porque supuestamente la imagen no permite lectura/asociación.

No hubo llamada `create_product_draft`, `get_supplier` ni `resolve_recent_reference` en ese turno. No se creó ningún `SupplierProduct` para la cámara.

En `agent-tools.ts:106`, `!asset`, mala calidad y enlaces ambiguos comparten error `ASSET_NEEDS_REVIEW` y la instrucción «pedí aclaración». Aquí fue **un ID ausente en el grafo actual**, no una imagen ilegible. El error encaminó al agente a pedir al usuario resolver un problema interno.

La reproducción usa la misma imagen/lectura/cita: con el ID histórico reproduce `ASSET_NEEDS_REVIEW`; cambiando únicamente a `102ea6dc...` prepara FACTS correctamente. Esto descarta la calidad visual como causa de este bloqueo.

El registro demuestra el argumento equivocado, pero no explica con certeza por qué el modelo seleccionó ese ID. No hay una traza legible de su razonamiento interno. El problema comprobable es la selección del ID y una validación que reporta mal la causa y no facilita su recuperación.

Referencias: [preparación de evidencia](../../lib/channels/whatsapp/agent-tools.ts), [composición del input](../../lib/channels/whatsapp/agent-orchestrator.ts).

## 2. El proveedor vacío lo creó el fallback del backend

Después de la aclaración, `agent-service.ts:131–140` recorre toda carga con imagen sin `resourceId`, sin excluir `PRODUCT`, y llama `persistImageLoad`.

`prisma-agent-domain.ts:312–342` siempre implementa esa preservación mediante `create_supplier_draft`. `capture-evidence.ts:25–27` transforma una imagen sin tarjeta en una extracción vacía, aunque el lector sí haya reconocido un producto y su comentario.

Resultado real:

- `SupplierCapture` `wac_waauto_4a2a8c2e30ac2df89cb1d09f775f001490570236`.
- Estado `DRAFT`, nombre `null`, `sourceText=""`, notes y condiciones comerciales `null`.
- No existe una fila `Supplier` confirmada para esa captura. La respuesta «1 proveedor cargado» incluye capturas borrador y no equivale a proveedor confirmado.
- Adjunto `waea_42af948d713b9905bd078fb18e512c50120fa735`, tipo `PRODUCT_IMAGE`, asociado a esa captura vacía; **`productId=null`**.

`completeMedia` en `prisma-agent-domain.ts:652` determina si debe enlazar el adjunto al producto según el nombre de la operación (`input.tool.includes("product")`). Como el fallback emitió `create_supplier_draft`, nunca ejecutó el enlace de `productId` de líneas 670–672. Ésta es la causa puntual de la foto sin asociación a un producto.

El guard conversacional que impide crear un proveedor sustituto no corre: el servicio invoca directamente el dominio, sin pasar por `AgentTools.execute`.

Hay dos efectos secundarios comprobados:

1. `recordLoadReceipt` en `evidence-grouping.ts:260` acepta `preservedImageLoad=true` y marca una carga `PRODUCT` como `PROCESSED` con el ID de una captura de proveedor.
2. `advanceFocus` en `conversation-context.ts:35–37` considera ese receipt una creación de proveedor, reemplaza YKO por el borrador vacío y limpia los productos candidatos. La fila actual `WhatsAppAgentContext` confirma ese foco incorrecto.

Por eso las métricas dicen «1 asset completado, 0 needs_review» aunque el producto no existe y el turno queda `WAITING`. Guardar el original se confundió con completar la operación de negocio.

Referencias: [servicio](../../lib/channels/whatsapp/agent-service.ts), [dominio](../../lib/channels/whatsapp/prisma-agent-domain.ts), [evidencia de captura](../../lib/channels/whatsapp/capture-evidence.ts), [grafo](../../lib/channels/whatsapp/evidence-grouping.ts), [foco](../../lib/channels/whatsapp/conversation-context.ts), [respuesta](../../lib/channels/whatsapp/clarification-rendering.ts).

## 3. El comentario comercial llegó, pero no tiene representación persistible

`FOB 50 MOQ 15000` está en `envelope.text` y en la provenance original. No se perdió el mensaje.

El lector ejecutó `caption_extraction`; guardó exactamente:

```json
{"products":[],"supplierNotes":null,"supplierReference":null}
```

El contrato de `reading-enrichment.ts:7,19` sólo permite FOB/MOQ/plazo dentro de `products`, con un `name` obligatorio y literal. El prompt de línea 20 además dice que FOB/MOQ/plazo no se dupliquen en notas. El comentario contiene condiciones comerciales pero no identifica un producto; no hay campo para condiciones todavía sin destino.

`persistCaptions` en `prisma-agent-domain.ts:345–380` guarda sólo `supplierNotes` o productos extraídos. No detecta que quedaron números comerciales sin consumir, no los preserva como facts pendientes y no pregunta a qué corresponden. `captureEvidence` usa la tarjeta/OCR y `captureNotes` no incorpora el comentario bruto cuando `supplierNotes=null`.

La tarjeta se procesó por la ruta automática, sin loop conversacional (`rounds=0`). Una imagen con caption sigue siendo un único asset IMAGE; el bypass de `agent-service.ts:79` sólo detecta assets separados de otros tipos. El modelo conversacional no tuvo oportunidad de recuperar las condiciones ni aclararlas.

Verificación de ficha YKO y captura: `fobAmount=null`, `fobCurrency=null`, `fobRawText=null`, `moqQuantity=null`, `moqRawText=null`. Sus notas contienen información literal de la tarjeta, pero no el comentario comercial. No hubo operaciones `wacaption_...` en la ráfaga.

No puede afirmarse desde estos mensajes que las condiciones pertenecen a la cámara posterior. El sistema actual conserva identidad del proveedor entre ráfagas, pero no traslada facts comerciales históricos a un producto nuevo. Tampoco aparece moneda en `FOB 50`: no debe inventarse USD.

Referencias: [extracción de caption](../../lib/channels/whatsapp/reading-enrichment.ts), [persistencia de captions](../../lib/channels/whatsapp/prisma-agent-domain.ts), [notas de captura](../../lib/channels/whatsapp/capture-evidence.ts).

## 4. Proveedor más próximo: ya hay regla, pero falta proteger su aplicación

El prompt ya indica: «Tras cargar un proveedor, un producto nuevo pertenece a ese proveedor salvo otro destino explícito» (`agent-orchestrator.ts:28`). Hay asociación dentro de la ráfaga, foco persistente entre ráfagas y respaldo de las diez conversaciones recientes.

En este caso el agente usó el YKO correcto al buscar productos. No faltó memoria del proveedor; la preparación de evidencia falló después. Aumentar memoria o repetir instrucciones en el prompt no corrige la causa.

El dominio exige FACTS y un proveedor efectivamente consultado/resuelto antes de ofrecer `create_product_draft`. Como la preparación falló, no se habilitó una creación válida. Una implementación robusta debe garantizar el proveedor previo válido por orden original de conversación, con referencias explícitas/citas y contexto autorizado por delante; no depender sólo de que el modelo elija bien.

El fallback además dañó el foco que debería cumplir esa regla para próximos mensajes. Preservar un medio técnico no debe convertirse en un cambio de proveedor activo.

## 5. Hallazgo adicional: duplicación de YKO

Antes de la tarjeta nueva ya había dos proveedores confirmados YKO en el mismo viaje, con el mismo email y teléfonos, no eliminados. La operación registró ambos como `possibleSuppliers`, pero creó una tercera ficha confirmada, `was_cfe05afcaf83af0db1d152bc91c5c1f30c4f858f`.

La lectura conservó `uncertainFields:["phones"]`, aunque OCR/visión coinciden en nombre/email y `disagreements=[]`. `burst-reader.ts:101` requiere que no haya campos inciertos para despejar revisión. `resolveExistingSupplier` en `prisma-agent-domain.ts:388` excluye cargas `NEEDS_REVIEW`, y el fallback crea la captura. Después la regla de nombre+contacto confirma el proveedor. También hay dos coincidencias existentes, por lo que elegir una automáticamente requeriría resolver duplicados o selección; no corresponde ocultar esa ambigüedad creando otra ficha.

La calidad de un teléfono secundario, la identidad del proveedor y la confirmabilidad no están coordinadas en esas rutas. No causó directamente el bloqueo de la cámara, pero sí permite duplicados y ensucia el contexto.

## Logs y reproducción

Las 349 entradas consultadas no incluyen errores de infraestructura; las llamadas registradas a proveedores de IA respondieron 200. Los logs finales confirman:

- Tarjeta: `rounds=0`, `operationCount=1`, `pending=false`, `terminationReason=completed`.
- Cámara: `rounds=4`, `operationCount=1`, `pending=true`, `terminationReason=asked_clarification`.

Los errores de tools son errores recuperables persistidos en `state.agent.history/calls`, no necesariamente excepciones de runtime. La ausencia de errores HTTP no indica que se haya creado el producto.

Harness temporal de lectura, `/tmp/nihao-camera-audit-repro.mts`: seis comprobaciones determinísticas aprobadas, sin modelos, base de datos ni almacenamiento remoto: ID histórico rechazado con el código engañoso; ID de cámara aceptado; texto válido descartado por ruta de captura; carga producto completada por receipt proveedor; foco válido reemplazado; caption ausente de las notas/productos extraídos. No se afirma un replay completo de modelos reales ni se cambió el comportamiento esperado de tests existentes.

## Soluciones propuestas, por prioridad

1. **Distinguir ID inválido de mala calidad.** `prepare_evidence` debe devolver `UNKNOWN_MESSAGE_ID`/`INVALID_REFERENCE` con IDs válidos actuales y una instrucción de reintento, sin trasladar el error al usuario. Se puede limitar el schema dinámico a IDs actuales. No remapear un ID silenciosamente por proximidad.
2. **Separar preservación de medios de creación de proveedor.** El fallback de imágenes de producto nunca debe crear `SupplierCapture` vacío como proveedor nuevo. Producto con nombre explícito y destino resuelto: crear `SupplierProduct` y enlazar su foto. Sin destino/decisión: mantener evidencia pendiente, sin sustitutos. Agregar guard también dentro del dominio.
3. **Garantizar correspondencia entre carga y recurso.** Una carga PRODUCT sólo se completa con un producto real; un receipt de preservación de original no puede marcarla PROCESSED ni modificar el foco de proveedor. Respuestas y métricas deben distinguir original conservado de recurso registrado.
4. **Resolver proveedor implícito de manera determinística.** Usar el proveedor válido inmediatamente anterior por orden original, respetando usuario/instancia/teléfono/viaje/empresa, autorización y referencias explícitas. Evitar que finalización concurrente de workers o capturas técnicas cambien ese orden. Si nunca se cargó uno válido, preguntar. El caso concreto debe producir cámara bajo YKO.
5. **Conservar condiciones sin producto identificado.** Extender la extracción con facts comerciales pendientes y texto literal/provenance, o conservar el comentario como observación sin asignación comercial. Nunca descartarlo por devolver una lista vacía. Preguntar a qué producto corresponde o mantener una decisión explícita pendiente. Si se quiere aplicar al próximo producto automáticamente, esa política debe definirse e implementarse: no es la política actual.
6. **Resolver identidad por evidencia fuerte y tratar duplicados.** Un teléfono incierto no debería bloquear por completo nombre+email concordantes. Ante dos fichas con la misma identidad, pedir selección o resolver duplicados mediante un proceso específico; no crear una tercera automáticamente.

Pruebas de regresión necesarias: tarjeta con condiciones sin producto → cámara en otra ráfaga; ID histórico erróneo → recuperación con ID actual; producto nombrado confirmado sin FOB y con foto enlazada; error de preparación → ningún proveedor ficticio; invariant PRODUCT→SupplierProduct; foco anterior preservado durante conservación de medios; dos proveedores y workers fuera de orden → último cronológico correcto; referencia explícita desconocida → sin fallback silencioso; condiciones sin moneda → sin USD inventado; duplicados YKO → no tercera ficha.

No se modificó código funcional, no se corrigieron registros, no se enviaron mensajes y no se realizó push ni deploy en esta auditoría.
