# Continuidad de cargas pendientes — 2026-10-08

## Caso observado

La imagen y las condiciones comerciales quedaron en una conversación, el nombre «Paragolpes Volkswagen» en otra y las respuestas de moneda/confirmación en nuevas conversaciones. Había once conversaciones WAITING previas. El router aceptaba texto libre para todas ellas y sólo retomaba una cuando había una coincidencia única. La memoria de recursos terminados no recuperaba el nombre pendiente; la validación literal rechazaba nombres ausentes de la nueva ráfaga.

## Implementación

- `WhatsAppAgentContext.focus.activeBurstId` guarda el destino de la última entrega aceptada bajo el lock de conversación. Al instalar esta versión, se inicializa a partir del último mensaje recibido, incluyendo conversaciones DONE. Las preguntas antiguas no compiten por respuestas libres; siguen disponibles mediante citas, selecciones firmadas y nombres explícitos. La propiedad es JSON y no necesita migración.
- El foco de recursos y el destino de mensajes son independientes. Los reinicios conservan el puntero de enrutamiento pero vacían las referencias comerciales. Un contexto creado sólo para enrutamiento todavía puede inicializar sus recursos a partir de operaciones completadas anteriores.
- Las preguntas conservan productos, mensajes y evidencias de origen. Cada producto mantiene su procedencia; omitir productos en una nueva pregunta no borra los anteriores. Una aclaración de una carga de producto se asocia a su logicalLoad, sin recurrir a proximidad con otras imágenes.
- El prompt exige registrar con nombre válido y proveedor resuelto. El backend rechaza preguntas de moneda, descripción, modelo, precio, MOQ o plazo para un producto nombrado, y preguntas repetidas de nombre/confirmación cuando el destino está identificado y no hay varios productos pendientes. Los campos opcionales ausentes permanecen vacíos.
- Respuestas únicamente de moneda (`en dólares`, USD, EUR, CNY y sus nombres normalizados) aportan sólo la moneda; no aportan ni reemplazan el importe anterior y se consideran continuación del producto activo.

## Recuperación de fragmentos anteriores

Al retomar una conversación WAITING se puede recuperar una respuesta de nombre que quedó en otra conversación. Se exige: referencia exacta de evidencia a un solo padre WAITING, pregunta original de nombre, respuesta explícita de nombre, un único producto original sin registrar, proveedor con nombre idéntico y contexto compatible, y ausencia de escrituras de dominio en el fragmento. No se recuperan selecciones firmadas ni preguntas con opciones.

La recuperación ocurre bajo el mismo lock y transacción que la recepción. Los mensajes conservan IDs, contenido y fechas; se vinculan a la carga original con secuencias nuevas y procedencia `recoveredFromBurstId`/`recoveredFromSequence`. El fragmento queda DONE con referencia al destino; no se crean proveedores/productos durante esta operación. Las cargas ambiguas permanecen intactas.

## Validación y alcance

Typecheck, ESLint de los archivos modificados y revisión de whitespace completados sin errores. No se agregaron ni ejecutaron tests en esta implementación. No se ejecutó recuperación sobre datos reales ni se enviaron mensajes en producción. Los cambios se desplegaron en producción el 8 de octubre de 2026; ver publicación abajo. La interpretación del modelo real y el recorrido completo de WhatsApp quedan pendientes de validación.


## Publicación

Publicación autorizada por el usuario mediante upload por CLI de una copia aislada de HEAD `af6d89931804b27fe76c0568f6c688ab7e311db3` más los cambios de esta implementación, sin push de Git.

- Railway `nihao-bot` / `production`: `a55a97ed-aac2-4476-a572-48d0ceefafdd`, estado SUCCESS, servidor listo y sin operaciones pendientes.
- El predeploy verificó las migraciones existentes y confirmó que no había migraciones pendientes.
- Vercel: `dpl_32Y8SsEcageYSEUihoddeeXqdDbo`, estado READY, promovido a https://www.nihaonegocios.com.
- Verificaciones de lectura: `/` y `/app` 200; sesión anónima 200; viajes y cron 401 sin autorización, en web y API. Confirman disponibilidad; no prueban la interpretación del modelo en WhatsApp.
- Versiones previas para rollback: Railway `71ffea28-33a1-44a8-b470-a1c47c6c33f1`; Vercel `dpl_4HXotq7qgMGq4fR9TK1Fo3y5FgE4`.
- Esta constancia se agregó localmente después del despliegue. Se usaron resolver DNS y proxy temporales locales, sin cambiar configuración de producción.
