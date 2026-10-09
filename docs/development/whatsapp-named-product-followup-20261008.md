# Producto mencionado después de una actualización de proveedor

## Caso reportado

Después de actualizar colores del producto anterior y marcar al proveedor HUADA TOY como fabricante, el usuario envió:

> Tambien Fabrica escritorios, esos tienen un Fob de 45 y un tardan 60 dias

El bot informó una actualización de proveedor. El resultado esperado es un producto nuevo «escritorios», asociado al proveedor actual, con FOB 45 sin moneda y entrega de 60 días. El comentario de fabricación propia corresponde al proveedor; las condiciones de los escritorios corresponden al producto nuevo.

## Reproducción y causa

Una prueba determinista del método real `persistPreviousSupplierComments`, con foco en un proveedor sin producto activo y con la extracción comercial del mensaje, reprodujo `update_supplier` con FOB 45 y 60 días antes de interpretar la intención. No se consultaron logs del incidente productivo: se reprodujo un camino del código que produce exactamente el síntoma reportado.

El atajo consideraba mensajes sin palabras como «producto» o «cargar» comentarios del proveedor anterior. Podía escribir y marcar la carga PROCESSED antes de que el modelo identificara un producto mencionado con lenguaje natural. El prompt por sí solo no podía corregir una escritura realizada antes de su ejecución.

## Corrección

Los mensajes independientes de texto/audio pasan al circuito conversacional antes de escribir. El atajo queda limitado a comentarios previos a una nueva tarjeta en una misma ráfaga, conservando la asociación cronológica ya implementada para ese caso. No se agregó un router basado en la palabra «escritorios».

Se agregó al prompt una distinción breve: fabricación propia describe al proveedor; «también fabrica escritorios, FOB 45, 60 días» presenta un producto nuevo y no modifica las condiciones del proveedor ni del producto anterior.

## Verificación

- El test del atajo falla con el código anterior y pasa con el cambio para TEXT y AUDIO; los datos quedan sin procesar para interpretación.
- Prueba con PostgreSQL local: creación mediante herramientas validadas de un único producto «escritorios» del proveedor actual; FOB 45, moneda null, plazo 60; idempotencia y condiciones del proveedor intactas.
- Las condiciones explícitas del proveedor siguen admitiendo actualización directa mediante las herramientas normales, sin confirmación adicional.
- Suite automática con base local: 647 aprobadas, cuatro omitidas, cero fallidas. Typecheck, lint y diff-check aprobados.
- No se ejecutaron evals, inferencia real ni mensajes externos. La prueba de producto prescribe la decisión del modelo y verifica persistencia; no demuestra que el modelo real siempre elija esa operación.

No se repararon registros históricos en producción. El cambio evita el atajo incorrecto para nuevos mensajes independientes; no elimina posibles errores semánticos del modelo ni modifica el procesamiento de comentarios junto a tarjetas.
