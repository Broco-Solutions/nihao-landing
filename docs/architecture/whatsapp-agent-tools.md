# WhatsApp: orquestador con tools (v3)

Implementación v3. La bandera `WHATSAPP_AGENT_TOOLS_ENABLED=false` elige el motor para conversaciones nuevas; las versiones persistidas mantienen su procesador. Requiere las migraciones de ráfagas/productos y `20261002160000_whatsapp_tool_agent`. La activación requiere validar migraciones, código y funcionamiento del entorno; el UAT físico se registra aparte.

## Experiencia y capacidades

Conserva el cierre de ráfaga a los 20 segundos de silencio o con `listo`. Primero lee todos los mensajes y conserva originales, OCR, descripción visual, transcripción y extracción. Luego un agente usa tools para resolver el pedido, en lugar de devolver un único plan JSON.

Permite consultar proveedores y productos, cargar borradores y corregir registros. Un proveedor nuevo y sus productos se guardan juntos como borradores. Corregir un borrador no lo confirma. La confirmación de nuevos proveedores y productos sigue exclusivamente en la web. No ofrece eliminaciones, traslados de productos ni cambios de viaje/empresa.

Editar un registro confirmado genera una propuesta con valores anteriores/nuevos. La respuesta se persiste en el outbox; sólo después de enviarse admite un nuevo mensaje textual autónomo `sí`, `confirmar` o `confirmo`. `no` o `cancelar` cancela. El contenido citado, OCR y propuestas del propio modelo no pueden aprobar. La aprobación caduca a las 24 horas y sólo corresponde a esa propuesta. Si hubo otros mensajes intermedios o cambió el registro, se requiere una nueva propuesta/aprobación. Aprobar una edición no confirma borradores.

Se recuerda el contexto de operaciones pendientes y se dispone de memoria estructurada de las últimas cinco conversaciones v3 terminadas durante las últimas 24 horas, aislada por usuario, teléfono e instancia. Homónimos generan opciones con IDs y numeración persistidos; si el modelo omite opciones para una búsqueda ambigua identificada, el servidor las recupera de esos resultados, con empresa y ciudad; el servidor interpreta la selección numérica. Una coincidencia única determina la empresa del proveedor. Las búsquedas y escrituras se limitan a viajeros de viajes activos/planificados y empresas activas con membresía; se revalidan permisos antes de cada acción.

## Componentes y contratos

- `agent-contract.ts`: schemas cerrados, estado tipado, evidencias, resultados, errores y contrato de dominio.
- `agent-memory.ts`: límites de memoria, resúmenes y resolución de referencias recientes.
- `agent-orchestrator.ts`: prompts exportados `WHATSAPP_AGENT_PROMPT` y `WHATSAPP_AGENT_MEMORY_PROMPT`, ciclo Mistral, historial recuperable y límite de 12 rondas por revisión.
- `agent-tools.ts`: validación de llamadas, citas literales, selección, preguntas y resúmenes de recibos.
- `prisma-agent-domain.ts`: consultas autorizadas, escritura transaccional, propuestas, aprobación y recuperación de adjuntos.
- `agent-service.ts` y `agent-composition.ts`: lectura completa, checkpoints, worker y dependencias reales.
- `durable-routing.ts`: selección de versión para nuevas conversaciones y drenaje de v2/v3 persistidas.

El modelo del orquestador se configura mediante `WHATSAPP_AGENT_MODEL`, por defecto `mistral-small-2603`. OCR, visión y transcripción mantienen los modelos existentes. Tool calling usa el cliente HTTP actual; no incorpora SDK de agentes ni acceso SQL del modelo. Las llamadas son secuenciales, con timeout de 30 segundos y checkpoints dentro de la ventana de 220 segundos del worker. Al agotar rondas, conserva las operaciones terminadas y espera `reintentar` para lo pendiente.

Tools: `get_context`, `resolve_recent_reference`, `search_suppliers`, `get_supplier`, `search_products`, `get_product`, `prepare_evidence`, `create_supplier_draft`, `create_product_draft`, `update_supplier`, `update_product`, `apply_pending_change`, `cancel_pending_change`, `ask_clarification` y `finish_turn`. Los errores de argumentos, citas y negocio se devuelven al modelo para corregir; errores de infraestructura conservan el checkpoint y reintentan.

## Memoria reciente

`agent-memory.ts` deriva resúmenes de los estados ya persistidos; no requiere una migración ni una llamada adicional a un modelo para resumir. `PrismaAgentDomain.recentMemory` lee como máximo las cinco conversaciones `DONE` v3 más recientes del mismo usuario, teléfono e instancia, completadas hace menos de 24 horas. Una conversación `WAITING` sigue usando su contexto pendiente y no se considera terminada. Las 24 horas limitan el contexto disponible, no borran el historial almacenado.

El resumen incluye fecha, referencias a proveedores/productos (IDs, nombres, viaje, empresa y estado actual) y operaciones completadas. No incluye mensajes históricos, precios, condiciones comerciales, evidencias, propuestas ni aprobaciones. Se conservan hasta diez referencias directas por conversación y los proveedores de los productos referidos. Las búsquedas ambiguas no convierten todos sus resultados en contexto. Cada referencia se vuelve a consultar y autorizar; registros inexistentes o con permisos revocados se omiten. Si un proveedor borrador fue confirmado en la web, se resuelve su ID de proveedor actual por `captureId`.

`get_context` entrega los resúmenes; si no hay historial reciente conserva la respuesta habitual de contexto. El prompt adicional de memoria y su tool sólo se ofrecen al modelo cuando los mensajes actuales contienen una referencia al contexto anterior, para mantener el recorrido de los pedidos explícitos. `resolve_recent_reference` resuelve expresiones como «agregale», «el mismo proveedor» o «el último producto» y devuelve registros actuales autorizados. Una referencia genérica exige un único destino entre las cinco conversaciones; «último/de recién/anterior» restringe a la conversación relevante más reciente, pero pregunta si allí hay varios registros posibles. Empresa y viaje mencionados restringen candidatos. Un proveedor nombrado explícitamente se busca por el pedido actual; la memoria no sustituye una búsqueda sin coincidencias. Una pregunta pendiente tiene prioridad.

La creación de productos y las ediciones por referencia reciente revalidan el destino en el servidor antes de escribir: el modelo no puede seleccionar arbitrariamente una de varias referencias. Las aclaraciones usan opciones persistidas y selección numérica igual que los homónimos. Los nuevos campos comerciales salen sólo de las evidencias de la conversación actual. Consultas y ediciones vuelven a leer los registros; las aprobaciones de confirmados siguen siendo nuevas respuestas explícitas a la propuesta actual.

Evals nuevas: WA26 continuidad entre conversaciones, WA27 edición del último producto, WA28 vencimiento de memoria, WA29 referencia ambigua y WA30 destino explícito diferente. WA21 conserva la comprobación de no heredar destino fuera de la ventana de memoria: la conversación anterior se fecha 25 horas atrás. Los reportes históricos y sus mensajes no se modifican.

## Evidencias y operaciones

`prepare_evidence` convierte citas verificadas en IDs estables con mensaje original, posiciones y rol. `FACTS` aporta campos propios del registro; `CONTEXT` aporta referencias de proveedor/empresa y puede compartirse. No permite una frase que describe varios productos como los hechos de uno solo. Las condiciones comerciales se extraen por fragmento. Las observaciones visuales sólo ayudan a asociar, no justifican datos comerciales.

Una creación deriva datos de la evidencia; el modelo no puede enviar precios arbitrarios. El servidor valida destinos, nombres literales y asignaciones. Los fragmentos comerciales no se reutilizan para crear productos diferentes. Las fotos referidas explícitamente dentro de una carga deben incluirse antes de escribir. Cláusulas que piden inventar datos o ignorar reglas no se procesan como condiciones comerciales.

`WhatsAppAgentOperation` guarda identidad estable, revisión, tool, argumentos, resultado, estado, expiración, revisión del resumen y mensaje de aprobación. La mutación y el recibo se registran en una transacción, bajo el lock de la conversación y comprobación de revisión/lease. Un mensaje nuevo anterior a esa reserva obliga a reconsiderar; operaciones ya escritas conservan su identidad.

Estados de operaciones: `WRITTEN` mientras faltan adjuntos, `COMPLETED`, `PROPOSED`, `CANCELLED`, `STALE` y `EXPIRED`. Los originales y copias de adjuntos son recuperables e idempotentes. Los resúmenes de guardado se construyen a partir de recibos completados. El estado JSON conserva las preguntas, opciones, fragmentos, historial y fin de turno; un reinicio retoma una llamada o finalización checkpointed.

Las tools reutilizan validaciones de productos y correcciones de capturas. La edición del proveedor confirmado usa el servicio compartido con la web. Las ediciones son parciales: omitidos se conservan y vaciar requiere pedido explícito. La carga v3 desactiva la creación implícita de productos del repositorio: cada producto pasa por su tool. Los productos de proveedores nuevos usan `captureId`, `supplierId=null` y `DRAFT`; confirmar el proveedor en la web les vincula `supplierId`, sin confirmar los productos.

## Pruebas, evals y rollout

Las pruebas determinísticas comprueban schemas, referencias, aprobación textual, corrección de errores y límites. Las pruebas PostgreSQL requieren `EVAL_AGENT_DATABASE_URL` apuntando exclusivamente a `localhost`/`127.0.0.1` y `/nihao_agent_test`; nunca usar una base de proyecto.

```bash
EVAL_AGENT_DATABASE_URL=postgresql://postgres:agent-local-test@127.0.0.1:15434/nihao_agent_test \
  pnpm test
EVAL_AGENT_DATABASE_URL=postgresql://postgres:agent-local-test@127.0.0.1:15434/nihao_agent_test \
  pnpm eval:whatsapp-agent -- --runs 3
```

La suite real reutiliza los 12 fixtures originales sin cambiar sus expectativas de negocio y agrega 13 escenarios de consulta, productos de proveedor nuevo, correcciones, aprobación/cancelación, conflicto, expiración, contexto nuevo e instrucciones maliciosas. Evalúa registros PostgreSQL reales y conversaciones; limpia los datos sintéticos al finalizar. OCR real sobre foto local; audios con transcripts literales, **sin Voxtral/UAT**. Reportes privados en `test-data-private/eval-reports/` con usage real, hashes previos a la ejecución y resultados por caso. Los rechazos corregidos de tools se conservan en las trazas; no se confunden con errores terminales de ejecución.

Activación habitual: aplicar migraciones aditivas y desplegar con flag apagado en staging; habilitar allí en backend/worker; validar teléfono, ráfagas en modo avión, audio real y modificaciones con aprobación. Sólo con aceptación funcional autorizar producción. Apagar la bandera detiene nuevas conversaciones v3; el worker continúa drenando las persistidas. No borrar tablas ni cambiar de procesador una operación pendiente. Evolution conserva la limitación de posible reenvío externo si ocurre un crash entre enviar y registrar `SENT`.

### Validación local del 2 de octubre de 2026

Build de Next, TypeScript y validación Prisma aprobados. Lint sin errores, con cuatro advertencias previas. Suite completa con las bases aisladas v2/v3: 223 pruebas aprobadas, sin fallos ni omisiones. Incluye interrupción antes de finalizar, recuperación sin repetir modelo/escrituras, aprobación, cancelación, conflicto, expiración, copia recuperable de adjuntos y permisos revocados.

La ejecución `whatsapp-agent-stability-20261002` obtuvo 72/75 PASS, tres FAIL y cero ERROR/alucinaciones críticas. Se corrigieron sus tres recorridos: IDs de empresa usados como proveedores, contexto complementario omitido entre mensajes y consulta sin `finish_turn.response`. Las pruebas originales conservaron sus expectativas. La validación real posterior se registra por separado; no se reemplazan los reportes históricos.

`whatsapp-agent-final-20261002` obtuvo 72 PASS, un FAIL de homónimos y dos ERROR por timeout de Mistral. Se corrigió la pregunta sin opciones persistidas. La eval registra hasta dos reanudaciones por timeout, HTTP 429 o 502/503/504, conservando historial/recibos; espera 30 segundos ante esos errores HTTP y espacia las solicitudes un mínimo de 1,2 segundos; nunca reintenta un FAIL funcional ni un error de negocio para obtener un PASS. Este comportamiento representa la recuperación del worker, no una única solicitud HTTP exitosa.

La selección numérica se resuelve por el ID de las opciones persistidas, incluso si el modelo intenta buscar el nombre de la empresa. No se permite repetir la misma pregunta una vez elegida una opción válida.

`whatsapp-agent-acceptance-20261002`: 65 PASS, un FAIL en la búsqueda posterior a selección y nueve ERROR HTTP 429. `whatsapp-agent-release-20261002`: 57 PASS, cero FAIL y 18 ERROR HTTP 429 durante ejecución en paralelo; sus dos últimas repeticiones fueron 25/25. El límite externo motivó ejecutar la aceptación final en una única suite con solicitudes espaciadas y reanudación explícitamente registrada.

### Aceptación y publicación

`whatsapp-agent-production-gate-20261002`: **75/75 PASS** (25 casos × 3), cero FAIL/ERROR y cero alucinaciones críticas; no necesitó reanudaciones de infraestructura. Los 27 hashes de fuentes y fixtures coincidieron antes de publicar. Build, TypeScript, Prisma y 223 pruebas aprobados; lint con cero errores y cuatro advertencias previas. La configuración productiva habilita `WHATSAPP_AGENT_TOOLS_ENABLED=true`, usa `mistral-small-2603` y deja `WHATSAPP_BURSTS_ENABLED=false` para nuevas conversaciones. Las v2 ya persistidas siguen drenándose. El release de `main` publica frontend/backend y aplica las tres migraciones aditivas hasta completar 22. UAT físico con WhatsApp/audio real permanece pendiente.

### Memoria reciente — validación del 4 de octubre de 2026

237 pruebas automáticas aprobadas con PostgreSQL aislado v2/v3, sin omisiones; build y TypeScript aprobados y lint de los archivos modificados sin errores. La primera suite ampliada obtuvo 25/30 PASS; al limitar las instrucciones de memoria a referencias al contexto pasó a 29/30, con un fallo en WP06 por pregunta innecesaria de empresa. Se reforzó la reparación de evidencia FACTS y el rechazo de preguntas sobre una empresa ya indicada. La verificación final `whatsapp-agent-memory-release-20261004` obtuvo 6/6 PASS: WP06 y las cinco nuevas evals de memoria, sin FAIL/ERROR ni alucinaciones críticas. Los hashes del reporte coinciden con las fuentes locales finales. No se presenta la suite ampliada anterior como un 30/30.

[Conversaciones y resultados de memoria](../development/whatsapp-agent-memory-evals-20261004.md). La memoria no requiere migraciones nuevas. Las evals se ejecutaron antes de publicar la implementación.

## Recuperación de lotes legacy pendientes — 4 de octubre de 2026

Un inbox v1 `OPEN` sin viaje/empresa, sin intentos, análisis, claims ni capturas asociadas puede retener mensajes nuevos fuera del agente v3. `legacy-batch-handoff.ts` lo transfiere al recibir un nuevo mensaje con v3 habilitado. La transferencia usa una transacción, el lock de intake v1 y un lock de fila; conserva los originales y sus IDs, orden, storage, OCR y transcripciones. El batch queda `TRANSFERRED` y el nuevo mensaje se agrega a la misma ráfaga v3. No se crean proveedores ni productos durante la transferencia.

La pregunta de empresa y sus opciones autorizadas se reconstruyen en el estado pendiente para conservar respuestas numéricas. Las selecciones de viaje v1 permanecen con su selector, así como lotes ya asignados, procesados o materializados y tarjetas pendientes. Las conversaciones v2/v3 siguen con su versión. No hay migración de esquema nueva ni eliminación de originales.

El fallback v1 comprueba preguntas pendientes antes de clasificar la intención de un mensaje aislado y acepta nombres únicos como `para broco`; al asignar un lote existente continúa con sus mensajes guardados. El agente v3 recibe instrucciones adicionales sólo durante una aclaración, utiliza la respuesta nueva como CONTEXT y conserva los FACTS del producto. La validación evita repetir una confirmación de destino cuando el usuario acaba de indicar un proveedor único.

[Incidente, conversaciones de eval y resultados](../development/whatsapp-legacy-clarification-evals-20261004.md).
