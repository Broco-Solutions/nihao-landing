# Asociación de imágenes y comentarios de WhatsApp — 8 de octubre de 2026

## Comportamiento implementado

- Una tarjeta crea o actualiza el proveedor extraído y conserva el original. No crea un producto por su nombre comercial.
- Sin referencia explícita, los comentarios usan el proveedor anterior más inmediato en el orden de los mensajes. Una nueva tarjeta cambia ese contexto.
- FOB, MOQ y plazo sin producto identificado se guardan en el proveedor. No se trasladan automáticamente a un producto futuro. Las evidencias pendientes históricas mantienen compatibilidad.
- Las fotos verificadas de producto usan primero el nombre explícito del usuario y, si falta, la descripción visual interpretada. No requieren otra pregunta de nombre o de datos opcionales.
- Una foto de producto usa el proveedor anterior cuando no hay referencia explícita. Los comentarios posteriores a esa foto pueden completar ese producto, hasta que otra tarjeta cambie el contexto.
- Si la tarjeta identifica un producto en su comentario, las condiciones posteriores de esa misma carga completan ese producto; el original sigue asociado al proveedor.
- Sin proveedor disponible, la foto queda pendiente con una pregunta que identifica su hora y el producto interpretado. No se crea un proveedor ficticio.
- Los originales se almacenan antes de interpretar. Ante fallos de almacenamiento, la evidencia permanece reintentable y la respuesta no afirma haber conservado un archivo sin comprobación.
- Las preguntas de asociación identifican el mensaje real mediante hora, texto o producto. Los recibos y claves de operación evitan duplicados al reintentar.
- Una solicitud explícita como «guardar producto botella» permite crear el producto aunque no exista en las búsquedas.

## Validación

`tests/bot/whatsapp-image-rules.test.mts` cubre asociación, prioridad de nombres, preguntas identificables, fallos de almacenamiento y persistencia en PostgreSQL aislado, incluidos reintentos. Los casos reproducen los patrones reportados sin modificar la conversación histórica.

La ejecución conjunta con `whatsapp-pending-evidence.test.mts` y `whatsapp-agent-prompt.test.mts` pasó: 34 pruebas, una evaluación remota omitida por defecto. TypeScript pasó; lint no tiene errores y conserva tres advertencias previas de navegación en componentes web.

La suite completa registró 608 pruebas aprobadas, 11 fallos y tres omitidas. Los mismos 11 fallos se reprodujeron en una copia del estado anterior: selector vencido, metadatos de evidencia pendiente y expectativas de confirmación del pipeline multimodal/replay.

La evaluación opcional con Mistral real pasó usando las herramientas y persistencia del agente sobre PostgreSQL local. Emplea clasificaciones de imágenes preparadas; no es una reproducción completa de los archivos originales. La evaluación con el proveedor OpenAI de producción no pudo completarse por HTTP 429.

No se modificaron datos históricos ni se desplegaron cambios. No se requieren migraciones de base de datos.
