# Asociación temporal y condiciones pendientes — 2026-10-08

Implementación local del cambio aprobado tras la [auditoría de tarjeta y cámara](whatsapp-camera-caption-audit-20261008.md). No se publicó ni se repararon datos de producción.

## Comportamiento

- Una referencia explícita conserva prioridad. Si no existe, el producto usa el último proveedor válido anterior en la cronología original de mensajes, dentro del contexto autorizado. No se pregunta para confirmar esa asociación temporal.
- Una foto verificada de producto con un único nombre en su comentario se carga con su propia imagen. No se crea un proveedor vacío para conservarla. Las cargas mixtas de audio/texto siguen usando el agente semántico.
- Las condiciones de un comentario de imagen sin producto identificado se conservan en `WhatsAppPendingEvidence`. Por ejemplo, «FOB 50 MOQ 15000» en una tarjeta queda pendiente para el siguiente producto de ese proveedor.
- La evidencia se aplica una sola vez. Si llegan varios productos, corresponde al primero por orden original. Los valores explícitos posteriores tienen prioridad. No se inventa moneda para «FOB 50».
- El cambio de proveedor, viaje o empresa y el reinicio de contexto invalidan evidencia pendiente para evitar trasladar condiciones. Una referencia explícita a otro proveedor no toma condiciones del anterior.
- La creación del producto y el consumo de las condiciones ocurren en la misma transacción. Se conservan mensaje fuente, cita literal y producto destino; los reintentos no vuelven a consumir la evidencia.
- El estado del producto sigue determinado por las reglas existentes del backend. Este cambio no modifica confirmación, propuestas ni permisos.

## Implementación

`reading-enrichment.ts` extrae comentarios de tarjetas y de imágenes de producto, incluyendo condiciones sin nombre. `prisma-agent-domain.ts` conserva y valida esa evidencia, resuelve la proximidad histórica y escribe el producto. `agent-service.ts` procesa las fotos inequívocas después de resolver las tarjetas anteriores de la misma ráfaga. `agent-orchestrator.ts` recibe las condiciones pendientes autorizadas para los casos que necesitan interpretación semántica.

`prepare_evidence` distingue un ID ajeno a la ráfaga (`INVALID_MESSAGE_ID`) de una imagen con calidad insuficiente. La evidencia histórica preparada se revalida contra la fila pendiente, el proveedor y el contexto antes de escribir. Sus imágenes no se adjuntan automáticamente al producto: una tarjeta usada como fuente de condiciones sigue siendo tarjeta.

La memoria de referencias continúa resolviendo identidad. Las condiciones comerciales pendientes usan una fuente persistida separada; no se copian condiciones históricas arbitrarias de otros productos.

## Validación

- Suite normal: 489 tests, 465 aprobados, 24 omitidos, sin fallos.
- Suite completa con PostgreSQL local: 608 tests, 597 aprobados, 2 omitidos y 9 fallos contabilizados por el runner. Son 7 casos preexistentes más 2 contenedores que también fallan: expectativas antiguas de borrador para productos con nombre y el escenario/replay `G-product-audio`. Se reprodujeron antes del cambio; no se alteraron sus expectativas.
- Selección de memoria, contexto y evidencia pendiente: 38 aprobados, sin omisiones ni fallos. Cubre cronología, proveedor nuevo en la misma ráfaga, dos productos, consumo único, reintentos, cambio de proveedor, reinicio, aislamiento de viaje/empresa, correcciones, procedencia y rechazo de evidencia falsificada.
- Regresiones adicionales: ID de evidencia incorrecto, calidad de imagen, recibos incompatibles con una carga de producto y replay sin red de extracción de comentarios.
- Typecheck y build aprobados. Lint sin errores, con 3 advertencias previas de navegación de Next.js. `git diff --check` aprobado.
- La evaluación con el proveedor de IA real no pudo completarse: respondió HTTP 429 por límite de solicitudes. Los tests determinísticos y replays no acreditan una evaluación nueva del modelo real.

## Publicación y límites

Antes de ejecutar el código nuevo en producción debe aplicarse la migración aditiva `20261008050000_whatsapp_pending_evidence`. Se verificó únicamente en PostgreSQL local; requiere desplegar también el código de worker/backend. No hubo push ni deploy en esta tarea.

La extracción nueva de condiciones pendientes cubre comentarios de imágenes. No agrega un extractor de condiciones huérfanas para mensajes autónomos de texto/audio. Los originales siguen guardados para esos casos. Referencias explícitas irresolubles no se sustituyen por otro proveedor: la carga se conserva sin asociación inventada. No se deduplican proveedores ni se reconstruyen automáticamente los registros del incidente anterior.
