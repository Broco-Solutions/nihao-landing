# Gestión comercial de evidencias WhatsApp — PR #51

## Fuente y proyección

`WhatsAppBurstMessage` conserva cada original y su lectura privada. La bandeja proyecta hechos comerciales por mensaje, separa consultas generales del trabajo pendiente y agrupa los mensajes pendientes de un mismo lote para una revisión conjunta. La agrupación no fusiona originales. Si aparecen varios nombres o categorías en el mismo lote, la selección de fuentes queda vacía hasta que la persona elija los mensajes pertinentes.

Una operación automática que sólo crea un borrador no equivale a una revisión comercial completada. La proyección de `WhatsAppEvidenceDecision` determina Pendientes, Resueltas e Historial por los campos efectivamente aplicados o por descarte humano explícito. Un vínculo al proveedor no cierra un mensaje que todavía contiene condiciones de producto. La consulta de estado desde WhatsApp lee esta misma proyección cuando vuelve a preguntarse; la Web no envía mensajes proactivos.

## Guardado de una negociación

`POST /api/bot/trips/:tripId/whatsapp-evidence/negotiation` recibe IDs de mensajes de un mismo lote, empresa, proveedor existente/borrador o proveedor nuevo, producto existente o nuevo y campos revisados. El servidor verifica rol, propiedad del mensaje o ámbito explícito del ADMIN, viaje, empresa y destino comercial antes de escribir. Bloquea el lote y aplica proveedor, producto y una decisión por mensaje en una sola transacción PostgreSQL. `batchId` permite reintentar tras interrupciones sin duplicar producto ni decisiones. La versión observada protege ediciones de producto concurrentes. `sourceEvidence` y cada decisión guardan el mensaje y los campos respaldados; un original puede respaldar más de una operación si se registra una nueva decisión válida.

La fotografía no se copia ni se publica: su decisión apunta al producto y su vista autorizada abre el original privado mediante una URL breve. Productos conserva `quotedPriceAmount/Currency/Unit/RawText` separado de FOB. El texto «Valen 600 usd cada uno» aporta USD 600 por unidad cotizada; «Moq 250» deja la unidad nula. No se infieren modelo, contacto ni Incoterm.

## Borradores y permisos

La ficha administrativa reutiliza `CaptureFieldReview`, `Tier1Editor`, `CaptureDetails`, `SupplierProducts`, `AttachmentUploader` y las evidencias vinculadas. `reviewedAt/reviewedById` documentan la revisión humana de un borrador sin convertirlo en `CONFIRMED`. Confirmar sigue exigiendo nombre y contacto válido. Archivar es lógico y requiere confirmación en la UI; originales e historial permanecen.

El viajero ve sólo sus mensajes y empresas autorizadas. El ADMIN del viaje ve y modifica evidencias de viajeros de ese viaje cuando existe empresa explícita del mismo viaje; una evidencia sin ámbito explícito permanece privada del viajero. Los endpoints de media aplican el mismo límite. La autorización se revalida en el servidor para cada operación.

## Dependencia y verificación

PR #53 corrige el clasificador visual y la creación automática de proveedores falsos; este PR no cambia ese código. El caso productivo del 11/10 contiene un borrador `tvsellerschina` sin productos y otro borrador sin nombre creado minutos antes. No se modifican datos históricos: archivar/conciliar el segundo exige diagnóstico focalizado, dry-run y aprobación. Antes del merge se requiere PostgreSQL aislado, UAT autenticada TRAVELER/ADMIN y revalidación conjunta sobre main con #53.
