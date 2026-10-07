# Persistencia de tarjetas antes de confirmar identidad

Auditoría del modelo actual:

- `SupplierCapture` admite nombre/contacto nulos, estado `DRAFT`, adjuntos y evidencia JSON. Es la carga persistida de una tarjeta incompleta.
- `Supplier` referencia una captura única. Se crea al confirmar; no hace falta un nuevo modelo o estado de base de datos.
- `LogicalLoad` es parte del grafo persistido de la ráfaga. `PROCESSED` indica que se guardó la carga y su original; el recibo distingue `DRAFT` de `CONFIRMED`.
- `NEEDS_REVIEW` antes excluía tarjetas del worker y de la escritura. Ahora la ingestión automática guarda esas imágenes como capturas independientes; la incertidumbre sigue registrada en la lectura, el error del grafo y la provenance de la captura.
- La completitud existente exige nombre y al menos un contacto válido. Se reutiliza sin modificar modelos de IA, reasoning, prompts de lectura ni thresholds.

`persistImageLoad` usa las lecturas existentes, un ID por carga lógica y los recibos durables existentes. Guarda el draft primero, adjunta el original y sólo completa el recibo después de guardar los adjuntos. Las fallas de storage se reintentan sobre la misma captura. Las imágenes sin proveedor identificable también generan una captura sin nombre. Si faltan viaje/empresa autorizados, el original y el grafo se conservan en la ráfaga mientras se solicita ese contexto; nunca se inventa una pertenencia.

Los conflictos de OCR/visión y de lecturas independientes se conservan completos en `SupplierCapture.evidence`, con `kind=WHATSAPP_CAPTURE_PROVENANCE`. Sólo los campos sostenidos por evidencia pasan a la captura. Los campos adicionales y las notas literales con respaldo se conservan. El reanálisis retiene esta provenance y la referencia al original.

Una identidad inequívoca puede vincular la tarjeta al proveedor existente conservando el nuevo original. Una coincidencia posible guarda otra captura y sus candidatos; no modifica al proveedor existente. Las relaciones ambiguas entre tarjetas no autorizan agrupar capturas ya persistidas por separado.

La confirmación se comparte entre WhatsApp y las correcciones del editor web de estas capturas. Completar nombre/contacto promueve la misma captura y mantiene imágenes, provenance y productos asociados. Las capturas ajenas a este pipeline mantienen su flujo manual de edición web.

El resumen cuenta recibos completos y separa proveedores confirmados de proveedores ya cargados pendientes de confirmación. Una operación con estado `WRITTEN` y media todavía pendiente no se anuncia como carga completa.

Validación: tests con PostgreSQL exclusivamente local para lecturas ambiguas, nombre aislado, teléfono dudoso/email válido, conflictos, identidad existente ambigua, imagen ilegible, creación sin pregunta, reintentos, reanálisis, completitud posterior en WhatsApp/web y ráfagas completas. Los replays A/B/J ahora esperan capturas guardadas con incertidumbre, en lugar de descartar la escritura.

## Publicación autorizada el 7 de octubre de 2026

El usuario solicitó desplegar en producción después de la implementación local. Se publicó el worktree mediante upload de CLI, sin push de Git ni cambios de variables/configuración/modelos.

- Railway `nihao-bot`, entorno `production`: deployment `e6abd27d-3ba2-4e9e-bdc6-dccd636bb22c`, estado `SUCCESS`. API: https://api.nihaonegocios.com.
- Vercel: deployment `dpl_B3dXqvkZoVgK89pYTguLVZ9S8Qgm`, estado `READY`, promovido a https://www.nihaonegocios.com.
- Ambos builds remotos de producción completaron. La compilación local quedó limitada por DNS al descargar Google Fonts; no se modificaron fuentes para resolver esa limitación del entorno.
- El predeploy de Railway confirmó 26 migraciones y ninguna pendiente.
- Smoke de sólo lectura: web y `/app` responden 200; sesión anónima responde 200/null en web y API; viajes y cron de WhatsApp rechazan acceso anónimo con 401. No se enviaron mensajes WhatsApp ni se crearon registros de prueba en producción.
- Validación local previa: typecheck y lint de archivos modificados aprobados; 510 tests pasan, dos fallos preexistentes por expectativas de `deletedAt` y dos tests omitidos.
