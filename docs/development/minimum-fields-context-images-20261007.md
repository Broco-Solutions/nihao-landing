# Carga mínima, contexto y revisión — 2026-10-07

Implementado y desplegado en producción el 7 de octubre de 2026. Sin migraciones nuevas.

- Proveedor: nombre y contacto válido (email, teléfono/fax o WeChat). Categoría opcional.
- Producto: nombre y FOB finito no negativo con moneda. Imagen, MOQ y plazo opcionales. Puede confirmarse vinculado a una captura de proveedor incompleta; al confirmar el proveedor se completa el vínculo `supplierId`.
- Las capturas y productos pendientes aparecen en sus pestañas y permiten entrar al detalle para revisar/reconfirmar, sin repetir los registros ya cargados. Los productos confirmados con proveedor incompleto también aparecen y cuentan como cargados.
- Las imágenes de proveedores y productos se amplían en un diálogo con cierre por botón, Escape o fondo. La selección para análisis es un control separado.
- El contexto prioriza nombre explícito, ordinal y mensaje citado sobre proximidad. Los productos sin proveedor explícito usan el proveedor del mensaje anterior más próximo, también cuando proviene de otro producto. Primero se usa la ráfaga actual; luego las últimas cinco conversaciones terminadas en 24 horas del mismo usuario, instancia, teléfono, viaje y empresa. El orden original de mensajes evita que la finalización de operaciones cambie el destino. Las referencias explícitas ambiguas o desconocidas exigen aclaración.
- La asociación y su motivo quedan persistidos en el recibo. Las ediciones de registros confirmados conservan su aprobación existente. El nuevo motivo de confirmación de producto es `NAME_AND_FOB_PRESENT`; los recibos históricos con `NAME_AND_IMAGE_PRESENT` siguen siendo compatibles.

Validación: 559 pruebas aprobadas, sin fallos ni omisiones, incluidas ambas suites PostgreSQL locales y replays completos. Se cubren mínimos web/WhatsApp, proveedor incompleto, referencias ordinales, mensaje anterior, herencia entre productos y continuidad a la conversación siguiente. Typecheck y lint sin errores; tres advertencias de navegación preexistentes. La validación visual quedó limitada: Chromium aborta al arrancar en este entorno macOS.

## Publicación

Despliegue autorizado por el usuario, realizado mediante upload del worktree por CLI, sin push de Git.

- Vercel: `dpl_3EjTphLHPKmF1L2ZAtjUR3BozmeL`, estado `READY`; dominio https://www.nihaonegocios.com.
- Railway, servicio `nihao-bot`, entorno `production`: `fdfc46f7-4f31-43ff-8560-a25881e2010e`, estado `SUCCESS`; API https://api.nihaonegocios.com.
- Builds de producción completados en ambas plataformas. Railway verificó 26 migraciones y ninguna pendiente; servidor Next listo.
- Smoke de lectura: web y `/app` devuelven 200, sesión anónima 200/null en web y API, viajes y cron de WhatsApp devuelven 401 sin autorización. Sin envío de mensajes ni creación de registros de prueba en producción.
- Se usó un resolver DNS y proxy temporales locales para las CLI debido a la falta de DNS del entorno; no se alteró la configuración de producción.
