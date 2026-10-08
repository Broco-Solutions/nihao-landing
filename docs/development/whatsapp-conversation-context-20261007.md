# Contexto conversacional persistente de WhatsApp

## Problema y cambio

El agente consultaba referencias recientes sólo cuando el texto coincidía con determinadas palabras. Las herramientas de resolución también quedaban ocultas para aclaraciones cortas. El historial se limitaba a cinco conversaciones de las últimas 24 horas; los productos de la ráfaga actual no compartían el mismo resolver que los proveedores. El router aceptaba principalmente opciones exactas, respuestas numéricas o citas de preguntas, dejando respuestas libres en una nueva ráfaga.

Se agrega `WhatsAppAgentContext`, independiente del selector legacy de viaje/empresa, por usuario, instancia y teléfono. Su foco no vence por tiempo. Conserva proveedor, productos candidatos, contexto autorizado, operaciones y mensajes de origen. El historial reciente mantiene su ventana como respaldo de compatibilidad, pero no determina la duración del foco.

El foco se actualiza al completar escrituras y selecciones explícitas. Leer o buscar registros no lo cambia. Un producto mantiene su proveedor; varios productos creados en una misma revisión permanecen candidatos y requieren aclaración. Otra revisión o proveedor cambia el foco. Reinicio explícito, cambio de viaje/empresa, eliminación y permisos revocados impiden usar un destino anterior. Las operaciones completadas se registran con el foco dentro de la misma transacción, después de persistir medios; reintentos no repiten cambios de foco.

El 8 de octubre se amplía el respaldo de referencias recientes de cinco a diez ráfagas terminadas. Se conserva la ventana de 24 horas y el aislamiento por usuario, teléfono e instancia.

Validación de esta ampliación: 23 pruebas de memoria/contexto aprobadas con PostgreSQL local, incluida la exclusión de la undécima ráfaga; suite normal 455 aprobadas y 22 omitidas; suite ampliada 571 aprobadas, 2 omitidas y los mismos 9 fallos preexistentes (7 individuales y 2 contenedores), reproducidos nuevamente sobre el código anterior. Typecheck, lint sin errores y diff-check aprobados. El build local con Webpack terminó correctamente; Turbopack local no pudo descargar Google Fonts por un problema de conexión de esta máquina.

## Resolución y aclaraciones

El contexto validado se entrega desde el comienzo al modelo y permite heredar viaje/empresa. `resolve_recent_reference` está disponible sin filtro por palabras y consulta la ráfaga actual, el foco y las referencias históricas. Respuestas pendientes, nombres, citas a mensajes del usuario o respuestas del bot y ordinales preceden al destino implícito. Una referencia explícita desconocida no se sustituye por el foco. Las escrituras vuelven a validar destino y versión bajo el lock de conversación.

Respuestas libres y audios pueden reanudar una aclaración pendiente única; imágenes independientes y pedidos textuales de cargas nuevas conservan su enrutamiento propio. El modelo recibe la pregunta y evidencias originales, y distingue respuestas de nuevos pedidos. Con varias preguntas compatibles, el router no elige una arbitrariamente.

Una aclaración comercial o nota del recurso activo usa update, no create. El backend rechaza intentos de creación detectados como continuación. La memoria sólo aporta identidad: precios, MOQ, plazos y notas nuevos requieren evidencia literal del mensaje. Las correcciones nuevas se aplican directamente, también sobre confirmados, preservando campos no solicitados, estado, idempotencia y valores anteriores en el receipt. Las propuestas PROPOSED existentes conservan aprobación, cancelación, expiración y control de versión.

## Migración y validación

Aplicar `20261007180000_whatsapp_agent_context` antes de desplegar el código y regenerar Prisma. La migración es aditiva. La inicialización de instalaciones existentes usa el último flujo con escrituras completadas, ordenadas por operación/revisión; búsquedas y consultas no se convierten en foco. La migración y el despliegue se completaron en producción el 7 de octubre de 2026; ver publicación abajo.

Pruebas nuevas cubren proveedor → producto → aclaración entre ráfagas, foco después de varios días, corrección directa, reintentos, varios candidatos, selección numérica, citas de usuario/bot, versión concurrente, reinicio y autorización. También se recorre el orquestador con respuestas del modelo controladas y el dominio PostgreSQL real. Las pruebas de propuestas antiguas usan fixtures explícitos de filas previas a este cambio.

La suite completa conserva siete fallos individuales preexistentes (nueve incluyendo sus dos tests contenedores): cinco escenarios multimodales esperan DRAFT cuando el código existente confirma por nombre, y dos replays G esperan cero confirmaciones. Se reprodujeron sobre HEAD anterior en una copia aislada. No corresponden a la corrección de contexto.

La evaluación con modelo real se intentó contra una base local de pruebas y no pudo completar la primera llamada: DNS devolvió ENOTFOUND para api.openai.com. La validación disponible no prueba la interpretación del modelo real en producción.


## Publicación en producción

Despliegue autorizado por el usuario y realizado el 7 de octubre de 2026 mediante upload por CLI de una copia aislada de HEAD más los cambios de contexto, sin push de Git. Los scripts locales de evaluación ajenos al cambio fueron excluidos.

- Railway `nihao-bot` / `production`: `e7917003-d75b-4e0c-b9e6-244874d847c4`, estado `SUCCESS`, sin operaciones pendientes.
- El predeploy encontró 28 migraciones y aplicó `20261007180000_whatsapp_agent_context` correctamente antes de arrancar el servicio.
- Vercel: `dpl_7VAT1QLE2n5c5KxCpxPkfD2NZzfA`, estado `READY`, promovido a https://www.nihaonegocios.com después de la migración.
- Smoke de lectura: web y `/app` 200; sesión anónima 200 en web y API; viajes y cron de WhatsApp 401 sin autorización en ambas plataformas. No se enviaron mensajes ni se crearon registros de prueba en producción. Estas verificaciones confirman disponibilidad, no la interpretación del modelo real.
- Referencias anteriores para rollback del código: Railway `0e4a597a-ad6d-45cf-a775-185d0c421806`; Vercel `dpl_ARQCTwBEuFejo5VRm6N7ikkq2PzR`. La nueva tabla es aditiva y no necesita eliminarse para volver al código anterior.
- Se usaron resolver DNS y proxy temporales locales para las CLI; no se modificó la configuración de producción. Esta constancia se agregó localmente después de publicar los builds.
