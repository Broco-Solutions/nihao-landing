# Continuidad de productos y aclaraciones de WhatsApp

## Comportamiento

- Las condiciones comerciales sin producto identificado se guardan como evidencia pendiente del proveedor anterior. No reemplazan sus condiciones generales.
- «Son botellas» completa el nombre y crea el producto con esa evidencia. La aplicación de condiciones y su consumo son transaccionales.
- Las condiciones y notas posteriores actualizan el producto activo cuando hay un destino único. La intención explícita de actualizar el proveedor conserva su precedencia.
- La búsqueda y la autorización comparten equivalencias de singular/plural. Los términos distintivos resuelven coincidencias; las categorías con varios candidatos requieren aclaración.
- El contexto implícito de productos se limita al proveedor activo; los productos de proveedores anteriores no se convierten en candidatos implícitos.
- La respuesta a una pregunta se vincula al mensaje y a la opción elegida. Una tarjeta posterior inicia otra carga y sus condiciones no reemplazan esa respuesta.
- Un trabajador con una revisión antigua no puede sobrescribir la respuesta recibida en una revisión nueva.
- Las opciones persistidas se pueden resolver con el nombre indicado por el usuario. Los destinos ambiguos conservan sus evidencias.

## Verificación

Pruebas deterministas locales con PostgreSQL, lectores preparados y proveedor de conversación que rechaza cualquier inferencia para las continuaciones inequívocas. Incluyen condiciones pendientes, nombre posterior, notas, variantes singular/plural, candidatos ambiguos, procedencia de los datos, entrega duplicada y finalización de una revisión antigua.

Se verifica además que las imágenes y los datos con referencias explícitas conservan sus destinos y originales. No se envían mensajes a usuarios ni se modifica su historial para validar esta entrega.

La primera ejecución de `pnpm test` incluyó los replays offline definidos por la suite; las siguientes verificaciones excluyen `whatsapp-replay.test.mts`. No se ejecutan evaluaciones con modelos externos. La prueba opcional de IA real permanece deshabilitada.

No requiere migraciones de esquema ni reparación de datos históricos.
