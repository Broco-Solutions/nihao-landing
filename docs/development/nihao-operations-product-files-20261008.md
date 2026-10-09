# Operaciones compartidas: archivos y finalización de productos

Fecha: 8 de octubre de 2026.

Estado: **IMPLEMENTADO LOCALMENTE, sin publicación**. Continúa la [actualización de productos](nihao-operations-product-updates-20261008.md) y el [plan de separación](../architecture/nihao-operations-separation-plan.md).

## Operaciones extraídas

`lib/nihao/operations/product-files.ts` incorpora dos operaciones, sin dependencias del modelo ni del canal:

- `assignProductAttachment`: valida permisos, captura, producto y archivo, y guarda el vínculo. La web mantiene asignación, reasignación entre productos de la misma captura y desasignación de imágenes de producto. La automatización conserva también audios, tarjetas y otros originales como evidencia, pero no desasigna ni mueve archivos que ya pertenecen a otro producto.
- `finalizeProduct`: enlaza los archivos esperados, combina la evidencia con la trazabilidad previa y deriva el estado vigente del producto. Retorna nombre, estado y si se confirmó en esta ejecución. El canal traduce ese resultado al recibo existente.

El PATCH web de asociación y el materializador legacy de WhatsApp delegan sus enlaces en `assignProductAttachment`. La finalización v3 delega enlaces, sourceEvidence y estado en `finalizeProduct`.

No cambian las reglas de extracción, el proveedor del contexto, las respuestas conversacionales ni los contratos de herramientas. Un producto con nombre válido puede confirmarse sin foto/precio; una foto sola no confirma `Producto sin nombre`. Los confirmados no se degradan.

## Transacciones y recuperación

La transferencia a R2, creación recuperable del adjunto y transcripción siguen en los servicios existentes, fuera de transacciones largas. Se mantienen los IDs determinísticos `waea_...` y `waep_...`.

En v3 se elimina la actualización de `attachment.productId` que antes ocurría durante la subida, por fuera del recibo. Después de que todos los originales se recuperan y suben correctamente, la transacción final:

1. Comprueba lease/revisión y autorización del runtime.
2. Verifica que la operación siga `WRITTEN`.
3. Autoriza nuevamente el destino en el negocio y bloquea el producto.
4. Enlaza adjuntos, combina trazabilidad y deriva el estado.
5. Actualiza contexto y recibo a `COMPLETED`.

Si falla cualquier paso, se revierten juntos vínculos, trazabilidad, estado y recibo. Los originales y metadatos previamente subidos permanecen disponibles para reintentar. Las operaciones históricas que ya tienen algunos archivos asociados pueden repetir la finalización sin crear vínculos duplicados; si una imagen fue reasignada manualmente a otro producto, la automatización rechaza el movimiento en vez de recuperarla silenciosamente.

La operación bloquea el producto y los archivos. Los lotes adquieren locks de archivos en orden estable. Autoriza el destino una vez por finalización; no repite las consultas de acceso por cada archivo. Así se conservan los campos y fuentes de dos finalizaciones concurrentes sobre el mismo producto.

El materializador legacy conserva su secuencia histórica: crea/recupera producto y enlaza cada archivo después de subirlo, sin recibos v3 ni atomicidad de lote. Sólo se migró su operación de vínculo. No se presenta esa ruta como transacción única de carga completa.

## Evidencia visual

La clasificación visual y asociación inequívoca siguen en el adaptador. La operación común valida que cada nueva prueba `productImageVerified=true` se refiera a un adjunto enlazado al producto, de tipo PRODUCT_IMAGE y con metadata válida (MIME, tamaño y clave de almacenamiento).

No realiza visión ni comprueba bytes en R2 dentro de la transacción. No deriva condiciones comerciales desde imágenes. Conserva las fuentes existentes y completa las nuevas por ID de evidencia; sus metadatos de mensajes/cargas son datos de procedencia, no tipos o decisiones de conversación importados al dominio.

La finalización de proveedores continúa en `reconcileSupplierConfirmation`, sin migrarse en esta sección. Tampoco se extraen aún subida/borrado físico, promoción de capturas ni creación implícita por reanálisis.

## Validación

Sin evals de IA, replays, orquestador ni mensajes de WhatsApp. Sólo operaciones directas y validaciones determinísticas:

- 32 tests aprobados, sin fallos ni omisiones: creación, actualización, archivos/finalización y parsers. Incluyen nueve nuevos escenarios de archivos, más su contenedor.
- Casos nuevos: asignación/reasignación/desasignación web; tipos de evidencia automática; preservación de trace; reintentos; mínimos de confirmación; pruebas visuales inválidas; archivos ajenos; permiso revocado; captura eliminada; archivo faltante; rollback de recibo y finalización concurrente.
- Se usan sólo registros sintéticos en PostgreSQL temporal `127.0.0.1:15437/nihao_agent_test`. Los tests de archivos crean metadata sintética; no certifican una transferencia real a R2 ni entrega física por WhatsApp.
- TypeScript, lint de módulos modificados y `git diff --check`: aprobados.
- Build Next.js con Webpack: aprobado con Node 24 y URL de base temporal explícita.

Logs temporales: `/tmp/nihao-files-tests.log`, `/tmp/nihao-files-typecheck.log`, `/tmp/nihao-files-lint.log` y `/tmp/nihao-files-build.log`. No son evidencia durable de release. No hubo nuevas migraciones, cambios en bases del proyecto o despliegue.

## Próxima sección

Migrar operaciones de proveedor y captura, empezando por actualización compartida de datos/notas y confirmación. Caracterizar la creación implícita durante extracción y reanálisis antes de extraerla. Siguen pendientes búsquedas/lecturas y eliminación; no se declara finalizado el plan.

Continuación implementada: [proveedores, borradores y confirmación automática](nihao-operations-suppliers-20261008.md).
