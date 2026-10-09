# Operaciones compartidas: proveedores y borradores

Fecha: 8 de octubre de 2026.

Estado: **IMPLEMENTADO LOCALMENTE, sin publicación**. Continúa [archivos y finalización de productos](nihao-operations-product-files-20261008.md) y el [plan de separación](../architecture/nihao-operations-separation-plan.md).

## Alcance implementado

`lib/nihao/operations/supplier-operations.ts` agrega cuatro operaciones sin llamadas al modelo:

- `updateSupplier`: actualiza proveedores confirmados con validación, permisos, bloqueo de fila y versión esperada opcional. Conserva patches parciales, contactos y las políticas existentes de notas.
- `updateSupplierDraft`: corrige borradores desde automatización, preservando revisión de campos y correcciones humanas. Rechaza capturas ya promovidas para que el canal consulte el proveedor actualizado.
- `updateCaptureDetails`: modifica notas, sitio web y contactos desde la web, conservando su política de reemplazo.
- `autoConfirmSupplierCapture`: autoriza y bloquea la captura antes de delegar la promoción automática al servicio existente.

La autorización común ahora vive en `capture-access.ts`. `product-access.ts` conserva reexports compatibles para las operaciones de productos. La identidad, viaje, empresa y modalidad de acceso provienen del servidor autenticado, no de argumentos del modelo.

Delegan en estas operaciones el PATCH web de proveedores, el PATCH de detalles de captura, la promoción automática posterior a correcciones web, el helper de confirmación automática y las correcciones/finalización de proveedores del dominio WhatsApp v3. No cambian los contratos de herramientas ni las respuestas conversacionales.

## Reglas conservadas y corrección

La promoción automática requiere los mínimos vigentes de nombre y contacto. Una captura pendiente de reanálisis sigue como borrador. Al promoverla se vinculan sus productos; si ya tiene proveedor, no se sobrescriben sus datos desde la captura. La confirmación manual revisada es otro camino y conserva su comportamiento existente.

Los detalles web y su promoción automática ahora se ejecutan en una misma transacción. En WhatsApp el llamador conserva la transacción que integra cambios de negocio y recibo: una falla posterior revierte ambos. La corrección de proveedores confirmados bloquea la fila del proveedor; las correcciones de borradores y promoción bloquean la captura.

Los tests detectaron que el corrector legacy de campos borra las columnas comerciales cuando corrige un dato general. `updateSupplierDraft` conserva las condiciones previas y aplica su combinación final después de corregir campos. Así una modificación de ciudad o provincia no pierde FOB, moneda, MOQ ni plazo. Esta corrección cubre el camino automatizado migrado; el corrector legacy y su uso directo en correcciones web todavía deben migrarse.

## Validación

Sin evals de IA, replays conversacionales ni llamadas al modelo. Se ejecutaron operaciones directas contra registros sintéticos en PostgreSQL temporal `127.0.0.1:15437/nihao_agent_test`.

- 43 tests aprobados, sin fallos ni omisiones, contando creación, actualización y archivos de productos, proveedores y parsers.
- Los nuevos casos verifican notas y contactos, patches comerciales parciales, concurrencia, versiones obsoletas, acceso ajeno/revocado, capturas eliminadas, revisión humana, conservación de condiciones del borrador, promoción concurrente, vínculo de productos y rollback ante falla de recibo.
- TypeScript, lint de módulos modificados, `git diff --check` y build Next.js con Webpack y Node 24: aprobados.

Logs temporales: `/tmp/nihao-suppliers-tests.log`, `/tmp/nihao-suppliers-typecheck.log`, `/tmp/nihao-suppliers-lint.log` y `/tmp/nihao-suppliers-build.log`. No constituyen evidencia durable de release. No hubo nuevas migraciones, cambios en bases del proyecto ni despliegue. Estas pruebas no certifican extracción del modelo, transferencia real de archivos ni entrega por WhatsApp.

## Pendiente

Migrar la corrección manual de campos y la confirmación revisada de capturas. Caracterizar y extraer la creación implícita durante ingesta, extracción y reanálisis, así como las escrituras auxiliares de evidencias. Siguen pendientes lecturas/búsquedas y eliminación. La separación completa continúa en desarrollo.

Continuación implementada: [corrección y confirmación manual de capturas](nihao-operations-capture-review-20261008.md), incluyendo la conservación de condiciones comerciales en el corrector del repositorio.
