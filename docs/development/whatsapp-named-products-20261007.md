# Productos con nombre y respuestas de WhatsApp

La confirmación automática de productos requiere un nombre no vacío distinto de
`Producto sin nombre`. Imagen, FOB, MOQ, plazo y proveedor confirmado no son
requisitos. Se mantiene la validación de los valores comerciales cuando se aportan,
la evidencia, los permisos y la aprobación de cambios en registros confirmados.

La regla compartida vive en `lib/bot/record-completeness.ts` y alcanza las cargas
de WhatsApp, captions, materialización y creación/edición web. Los nuevos receipts
usan `NAME_PRESENT`; se conservan las variantes anteriores para leer históricos.
Los borradores históricos se promueven al procesarse bajo la regla nueva; este
cambio no modifica registros existentes mediante una migración masiva.

Las respuestas dejan de generar avisos por el mero estado DRAFT y eliminan
«lo cargué como borrador» y la confirmación genérica «los datos extraídos».
Se mantienen preguntas concretas por identidad, asociaciones y lectura incierta,
así como las propuestas de edición y sus opciones.

Los casos de evaluación de productos resueltos esperan CONFIRMED; WA15, WA22 y
WA23 se actualizan para la regla nueva. WA27 conserva una expectativa antigua
que ya contradice el flujo de proposals documentado en la auditoría anterior;
no se modifica ese flujo en esta tarea.
