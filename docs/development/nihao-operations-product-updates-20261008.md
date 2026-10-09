# Operaciones compartidas: actualización de productos

Fecha: 8 de octubre de 2026.

Estado: **IMPLEMENTADO LOCALMENTE, sin publicación**. Continuación de la [creación compartida](nihao-operations-first-slice-20261008.md) y del [plan de separación](../architecture/nihao-operations-separation-plan.md).

## Cambio

`lib/nihao/operations/update-product.ts` concentra la autorización del destino, lectura vigente del producto, validación y aplicación de patches parciales. El PATCH web y `PrismaAgentDomain.applyPatch` delegan en esta operación. También la usan indirectamente las resoluciones de propuestas históricas que llaman `applyPatch`.

Se extrajo `product-access.ts` para que creación y actualización compartan exactamente la misma autorización de captura. Conserva los perfiles existentes: web con alcance por viaje/empresa y administración, automatización limitada a TRAVELER en viaje activo/planificado y empresa activa con membresía. No se aceptan capacidades o identidad elegidas por un body o por el modelo.

La operación recibe una transacción del consumidor. En WhatsApp permanecen dentro de esa misma transacción los guards de revisión/lease, comprobación de referencias/evidencias y escritura del recibo. No se agregaron llamadas HTTP, cambios de schema o un servidor independiente.

## Reglas conservadas

- `productUpdateData` sigue siendo la fuente de validación y merge de campos. Omitir un dato lo conserva; un componente nuevo de FOB/MOQ/plazo no reemplaza todos sus componentes anteriores.
- Notas conservan append, deduplicación textual, reemplazo y borrado explícito conforme al contrato existente.
- Los productos confirmados no se degradan por un patch con `status=DRAFT`.
- Confirmación explícita web con `needsReanalysis` se rechaza. Confirmar limpia los campos en revisión según el comportamiento existente.
- No se pueden cambiar `captureId` o `supplierId` mediante el patch. No se agregan traslados ni eliminación al agente.
- Imágenes y trazabilidad permanecen fuera del patch de campos; el enlace/finalización de archivos seguirá siendo una sección posterior.

## Concurrencia y versiones

La operación bloquea la fila del producto durante lectura, merge y escritura. Así dos patches independientes y dos notas enviadas desde consumidores distintos conservan todos los cambios, en vez de sobrescribir campos basados en una lectura anterior.

El adaptador del agente pasa la versión observada del destino. Si cambió el registro, la operación devuelve un conflicto, convertido al código `CONFLICT` existente. La web conserva su contrato HTTP y no incorpora un campo obligatorio de versión; las ediciones concurrentes del mismo campo siguen la semántica de último escritor bajo bloqueo. No se promete detectar todos los conflictos de formularios antiguos en esta etapa.

Si falla el recibo o el consumidor aborta su transacción, se revierte también la actualización de negocio.

## Diferencia respecto de documentación histórica

En el código local inspeccionado al iniciar esta sección, `write` aplica las ediciones de registros directamente: no crea nuevas operaciones `PROPOSED`. Se conservaron ese comportamiento y los límites de evidencia/permisos. No se reintrodujo la aprobación de cada edición confirmada por refactorizar el código.

El runtime conserva `resolve` para propuestas históricas pendientes: exige envío de propuesta, respuesta explícita, vigencia y versión, y después aplica el cambio mediante la operación compartida. Sus decisiones conversacionales continúan en el canal. Las reglas del plan sobre aprobaciones deberán interpretarse contra esta referencia local; cualquier cambio de producto necesita una decisión separada.

## Validación

No se ejecutaron evals del modelo, orquestador, replays conversacionales ni mensajes de WhatsApp. Se ejecutaron solamente operaciones directas y tests determinísticos de parsers con datos sintéticos.

- 22 tests aprobados, sin fallos ni omisiones: tests de creación existentes, ocho escenarios nuevos de actualización y parsers de producto/proveedor.
- Los nuevos escenarios verifican patches comerciales, notas, reanálisis, alcance autorizado, revocación, versiones obsoletas, concurrencia y rollback. También comprueban que un patch no cambie el destino ni degrade un confirmado.
- PostgreSQL temporal exclusivo: `127.0.0.1:15437/nihao_agent_test`. Se reutilizó el esquema temporal de la primera sección. No se consultaron o modificaron bases del proyecto y no se agregaron migraciones.
- TypeScript y lint de archivos modificados: aprobados.
- Build Next.js con Webpack: aprobado con Node 24 y URL de la base temporal explícita.
- `git diff --check`: aprobado.

Comando de tests de esta sección (variable únicamente para la base local protegida por el helper):

```sh
EVAL_AGENT_DATABASE_URL=postgresql://postgres@127.0.0.1:15437/nihao_agent_test node --import tsx --test tests/bot/nihao-create-product.test.mts tests/bot/nihao-update-product.test.mts tests/bot/supplier-edit.test.mts
```

El nombre histórico de la variable y la reutilización del helper de fixtures no implican una evaluación de IA: sólo se construyen registros sintéticos y se invocan operaciones de negocio directamente.

Los logs temporales de esta sesión son `/tmp/nihao-update-tests.log`, `/tmp/nihao-update-typecheck.log`, `/tmp/nihao-update-lint.log` y `/tmp/nihao-update-build.log`. No constituyen evidencia durable de release ni validación física del canal.

## Pendientes

Avance posterior: [archivos y finalización de productos](nihao-operations-product-files-20261008.md) extrae las asociaciones y el cierre de producto. La lista siguiente conserva los pendientes al finalizar esta sección.

Continúan fuera de la capa común la búsqueda/lectura, eliminación, promoción de capturas, creación implícita por extracción, derivación final de estado y asociación/trazabilidad de archivos. El siguiente paso es separar las operaciones de archivos y finalización de producto conservando idempotencia y recibos, antes de migrar proveedores/capturas.

No se declara completado el plan ni resueltos los fallos preexistentes documentados en la primera sección. Los cambios locales anteriores a esta tarea se conservaron.
