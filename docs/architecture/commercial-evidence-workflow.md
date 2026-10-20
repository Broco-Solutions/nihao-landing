# Gestión comercial de evidencias WhatsApp — PR #51

## Fuente y proyección

`WhatsAppBurstMessage` conserva cada original y su lectura privada. La bandeja proyecta hechos comerciales por mensaje, separa consultas generales del trabajo pendiente y agrupa los mensajes pendientes de un mismo lote para una revisión conjunta. La agrupación no fusiona originales. Si aparecen varios nombres o categorías en el mismo lote, la selección de fuentes queda vacía hasta que la persona elija los mensajes pertinentes.

Una operación automática que sólo crea un borrador no equivale a una revisión comercial completada. La proyección de `WhatsAppEvidenceDecision` determina Pendientes, Resueltas, Descartadas e Historial por los campos efectivamente aplicados y la última decisión de disposición. Un vínculo al proveedor no cierra un mensaje que todavía contiene condiciones de producto. La consulta de estado desde WhatsApp lee esta misma proyección cuando vuelve a preguntarse; la Web no envía mensajes proactivos.

**Por resolver** significa que existe una fuente comercial sin decisión suficiente, incluso si un proceso automático creó un borrador. **Resuelta** significa que se aplicaron los datos pertinentes o que una persona decidió expresamente que no hay más datos para registrar. **Descartada** conserva original y decisión de no utilizar una fuente que aún no respalda un registro. **Historial** contiene conversación sin tarea comercial. Una pregunta sobre cómo usar proveedores o productos no se vuelve pendiente por esas palabras; se respetan las operaciones y decisiones comerciales ya persistidas. Los mensajes de un mismo lote se evalúan por separado.

`FINISH_REVIEW` registra actor, fecha, viaje y empresa sin editar proveedor, captura ni producto. Sólo se acepta si el mensaje ya respalda un registro vigente de ese viaje y empresa, está pendiente y el actor está autorizado. `REOPEN_REVIEW` permite corregir ese cierre y devuelve la fuente a Por resolver. El bloqueo de fila serializa ediciones concurrentes y el ID de decisión hace idempotente un reintento. Una vinculación parcial no se cierra sola: la persona puede completar información o finalizar expresamente si no hay nada más. La tarjeta muestra el destino previo y lo selecciona para completar datos.

`DISCARD` y `RECOVER` son decisiones append-only. La última de ambas define si la fuente está descartada o vuelve a pendientes. Ninguna elimina `WhatsAppBurstMessage`, archivos ni registros comerciales. No puede descartarse una fuente que ya respalda un registro; recuperar exige un descarte vigente. Ambas acciones revalidan viaje, empresa, rol y actor.

Una evidencia sin empresa verificada puede revisarse por su viajero, pero el modelo actual no permite descartarla ni finalizarla sin un registro vinculado. Ampliar esa autorización requiere una decisión separada; esta corrección no agrega permisos ni migra datos históricos.

## Guardado de una negociación

`POST /api/bot/trips/:tripId/whatsapp-evidence/negotiation` recibe IDs de mensajes de un mismo lote y un modo explícito: `SUPPLIER`, `PRODUCT`, `DISCARD` o `RECOVER`. `SUPPLIER` exige proveedor existente/borrador o proveedor nuevo y no crea producto. `PRODUCT` suma producto existente o nuevo y campos revisados. Los modos de disposición no exigen destinos comerciales.

El servidor verifica rol, propiedad del mensaje o ámbito explícito del ADMIN, viaje, empresa y destino antes de escribir. Bloquea el lote y agrega una decisión por mensaje en una sola transacción PostgreSQL. `batchId` permite reintentar tras interrupciones sin duplicar productos ni decisiones. La versión observada protege ediciones de producto concurrentes. `sourceEvidence` y cada decisión guardan el mensaje y los campos respaldados.

La fotografía no se copia ni se publica: su decisión apunta al producto y su vista autorizada abre el original privado mediante una URL breve. Productos conserva `quotedPriceAmount/Currency/Unit/RawText` separado de FOB. El texto «Valen 600 usd cada uno» aporta USD 600 por unidad cotizada; «Moq 250» deja la unidad nula. No se infieren modelo, contacto ni Incoterm.

## Contrato de formulario

La Web presenta por separado proveedor existente y proveedor nuevo. Crear borrador exige empresa y nombre; ciudad y contacto son opcionales. La ausencia de contacto no bloquea el guardado, pero sí la confirmación posterior. En producto, elegir existente exige proveedor y producto; crear nuevo exige nombre. Precio cotizado, FOB, MOQ, plazo y notas son opcionales y sólo se escriben si la persona los revisó. Una tarjeta de proveedor puede resolverse sin producto.

## Borradores y permisos

La ficha administrativa reutiliza `CaptureFieldReview`, `Tier1Editor`, `CaptureDetails`, `SupplierProducts`, `AttachmentUploader` y las evidencias vinculadas. `reviewedAt/reviewedById` documentan la revisión humana de un borrador sin convertirlo en `CONFIRMED`. Confirmar sigue exigiendo nombre y contacto válido. Archivar es lógico y requiere confirmación en la UI; originales e historial permanecen.

El viajero ve sólo sus mensajes y empresas autorizadas. El ADMIN del viaje ve y modifica evidencias de viajeros de ese viaje cuando existe empresa explícita del mismo viaje; una evidencia sin ámbito explícito permanece privada del viajero. Los endpoints de media aplican el mismo límite. La autorización se revalida en el servidor para cada operación.

## Dependencia y verificación

La auditoría de sólo lectura de los casos del viaje de pruebas del 12/10/2026 encontró: el texto de almohadones generó automáticamente un producto borrador llamado «almohadones» bajo la captura de `tvsellerschina`, sin decisión humana posterior; «B. 1» generó una captura borrador separada, sin proveedor ni producto identificado. El original privado de esa foto muestra un almohadón, aunque el OCR y la descripción persistida no lo reconocieron; la foto sigue asociada a la captura y no al producto. La pregunta «Tipo de proveedor que tipos hay?» no produjo operaciones ni decisiones y pasa a Historial. No se escribieron datos comerciales productivos durante la auditoría. Las regresiones cubren cierre/reapertura, descarte/recuperación, idempotencia, concurrencia, varias fuentes, registros preexistentes y límites de viaje, empresa y propietario.

PR #53 corrige el clasificador visual y la creación automática de proveedores falsos; este PR no cambia ese código. El caso productivo del 11/10 contiene un borrador `tvsellerschina` sin productos y otro borrador sin nombre creado minutos antes. No se modifican datos históricos: archivar/conciliar el segundo exige diagnóstico focalizado, dry-run y aprobación. Antes del merge se requiere PostgreSQL aislado, UAT autenticada TRAVELER/ADMIN y revalidación conjunta sobre main con #53.
