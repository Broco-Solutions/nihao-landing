# Operaciones compartidas: corrección y confirmación manual de capturas

Fecha: 8 de octubre de 2026.

Estado: **IMPLEMENTADO LOCALMENTE, sin publicación**. Continúa [proveedores y borradores](nihao-operations-suppliers-20261008.md) y el [plan de separación](../architecture/nihao-operations-separation-plan.md).

## Alcance

`supplier-operations.ts` incorpora `correctSupplierCapture` y `confirmSupplierCapture`. Los endpoints web de corrección y confirmación revisada delegan en estas operaciones. La capa común valida rol TRAVELER, viaje, empresa, captura no eliminada y versión esperada opcional, y bloquea la captura antes de modificarla. Los endpoints conservan sus cuerpos y respuestas; no exponen todavía la versión opcional. Los recursos inexistentes mantienen el error de captura no encontrada y los recursos de empresas ajenas mantienen denegación de acceso.

La corrección reutiliza el parser y el bookkeeping del repositorio: elimina el campo corregido de revisión, marca corrección humana, recalcula faltantes y conserva el reconocimiento explícito de datos desconocidos. Su promoción automática posterior sigue dentro de la misma transacción del endpoint.

La confirmación revisada reutiliza las reglas existentes y puede actualizar el proveedor ya asociado, reemplazando contactos y limpiando revisión. La automática conserva los datos del proveedor existente. No se agrega un pedido conversacional de confirmación al agente.

El repositorio expone `confirmInTransaction` para que la operación use la transacción del llamador, sin transacciones anidadas. `confirm` permanece como wrapper compatible para consumidores anteriores. La comprobación de acceso a la empresa usa ahora el cliente transaccional. La promoción conserva evidencias y enlaza productos sin modificar sus estados.

## Condiciones comerciales

La corrección de campos del repositorio ahora escribe las condiciones derivadas de los campos actuales después de las columnas generales. Así corregir ciudad, nombre u otro dato conserva FOB, MOQ y plazo; corregir explícitamente una condición sí aplica el valor recibido. Extiende a la corrección manual la protección incorporada para borradores automatizados en la etapa anterior.

La creación/extracción y la confirmación manual conservan su tratamiento previo de columnas comerciales. Esta etapa no redefine qué datos comerciales corresponden al proveedor o al producto ni migra los caminos de extracción.

## Validación

- 47 tests de operaciones y parsers aprobados, sin fallos ni omisiones. Cuatro casos nuevos cubren corrección humana y condiciones comerciales, reconfirmación/contactos, promoción concurrente con productos y rollback, y rechazo por reanálisis, datos incompletos, versión obsoleta, recurso inexistente, empresa ajena y rol no autorizado.
- 11 tests adicionales de compatibilidad aprobados: reconfirmación legacy, revisión, mínimos y normalización Tier 1.
- TypeScript, lint de módulos modificados y `git diff --check`: aprobados.
- Build Next.js con Webpack y Node 24: aprobado.

Se usaron registros sintéticos en PostgreSQL temporal `127.0.0.1:15437/nihao_agent_test`. Sin evals de IA, llamadas al modelo ni recorridos conversacionales. Logs temporales en `/tmp/nihao-capture-tests.log`, `/tmp/nihao-capture-compatibility.log`, `/tmp/nihao-capture-typecheck.log`, `/tmp/nihao-capture-lint.log` y `/tmp/nihao-capture-build.log`. No hubo migraciones, cambios en bases del proyecto ni despliegue. La prueba real de WhatsApp sigue pendiente.

## Próximo alcance

Creación y completado de capturas durante ingesta/extracción/reanálisis y reconciliación de tarjetas. Luego lecturas, búsquedas, eliminación y revisión final de escrituras duplicadas. Los consumidores legacy de `confirm` mantienen compatibilidad, pero todavía deben inventariarse y migrarse cuando corresponda. El plan completo sigue en desarrollo.

Continuación implementada: [cierre del alcance local e inventario final](nihao-operations-local-completion-20261008.md).
