# WhatsApp: orquestador con tools (v3)

Implementación v3. La bandera `WHATSAPP_AGENT_TOOLS_ENABLED=false` elige el motor para conversaciones nuevas; las versiones persistidas mantienen su procesador. Requiere las migraciones de ráfagas/productos y `20261002160000_whatsapp_tool_agent`. La activación requiere validar migraciones, código y funcionamiento del entorno; el UAT físico se registra aparte.

Cambio local del 8 de octubre: asociación temporal sin repreguntas para productos sin proveedor explícito y condiciones de comentarios de imágenes pendientes de aplicación única. Requiere `20261008050000_whatsapp_pending_evidence`; implementación, validación y límites en [evidencia comercial pendiente](../development/whatsapp-pending-commercial-evidence-20261008.md).

## Interpretación contextual de texto y audio — 9 de octubre de 2026

El agente decide la intención a partir del mensaje completo, la ráfaga ordenada, el foco persistente de proveedor/producto y las preguntas pendientes. El backend no clasifica nuevos productos, condiciones ni comentarios por palabras o fragmentos. Se eliminó la detección de declaraciones por regex y las escrituras previas a la interpretación de texto/audio; la persistencia de imágenes verificadas y la aplicación de una selección numérica ya vinculada mantienen sus recorridos.

`finish_turn.outcomes` registra las acciones interpretadas por mensaje. CREATE_PRODUCT, UPDATE_PRODUCT, CREATE_SUPPLIER, UPDATE_SUPPLIER y PRESERVE_PRODUCT_FACTS requieren evidencia propia y recibos completados de la tool correspondiente. QUERY/NO_ACTION permiten responder consultas o cerrar mensajes sin información para registrar. Los FACTS preparados sin resolver bloquean el cierre: preparar evidencia o escribir otro recurso no completa el pedido. Los recibos atribuidos permiten recuperar checkpoints anteriores sin repetir escrituras; las cancelaciones resuelven la evidencia de su propuesta.

`preserve_product_facts` conserva condiciones para un producto todavía sin identificar bajo el proveedor resuelto, con autorización, asociación contextual, procedencia e idempotencia. Si el contexto identifica el producto activo, corresponde `update_product`; si introduce otro producto, `create_product_draft`. No requiere migraciones ni consultas adicionales a modelos clasificadores.

Las pruebas determinísticas usan decisiones semánticas simuladas para verificar el recorrido real del agente, tools, worker y PostgreSQL: un mismo mensaje crea o actualiza según el contexto; plazos y colores actualizan el producto; consultas no escriben; cargas múltiples y reintentos conservan sus límites. Estas pruebas verifican ejecución y validaciones, no miden la calidad de interpretación del modelo. No se ejecutaron evals para este cambio.

## Segunda etapa multimodal local — 2026-10-06

El código local incorpora clasificación visual, reconciliación OCR/visión, cargas lógicas, grafo de evidencias y aislamiento por asset/tarjeta. Esta segunda etapa **no se ha publicado**. Usa metadata JSON existente y conserva contratos, modelo y reglas de la primera etapa. Arquitectura, agrupación, asociaciones, retries y límites: [ingesta multimodal](whatsapp-multimodal-ingestion.md).

## Experiencia y capacidades

`search_suppliers` prioriza coincidencias literales normalizadas en nombre original/romanizado y contactos exactos. Si no hay resultados literales, compara ventanas de palabras completas con distancia de edición y transposiciones adyacentes: similitud mínima 0,8 y hasta tres ediciones. Las consultas fuzzy necesitan entre 4 y 120 caracteres y excluyen identificadores de contacto. Devuelve hasta 20 candidatos ordenados por similitud, con `searchMatch.type` (`LITERAL`/`FUZZY`) y `searchMatch.score`. Los candidatos fuzzy requieren selección del usuario incluso si hay uno solo; `ask_clarification` recupera sus opciones si el modelo las omite. Las búsquedas de productos y la reconciliación de identidad de tarjetas mantienen sus reglas actuales. No requiere migraciones ni dependencias nuevas.

Conserva el cierre de ráfaga a los 20 segundos de silencio o con `listo`. Primero lee todos los mensajes y conserva originales, OCR, descripción visual, transcripción y extracción. Luego un agente usa tools para resolver el pedido, en lugar de devolver un único plan JSON.

Permite consultar proveedores y productos, cargar borradores y corregir registros. El backend confirma un proveedor al reunir nombre y un contacto válido, y un producto al reunir nombre y FOB finito no negativo con moneda. La categoría del proveedor y la imagen, MOQ y plazo del producto son opcionales. Un producto puede quedar cargado con `captureId` aunque su proveedor siga incompleto y `supplierId` sea null. Si falta ese mínimo, conserva el borrador. La regla se evalúa tanto al crear como al completar, y la confirmación manual web sigue disponible. No ofrece eliminaciones, traslados de productos ni cambios de viaje/empresa.

Editar un registro confirmado genera una propuesta con valores anteriores/nuevos. La respuesta se persiste en el outbox; sólo después de enviarse admite un nuevo mensaje textual autónomo `sí`, `confirmar` o `confirmo`. `no` o `cancelar` cancela. También se acepta una cancelación inequívoca seguida de otro pedido, por ejemplo «No confirmes eso. Además agregá otro producto…», y continúa procesando ese pedido; las aprobaciones compuestas siguen requiriendo una respuesta autónoma. El contenido citado, OCR y propuestas del propio modelo no pueden aprobar. La aprobación caduca a las 24 horas y sólo corresponde a esa propuesta. Si hubo otros mensajes intermedios o cambió el registro, se requiere una nueva propuesta/aprobación. La aprobación autoriza únicamente la edición propuesta; la completitud y el estado del recurso se evalúan en backend.

Se recuerda el contexto de operaciones pendientes y se dispone de memoria estructurada de las últimas cinco conversaciones v3 terminadas durante las últimas 24 horas, aislada por usuario, teléfono e instancia. Homónimos generan opciones con IDs y numeración persistidos; si el modelo omite opciones para una búsqueda ambigua identificada, el servidor las recupera de esos resultados, con empresa y ciudad; el servidor interpreta la selección numérica. Una coincidencia única determina la empresa del proveedor. Las búsquedas y escrituras se limitan a viajeros de viajes activos/planificados y empresas activas con membresía; se revalidan permisos antes de cada acción.

## Componentes y contratos

- `agent-contract.ts`: las 15 function tools con `strict=true`, objetos cerrados y todos sus campos requeridos; los opcionales son nullable. Mantiene validaciones del servidor y recuperación de llamadas históricas con argumentos dispersos.
- `agent-policy.ts`: contexto operacional inicial, tools disponibles por estado, decisiones inequívocas y detección de progreso.
- `agent-memory.ts`: límites de memoria, resúmenes y resolución de referencias recientes.
- `lib/bot/record-completeness.ts`: reglas reutilizables de completitud de proveedor y producto, preservando confirmaciones existentes.
- `agent-orchestrator.ts`: prompts exportados `WHATSAPP_AGENT_PROMPT` y `WHATSAPP_AGENT_MEMORY_PROMPT`, ciclo OpenAI, historial recuperable y límites soft/hard con watchdog persistido por revisión.
- `agent-tools.ts`: validación de llamadas, citas literales, selección, preguntas y resúmenes de recibos.
- `prisma-agent-domain.ts`: consultas autorizadas, escritura transaccional, propuestas, aprobación y recuperación de adjuntos.
- `agent-service.ts` y `agent-composition.ts`: lectura completa, checkpoints, worker y dependencias reales.
- `durable-routing.ts`: selección de versión para nuevas conversaciones y drenaje de v2/v3 persistidas.

El modelo del orquestador se configura mediante `WHATSAPP_AGENT_MODEL`, por defecto `gpt-5.6-luna`, y requiere `OPENAI_API_KEY`. OpenAI interpreta textos y transcripciones, segmenta evidencias y decide las tools con el contexto autorizado. Mistral conserva OCR (`mistral-ocr-4-1`), visión (`mistral-small-2603`) y transcripción (`voxtral-mini-latest`). El adaptador `agent-provider.ts` separa las llamadas según su contenido. Tool calling usa Responses API con `tool_choice=required`, `reasoning.effort=medium`, sin `temperature` explícita (Luna no admite ese parámetro en Responses API), `max_output_tokens` y `store=false`; conserva los items de salida y razonamiento cifrado en los checkpoints; no incorpora SDK de agentes ni acceso SQL del modelo. Las llamadas son secuenciales, con timeout de 30 segundos y checkpoints dentro de la ventana de 220 segundos del worker. Al agotar rondas, conserva las operaciones terminadas y espera `reintentar` para lo pendiente.

Tools: `get_context`, `resolve_recent_reference`, `search_suppliers`, `get_supplier`, `search_products`, `get_product`, `prepare_evidence`, `create_supplier_draft`, `create_product_draft`, `update_supplier`, `update_product`, `apply_pending_change`, `cancel_pending_change`, `ask_clarification` y `finish_turn`. Los errores de argumentos, citas y negocio se devuelven al modelo para corregir; errores de infraestructura conservan el checkpoint y reintentan.

## Memoria reciente

`agent-memory.ts` deriva resúmenes de los estados ya persistidos; no requiere una migración ni una llamada adicional a un modelo para resumir. `PrismaAgentDomain.recentMemory` lee como máximo las cinco conversaciones `DONE` v3 más recientes del mismo usuario, teléfono e instancia, completadas hace menos de 24 horas. Una conversación `WAITING` sigue usando su contexto pendiente y no se considera terminada. Las 24 horas limitan el contexto disponible, no borran el historial almacenado.

El resumen incluye fecha, referencias a proveedores/productos (IDs, nombres, viaje, empresa y estado actual) y operaciones completadas. No incluye mensajes históricos, precios, condiciones comerciales, evidencias, propuestas ni aprobaciones. Se conservan hasta diez referencias directas por conversación y los proveedores de los productos referidos. Las búsquedas ambiguas no convierten todos sus resultados en contexto. Cada referencia se vuelve a consultar y autorizar; registros inexistentes o con permisos revocados se omiten. Si un proveedor borrador fue confirmado en la web, se resuelve su ID de proveedor actual por `captureId`.

Antes de la primera llamada, `agent-service.ts` obtiene el catálogo autorizado y el orquestador inyecta `operationalContext`: viajes, empresas y selección cuando es única. El modelo no necesita llamar `get_context` para conocerlo. `get_context` conserva su compatibilidad y entrega resúmenes de memoria únicamente cuando el mensaje contiene una referencia reciente; no se inyectan las cinco conversaciones automáticamente. El prompt adicional de memoria y su tool están disponibles también para cargas de productos sin proveedor explícito. `resolve_recent_reference` prioriza nombres, mensajes citados y ordinales como «el primer proveedor»; después usa el proveedor del mensaje anterior más próximo, incluyendo el asociado a un producto previo. Primero resuelve dentro de la ráfaga actual y luego entre conversaciones recientes del mismo viaje y empresa. Usa el orden original de mensajes, no el de finalización de operaciones, y excluye mensajes posteriores. Una referencia explícita ambigua o inexistente exige aclaración y no activa el fallback temporal. Una pregunta pendiente tiene prioridad. La asociación elegida y su motivo se conservan en el recibo para reintentos.

La creación de productos y las ediciones por referencia reciente revalidan el destino en el servidor antes de escribir: el modelo no puede seleccionar arbitrariamente una de varias referencias. Las aclaraciones usan opciones persistidas y selección numérica igual que los homónimos. Los nuevos campos comerciales salen sólo de las evidencias de la conversación actual. Consultas y ediciones vuelven a leer los registros; las aprobaciones de confirmados siguen siendo nuevas respuestas explícitas a la propuesta actual.

Evals nuevas: WA26 continuidad entre conversaciones, WA27 edición del último producto, WA28 vencimiento de memoria, WA29 referencia ambigua y WA30 destino explícito diferente. WA21 conserva la comprobación de no heredar destino fuera de la ventana de memoria: la conversación anterior se fecha 25 horas atrás. Los reportes históricos y sus mensajes no se modifican.

## Evidencias y operaciones

`prepare_evidence` convierte citas verificadas en IDs estables con mensaje original, posiciones y rol. `FACTS` aporta campos propios del registro; `CONTEXT` aporta referencias de proveedor/empresa y puede compartirse. No permite una frase que describe varios productos como los hechos de uno solo. Las condiciones comerciales se extraen por fragmento. Las observaciones visuales sólo ayudan a asociar, no justifican datos comerciales.

Una creación deriva datos de la evidencia; el modelo no puede enviar precios arbitrarios. El servidor valida destinos, nombres literales y asignaciones. Los fragmentos comerciales no se reutilizan para crear productos diferentes. Las fotos referidas explícitamente dentro de una carga deben incluirse antes de escribir. Cláusulas que piden inventar datos o ignorar reglas no se procesan como condiciones comerciales.

`WhatsAppAgentOperation` guarda identidad estable, revisión, tool, argumentos, resultado, estado, expiración, revisión del resumen y mensaje de aprobación. La mutación y el recibo se registran en una transacción, bajo el lock de la conversación y comprobación de revisión/lease. Un mensaje nuevo anterior a esa reserva obliga a reconsiderar; operaciones ya escritas conservan su identidad.

Estados de operaciones: `WRITTEN` mientras faltan adjuntos, `COMPLETED`, `PROPOSED`, `CANCELLED`, `STALE` y `EXPIRED`. Los originales y copias de adjuntos son recuperables e idempotentes. Los resúmenes de guardado se construyen a partir de recibos completados. El estado JSON conserva las preguntas, opciones, fragmentos, historial y fin de turno; un reinicio retoma una llamada o finalización checkpointed.

Las tools reutilizan validaciones de productos y correcciones de capturas. La edición del proveedor confirmado usa el servicio compartido con la web. Las ediciones son parciales: omitidos se conservan y vaciar requiere pedido explícito. La carga v3 desactiva la creación implícita de productos del repositorio: cada producto pasa por su tool. Los productos de proveedores nuevos mantienen `captureId`; la promoción del proveedor vincula su `supplierId` sin decidir el estado del producto. Cada producto deriva su propio estado por completitud. Las promociones del agente se realizan en la misma transacción que el recibo final; no cambian la regla de categoría de la confirmación manual web.

## Límites, gating y completitud — etapa local 2026-10-06

Soft limit 12, hard limit 24. Después de 12 se continúa si hubo progreso en las últimas dos rondas. Progreso es un cambio persistido en IDs de evidencias, registros resueltos/versiones, estados de recibos, pregunta/propuesta o terminal; no cuenta el crecimiento del historial o de llamadas. La misma tool con los mismos argumentos y estado sin cambios en dos ejecuciones consecutivas detiene el loop; cuatro rondas estancadas también. Se persisten `completed`, `asked_clarification`, `max_rounds`, `no_progress`, `tool_error` o `model_error` y se registran en logs. Agotar rondas nunca es silencioso: informa el límite y conserva lo pendiente para reintentar. El presupuesto de 220 segundos sigue usando checkpoints reanudables.

El conjunto de tools se construye centralmente en `agent-policy.ts`. Las escrituras requieren FACTS y registros del tipo correspondiente previamente consultados o creados. Aplicar/cancelar sólo aparece con propuesta pendiente. Una respuesta autónoma inequívoca de aprobación/cancelación limita las tools a aplicar, cancelar y terminar; el backend ya puede resolverla directamente. La cancelación compuesta mantiene el recorrido de operaciones nuevas. El gating no reemplaza autorización, validación de evidencia ni aprobación.

Los patches nuevos tienen slots nullable para conservar campos omitidos y `clearFields` con enum cerrado para borrados explícitos; las llamadas dispersas históricas conservan su interpretación. No se expone un campo `confirmed` ni `status` al modelo.

Contacto válido incluye email, teléfono/fax y WeChat soportados por el dominio, estructurados o presentes en el campo de contacto. Una persona sin medio, ubicación, categoría o web sola no alcanza. Un proveedor completo se promociona desde `SupplierCapture` a `Supplier`, con `captureId` único y preservando campos y vínculos. Confirmados existentes nunca se demueven ni vuelven a promocionarse.

La lectura visual distingue `BUSINESS_CARD`, `PRODUCT_IMAGE` y `OTHER`; sólo `PRODUCT_IMAGE` explícito genera `productImageVerified=true`. Al adjuntar FACTS a un producto, el backend conserva esa prueba junto al `attachmentId` en `SupplierProduct.sourceEvidence`. La imagen debe existir en `SupplierAttachment`, estar vinculada al producto y tener tipo, MIME, tamaño y storageKey válidos. Esta prueba identifica el origen de los adjuntos; la completitud actual del producto depende de nombre y FOB, no de imágenes. La confirmación espera a terminar la copia del archivo; falla de almacenamiento conserva `WRITTEN` para retomar. No requiere columnas ni migraciones nuevas.

Los recibos distinguen el estado técnico (`status`) del recurso (`resourceStatus`) e incluyen `confirmationReason` sólo al promover (`NAME_AND_CONTACT_PRESENT` o `NAME_AND_FOB_PRESENT`; `NAME_AND_IMAGE_PRESENT` sigue aceptándose en recibos históricos). `completedRevision` limita el resumen a resultados del turno actual, sin repetir confirmaciones anteriores. El servidor construye los mensajes desde recibos, sin afirmaciones del modelo.

Idempotencia: hash de conversación, acción, destino, argumentos normalizados e IDs estables de evidencia ordenados; updates incluyen revisión. El tipo mutable del destino se excluye de claves nuevas para que un retry sobreviva a la promoción del proveedor. Se siguen leyendo hashes legacy. El lock de conversación y el recibo transaccional evitan duplicación; `apply_pending_change` reutiliza la operación y sólo aplica el patch una vez, antes de `WRITTEN`. Las copias de adjuntos tienen clave por operación y mensaje. Productos con igual nombre y evidencias distintas siguen siendo operaciones diferentes. Cambiar evidencia o revisión no es el mismo retry técnico.

Implementado localmente, **sin despliegue**. Validación y archivos: [reporte de etapa](../development/whatsapp-agent-priorities-20261006.md).

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

### Demora y reintentos del lote recuperado

Una lectura completa de un único segmento literal se reutiliza al preparar evidencia; las citas parciales, segmentaciones múltiples y textos recortados requieren extracción propia. Esto evita repetir llamadas de extracción de los mismos textos, sin omitir la lectura ni relajar validaciones.

Para un lote recuperado que repite la descripción comercial del mismo producto, una escritura nueva no puede utilizar como FACTS una descripción anterior cuando existe otra posterior. La tool devuelve `STALE_PRODUCT_FACTS` para que el agente prepare la versión más reciente o pregunte si son productos distintos. Los recibos de operaciones ya escritas mantienen su recuperación idempotente. Las empresas internas y proveedores homónimos se distinguen por sus registros y IDs, no sólo por la palabra Broco.

Los reintentos registran la clase del error y el código HTTP de OpenAI o Mistral cuando está disponible, sin incluir textos, claves ni respuestas del proveedor. Desde el 8 de octubre de 2026, la ventana de agrupación es de 5 segundos; no se garantiza una latencia fija del servicio externo.

### Productos: la empresa se deriva del proveedor

Para productos de proveedores existentes, `ask_clarification` no puede pedir una empresa interna: si falta destino, pregunta por el proveedor; los homónimos se presentan como registros de proveedor con empresa y ciudad. El `companyId` de escritura se obtiene del proveedor autorizado seleccionado. La empresa sólo se solicita cuando la operación es crear un proveedor nuevo y falta ese dato. La validación anterior de empresa ya indicada sigue vigente.

Una aclaración breve no puede cerrar con ayuda una carga de producto todavía pendiente. Las llamadas del orquestador tienen un máximo de 2048 tokens de salida; se guardan las tool calls y sus resultados, sin acumular narrativa del assistant que no se envía por WhatsApp. El envío funcional se construye con recibos y `finish_turn.response`. Esto limita salidas repetitivas, pero no constituye una garantía de latencia.


## Migración a OpenAI y conversaciones extendidas — 2026-10-04

`gpt-5.6-luna` fue verificado en el catálogo oficial y en `/v1/models` con la clave de Railway. Se conserva el historial durable de tools y la memoria reciente de cinco conversaciones durante 24 horas; OpenAI recibe el contexto autorizado en cada llamada. No existe fallback silencioso a Mistral para interpretación ni tools. Las rutas heredadas v1/v2 y la extracción desde la web mantienen sus proveedores previos.

Una respuesta a una pregunta de proveedor se busca como nombre literal, incluso si coincide con una empresa interna. El servidor impide repetir esa pregunta sin consultar proveedores primero. Sólo una respuesta a una pregunta de empresa con opciones de empresas identifica una empresa. La empresa del producto siempre se deriva del proveedor elegido.

WA35–WA37 agregan seis, seis y siete mensajes de usuario, cada uno con respuesta real del modelo. Se comprueban productos, precios, plazos, MOQ, destino y preguntas después de cada turno; se persisten las conversaciones terminadas para probar memoria, y las propuestas enviadas para probar aprobación/cancelación. Las evals corren con PostgreSQL local aislado, sin mandar mensajes a clientes. Los audios de la suite usan transcripciones literales: no validan Voxtral ni el transporte físico de WhatsApp. Ver el documento de conversaciones y resultados en desarrollo.

Aceptación de la migración: 37 escenarios validados (corrida completa 36 PASS + un ERROR de fixture, seguido de recuperación aislada 4/4 PASS), estabilidad 12/12 PASS y 258 pruebas automatizadas. Las tres conversaciones largas suman 19 turnos y 101 comprobaciones. Los 38 hashes de fuentes/fixtures coinciden con el release. Resultados y calificaciones: [conversaciones extendidas](../development/whatsapp-openai-extended-evals-20261004.md). Configuración productiva: `WHATSAPP_AGENT_TOOLS_ENABLED=true`, `WHATSAPP_AGENT_MODEL=gpt-5.6-luna`, `WHATSAPP_BURSTS_ENABLED=false`, con la clave OpenAI en Railway.


## Selección de proveedor con lista de WhatsApp — 2026-10-04

Cuando una carga de producto necesita elegir proveedor, el servidor conserva los productos pendientes y presenta un botón **Elegir proveedor**. Abre una lista de proveedores autorizados con nombre, empresa y ciudad. Los homónimos usan las coincidencias de búsqueda; cuando falta el nombre, se consultan proveedores del viaje autorizado identificado. Si no se puede determinar el viaje o no hay proveedores, se conserva la pregunta textual. Nunca se pide empresa para asignar un producto a un proveedor existente.

`supplier-picker.ts` construye hasta diez filas, el límite de esta interfaz. Para elegir otro proveedor, el usuario puede escribir su nombre; se mantiene también la selección numérica en la alternativa textual. No se elige automáticamente un proveedor por aparecer en la lista. Los campos comerciales provienen de los mensajes originales, y la empresa se obtiene del proveedor seleccionado al escribir.

El cliente usa `POST /message/sendList/{instance}` con el DTO v2 de Evolution: `number`, `title`, `description`, `buttonText`, `footerText`, `sections`. El formato está definido en el [DTO oficial de Evolution](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/dto/sendMessage.dto.ts). Si Evolution rechaza definitivamente la lista con HTTP 400/404/405/501, se envía la pregunta numerada. Un timeout o error transitorio conserva el outbox para reintentar: no agrega un segundo envío textual con entrega incierta.

Cada fila tiene un identificador derivado de la conversación, revisión y posición persistidas; no contiene el ID del proveedor. El webhook interpreta `listResponseMessage` y respuestas nativas, y el store convierte una selección vigente en el número correspondiente antes de interpretar su contenido. La etiqueta visible no determina el destino. Una selección de otra conversación, revisión o fila no mostrada se convierte en un pedido para actualizar las opciones. El dominio vuelve a autorizar el registro antes de guardar. No requiere migración ni variables nuevas.

La eval WA38 recorre webhook → worker → outbox → envío de lista simulado → callback de selección → producto borrador, con OpenAI real y PostgreSQL aislado. Prueba la conversación original de las sillas y comprueba proveedor, FOB, plazo y ausencia de datos inventados. No envía WhatsApp real; la presentación y entrega física del menú requieren UAT en el teléfono.
