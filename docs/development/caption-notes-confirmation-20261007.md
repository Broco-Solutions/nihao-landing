# Comentarios, notas y confirmación de tarjetas

Los campos mínimos deciden la confirmación: proveedor con nombre y un contacto utilizable, producto con nombre y FOB con importe y moneda. Las diferencias de lectura y coincidencias con otros proveedores se conservan como evidencia y no eliminan campos ni bloquean una captura con mínimos. No se fusionan proveedores por una coincidencia dudosa.

Cuando faltan mínimos, se vuelve a leer el original mediante `WHATSAPP_CARD_FALLBACK_MODEL` (por defecto `mistral-large-4-0`). La respuesta y la etapa quedan guardadas para reintentos. Se aceptan respuestas de texto o bloques de razonamiento/texto del modelo. Si todavía faltan mínimos, queda un borrador.

El nombre chino se conserva en `companyName` y su romanización en `companyNameLatin`. Se prefiere el nombre comercial inglés impreso. Las vistas y búsquedas usan ambos nombres.

Los comentarios adjuntos pertenecen a su tarjeta salvo referencia explícita a otro proveedor. Se extraen notas de proveedor y productos; las condiciones comerciales tienen evidencia literal. Un producto mencionado puede confirmarse sin fotografía. La tarjeta conserva su clasificación como tarjeta, no se convierte en foto de producto. IDs determinísticos evitan repetir los productos del comentario.

Notas son editables en proveedores, capturas y productos. El agente agrega sin duplicar ni truncar; el editor web reemplaza o vacía. Información literal sin columna propia permanece en notas y el original se conserva.

Validación: 564 pruebas aprobadas, incluidas suites PostgreSQL y replays sin red; typecheck y lint sin errores (tres advertencias de navegación preexistentes). La compilación local no pudo descargar Google Fonts; se verificará la compilación de producción en las plataformas de despliegue. Chromium sigue sin poder arrancar en el entorno local.

## Reparación de la ráfaga existente

Se reparó la ráfaga `83e7f174-7f39-4f23-a672-dc6cdda176fe`, revisión 4. Se revisaron las cuatro imágenes originales, se corrigieron nombres/contactos extraídos y se conservaron las lecturas previas como provenance. Se mantuvieron las cuatro capturas y sus adjuntos originales; el proveedor que ya estaba confirmado conserva su ID. Las notas generadas por el OCR anterior se sustituyeron por la lectura del original y los comentarios correspondientes.

Los cuatro proveedores quedaron confirmados: Henan Chuxin Paper Technology, Kazuo Beiyin Paper and Plastic Packing, MARSHALLOM Metal Manufacture (nombre chino original conservado) y Able Packaging. Se creó una vez `vasos`, con FOB USD 30 y `de color rojo y verde` en notas, relacionado con el primero. Fábrica/descuento corresponde al segundo y la opinión de confiabilidad al tercero. No se asignó una puntuación por esa opinión. No se modificó el outbox ni se reenviaron respuestas de WhatsApp.

La reparación corrió en una transacción con bloqueo de la ráfaga, comprobación de revisión y vinculación exacta de mensajes, operaciones, capturas y originales. Se guardó una copia privada previa fuera del repositorio.

## Publicación y verificación final

- Vercel dpl_7hbzt2djrUHtTf6x5BeS39rKfxcS: READY, https://www.nihaonegocios.com.
- Railway b63df174-eaca-4772-ac4b-b6265981cd13: SUCCESS, https://api.nihaonegocios.com. Build terminado, migraciones aplicadas y servidor listo.
- Suite final: 564 pruebas aprobadas sin omisiones ni fallos. Typecheck y lint sin errores; sólo tres advertencias anteriores.
- Verificación de reparación mediante el modelo usado por las pestañas: cuatro proveedores confirmados, un producto vasos confirmado con FOB USD 30 y notas de colores, cuatro originales conservados. Un único recibo WhatsApp enviado, sin nuevos envíos.
- Smoke final de lectura: web y /app 200; sesión anónima web/API 200/null; viajes y cron sin autorización 401.
