# Separación interna de operaciones: cierre del alcance local

Fecha: 8 de octubre de 2026.

Estado: **IMPLEMENTACIÓN INTERNA DEL ALCANCE COMPLETADA LOCALMENTE. UAT Y PUBLICACIÓN PENDIENTES**.

Continúa [corrección y confirmación manual](nihao-operations-capture-review-20261008.md) y el [plan de referencia](../architecture/nihao-operations-separation-plan.md). El usuario autorizó completar los cambios que preserven las reglas existentes en una sola pasada y excluyó las evals de IA. No se creó una API HTTP interna ni se cambió el runtime/modelo.

## Resultado

La web y los caminos de WhatsApp v3 y legacy compuestos en producción delegan las mutaciones de productos y proveedores/capturas en operaciones compartidas. `PrismaAgentDomain` mantiene interpretación, selección contextual, preparación de evidencia, fencing, recibos y estado conversacional. Las operaciones reciben identidad y alcance del servidor y un cliente transaccional; no importan contratos del canal o del modelo.

Se reutilizan los parsers, reglas y repositorios existentes bajo `lib/bot` como dependencias del negocio. No se duplicó su implementación ni se movieron por estética. `AttachmentService` sigue siendo el servicio compartido de almacenamiento/autorización; transferencia, transcripción y borrado físico permanecen allí. Los reportes administrativos, dashboard y gestión de viajes conservan sus servicios especializados existentes.

## Inventario de consumidores

| Camino | Operaciones/servicio común | Responsabilidad que conserva el consumidor |
| --- | --- | --- |
| Web, POST de captura y extracción | `OperationsCaptureRepository` → `createSupplierCapture` / `replaceSupplierExtraction` | Autenticación HTTP, parser del pedido, proveedores de extracción fuera de la transacción y DTO. |
| Composición legacy de captura, batches y bursts | Mismo port con modalidad `automation` | Orden, selección, estado de carga y entrega de respuestas. |
| WhatsApp v3, captura automática y tool de creación | `createSupplierCapture` + `enrichSupplierCapture` | Datos extraídos, identidad/reconciliación, evidencia y recibo en la transacción vigente. |
| Notas de captions y reutilización de un proveedor | `enrichSupplierCapture` + `updateSupplier` | Procedencia, selección del proveedor y memoria. |
| Finalización de proveedor/evidencias v3 | `finalizeSupplierEvidence` + `autoConfirmSupplierCapture` | Recepción/subida de originales y cierre transaccional del recibo. |
| Web y WhatsApp, creación/edición de producto | `createProduct` / `updateProduct` | Contratos históricos y resolución conversacional del destino. |
| Asociación y finalización de producto | `assignProductAttachment` / `finalizeProduct` | Transferencia recuperable y clasificación visual. |
| Corrección humana y confirmación revisada | `correctSupplierCapture` / `confirmSupplierCapture` | HTTP y DTO; la confirmación automática posterior se conserva. |
| Consulta web de captura/proveedor/listas/productos | Port de operaciones / `getCaptureDetails` / `captureProducts` | Formatos y orden histórico de respuestas. |
| Consulta y búsqueda principal del agente | `getBusinessRecord`, `supplierCandidates`, `productCandidates`, `operationCompanies` | Ranking literal/fuzzy existente y desambiguación por conversación. |
| Catálogo de viajes/empresas/proveedores del runtime | `userTripCatalog` | Consumo del catálogo y preguntas de selección. La elegibilidad conserva un reexport compatible. |
| Borrados web de proveedor/producto | `deleteSupplierRecord` / `deleteProduct` | HTTP y registro del resultado. No se agregaron tools de eliminación. |
| Bootstrap y limpieza de tarjeta legacy | `createEmptyEvidenceCapture` / `deleteEmptySupplierCapture` | Estado PENDING/ANALYZING/ANALYZED y recibos del comando. |

En las filas anteriores, los servicios de operaciones son el punto de entrada para el negocio. Los repositorios de persistencia conservan escrituras internas y wrappers compatibles; no son una segunda implementación de reglas en el canal.

## Reintentos, concurrencia y permisos

- La creación con ID estable toma un advisory lock y recupera la captura existente sin reescribir su producto implícito. Valida viaje, autor y empresa, y rechaza capturas eliminadas. Conserva los prefijos de IDs históricos.
- Captura y producto extraído implícito se crean/reemplazan en la misma transacción. No se mueve extracción, visión, audio o almacenamiento dentro de transacciones largas.
- La composición de extracción entrega la versión leída antes de llamar al proveedor. Si hubo una edición durante el análisis, se rechaza el resultado tardío. La operación comprueba además que los adjuntos analizados pertenezcan a la captura.
- Las notas y procedencia de captura se combinan bajo bloqueo de fila, evitando pérdida de cambios concurrentes. La trazabilidad recibida es metadata preparada por el consumidor, no un contrato conversacional importado al dominio.
- La modalidad automatizada comprueba TRAVELER, viaje activo/planificado y membresía de empresa activa. La edición web conserva sus permisos históricos. Las lecturas respetan empresa explícita; los borradores eliminados quedan fuera del catálogo de candidatos.
- El borrado de producto bloquea su fila y conserva la obligación de desasignar imágenes. El borrado de proveedor conserva tombstone y originales, elimina contactos/productos conforme a cascadas existentes y bloquea su resurrección.
- Las transacciones v3 siguen incluyendo fencing, escritura y recibo. Los caminos legacy conservan su secuencia histórica de almacenamiento y estado; esta refactorización no los convierte en cargas completas atómicas de extremo a extremo.

## Inspección de límites

Se revisaron imports y llamadas a Prisma en los consumidores migrados:

- `lib/nihao` no importa `lib/channels`, `AgentState`, `BurstSnapshot` ni contratos del modelo.
- `PrismaAgentDomain`, el materializador de productos, el batch de WhatsApp y los endpoints de capturas/proveedores/extracción no escriben directamente columnas del negocio.
- Las escrituras restantes en `prisma-card-repository.ts` modifican solamente `whatsappCardState`, un estado de procesamiento del runtime que está físicamente almacenado en la captura. La detección/selección de tarjetas pendientes conserva lecturas de ese estado en los repositorios del canal. Su creación y borrado de negocio sí delegan.
- Los checkpoints, leases, propuestas históricas, outbox y recibos permanecen en el runtime. Las reglas de aprobación histórica no se convierten en nuevos pedidos de confirmación conversacional.
- Upload/download/delete de archivos continúan en `AttachmentService` y sus repositorios. La separación no requiere envolver estos servicios existentes con funciones sin comportamiento adicional.

## Evidencia de validación

Referencia Git del workspace: `af6d89931804b27fe76c0568f6c688ab7e311db3`. El estado probado incluye cambios locales previos del usuario y esta refactorización; no es ese commit por sí solo. No se creó un commit ni se publicaron los cambios. El [manifiesto de archivos verificados](nihao-operations-validation-20261008.json) identifica contenidos mediante SHA-256 y no se presenta como evidencia de una release.

- **87 tests determinísticos aprobados, 0 fallos, 0 omisiones**: operaciones de productos/proveedores/capturas, parsers, revisión/reconfirmación, mínimos, extracción y composición con proveedor simulado, búsqueda y permisos de viaje.
- Los casos nuevos incluyen reintentos concurrentes de captura/producto implícito, rollback, correcciones humanas, evidencia ajena, cambios durante extracción, notas concurrentes, consulta por empresa, empresas inactivas, borrados y tombstones, bootstrap/recibos legacy y catálogo.
- TypeScript, lint de módulos modificados, build Next.js con Webpack y Node 24, y `git diff --check`: aprobados.
- PostgreSQL temporal exclusivamente: `127.0.0.1:15437/nihao_agent_test`, registros sintéticos; servidor detenido después de validar. Sin nuevas migraciones ni cambios en bases del proyecto.
- Sin evals de IA, modelos reales, replays conversacionales, transferencias reales a R2 o mensajes externos de WhatsApp.

Logs temporales: `/tmp/nihao-close-tests.log`, `/tmp/nihao-close-typecheck.log`, `/tmp/nihao-close-lint.log` y `/tmp/nihao-close-build.log`. Se ejecutó el typecheck final después del build, porque Next regenera los archivos de tipos durante la compilación.

## Rollback y publicación

No hay nuevas tablas, columnas o estados persistidos que revertir. Las claves de operaciones, IDs y formatos de recibos/checkpoints se conservan; los wrappers del repositorio siguen disponibles. Para una publicación posterior:

1. Preparar un commit revisable que distinga estos cambios de los cambios locales previos y validar ese commit. Este documento no certifica producción.
2. Probar en el entorno de prueba los recorridos físicos de web/WhatsApp y recuperación de una carga con archivos. No requiere evals de modelo como parte de este trabajo.
3. Conservar el artefacto anterior y registrar su revisión y configuración. Detener la toma de nuevos trabajos, terminar/liberar trabajos en curso y publicar el artefacto probado según el procedimiento del proyecto.
4. Si hay una regresión, detener nuevos trabajos y restaurar el artefacto anterior con la misma base y configuración. Conservar registros/evidencias y recibos existentes. Revisar operaciones WRITTEN y leases antes de reanudar para evitar procesamiento simultáneo de versiones.
5. No borrar registros ni aplicar `git reset` al workspace para simular rollback: contiene cambios previos del usuario. El rollback operativo debe restaurar un artefacto conocido.

## Qué falta del plan completo

El código de la separación interna del alcance está implementado y validado localmente. Falta aceptación física del recorrido exacto, preparación/revisión de un commit publicable, validación del artefacto de release, publicación al entorno correspondiente y comprobación operativa de rollback. Producción necesita autorización explícita. La API independiente sigue siendo una evolución opcional. Los ejemplos del manual todavía no deben presentarse como probados físicamente por esta validación.

Validación posterior ampliada: [661 tests aprobados y smoke HTTP autenticado](nihao-operations-expanded-validation-20261008.md), con correcciones de compatibilidad legacy. Reemplaza la cifra anterior de 87 como resultado más reciente; el UAT físico continúa pendiente.
