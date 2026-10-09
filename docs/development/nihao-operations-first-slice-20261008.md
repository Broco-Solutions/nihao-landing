# Separación de operaciones: primera sección implementada

Fecha: 8 de octubre de 2026.

Estado: **IMPLEMENTADO LOCALMENTE, sin publicación**. Avance del [plan de separación](../architecture/nihao-operations-separation-plan.md), no finalización de todas sus etapas.

## Referencia y alcance

HEAD al iniciar: `af6d899` (`Associate WhatsApp products by chronology and persist pending commercial evidence`), rama `main`. El workspace ya tenía cambios sin commit en ingesta, asociación de imágenes, contexto, confirmación, notas y pruebas. Esos cambios se conservaron. Las comparaciones se hicieron contra copias de los archivos locales previos a esta refactorización, no sólo contra HEAD.

Se agregó `lib/nihao/operations/create-product.ts`. Web y WhatsApp ahora delegan creación explícita de productos a esta operación. La operación revalida acceso y destino, reutiliza `parseProduct` y `deriveProductStatus`, conserva notas/procedencia y guarda el producto.

No modifica modelo de IA, prompts, asociación conversacional, política de aprobación, endpoints públicos ni schema Prisma. No crea API HTTP independiente. A pedido del usuario, no ejecutar evals del modelo ni nuevas pruebas conversacionales durante la continuación de este trabajo.

## Caminos migrados

| Consumidor | Entrada a la operación | Política preservada |
| --- | --- | --- |
| POST web `app/api/bot/captures/[captureId]/products/route.ts` | Usuario de sesión, viaje, captura y campos del formulario | Acceso web por membresía/empresa; ADMIN mantiene su alcance. Estado por completitud. Respuesta 201 y DTO existentes. |
| Tool de creación en `PrismaAgentDomain.write` | Destino y campos derivados de evidencia validada | Viaje activo/planificado, TRAVELER y empresa activa con membresía. DRAFT hasta completar medios y recibo. |
| Productos nombrados en comentarios de tarjetas, `persistCaptions` | Datos del comentario, notas y trazabilidad | Misma autorización automática; estado por completitud en esa transacción. |
| Materializador v2, `prisma-product-materializer.ts` | Proveedor autorizado, segmentos y extracción existentes | ID determinístico y conservación del resultado al reintentar. Archivos fuera de la transacción. |

Las rutas automáticas de fotos que llaman `write` también utilizan la operación común. La interpretación de imagen, selección del nombre y asociación al proveedor anterior siguen en el procesamiento/canal actual.

## Contrato y transacciones

`createProduct(tx, context, command, policy)` recibe una transacción Prisma ya abierta. No importa tipos de WhatsApp, herramientas o modelos y no hace llamadas de red ni transferencias de archivos.

- `context`: identidad y alcance construidos por código del servidor. No se toman del modelo o del body como autorización.
- `command`: captura, proveedor opcional, campos y procedencia. Sin proveedor explícito deriva el proveedor confirmado de la captura; un destino de captura borrador puede conservar `supplierId=null` para la promoción posterior.
- `policy`: capacidad seleccionada por el adaptador servidor (`web`/`automation`, confirmación inmediata/después de evidencia). Los campos del formulario o tool no pueden elegirla.
- Resultado: registro persistido con IDs, estado, campos y referencias de imágenes compatibles con `productRecord`.

Para WhatsApp, permanecen en el adaptador el guard de revisión/lease, grounding de evidencia, deduplicación de fragmentos, aprobación y almacenamiento de recibos. La operación se ejecuta en la misma transacción que recibo y consumo de evidencia pendiente. Un fallo posterior revierte la creación. La finalización de archivos continúa mediante `completeMedia` y los recibos `WRITTEN`/`COMPLETED` existentes.

Los IDs determinísticos mantienen reintentos sin sobrescribir registros. Un lock transaccional por ID serializa también los reintentos del materializador legacy; si el ID existente pertenece a otro destino se rechaza con conflicto. La comparación completa entre una clave y un comando diferente aún depende de la identidad/recibo del adaptador actual: no se agregó una tabla o fingerprint genérico de comandos ni una garantía nueva de idempotencia para el POST web.

Las reglas específicas de elegibilidad por fecha de fin de viaje continúan donde ya estaban. Esta operación preserva los perfiles actuales, no unifica silenciosamente políticas web/WhatsApp.

## Inventario de operaciones pendientes

| Camino | Motivo por el que continúa en su módulo |
| --- | --- |
| `PrismaSupplierCaptureRepository.saveExtractedProduct` | Upsert implícito durante extracción/reanálisis de capturas, que también actualiza/elimina una fila derivada. Migrar junto al ciclo de capturas, caracterizando primero su semántica. |
| PATCH/DELETE web de productos | Siguiente sección: cambios parciales, confirmación, reanálisis y restricciones de archivos. |
| `PrismaAgentDomain.applyPatch`, `reconcileConfirmation`, `completeMedia` | Edición, derivación final de estado y enlaces de archivos, todavía sin extraer. |
| Confirmación de proveedores en repositorio y `supplier-confirmation.ts` | Promoción y vinculación de productos; etapa de proveedores/capturas. |
| `supplier-deletion.ts` | Eliminación y desvinculación de registros; mantener permisos actuales. |
| Búsquedas y lecturas de proveedores/productos | Aún en endpoints/repositorios/dominio del agente; migración posterior. |

Por lo tanto, no se declara completado el gate global de ausencia de escrituras fuera de la capa común. Las etapas 0/1 tienen inventario y contrato inicial; la etapa 2 cubre creación explícita, y resta la creación implícita ligada al ciclo de capturas y la extracción gradual de repositorios.

## Validación realizada

Todas las pruebas de datos utilizaron un PostgreSQL temporal exclusivo en `127.0.0.1:15437/nihao_agent_test`, con fixtures sintéticos. No se utilizaron bases del proyecto, llamadas al modelo ni envío real de WhatsApp. Las 29 migraciones existentes se aplicaron sólo a esa base temporal; no se creó migración nueva.

- TypeScript: aprobado.
- Build Next.js con Webpack: aprobado, usando Node 24 y una URL de base temporal explícita.
- Lint de los módulos modificados: aprobado, sin errores ni advertencias.
- `git diff --check`: aprobado.
- Tests determinísticos nuevos de creación: nueve escenarios aprobados, más su contenedor. Cubren campos/notas, ausencia de datos, política de estado, proveedor incompleto y promoción, destino/permiso incorrecto, revocación, captura eliminada, reintentos concurrentes y rollback si falla el recibo.
- Suite determinística sin bases: antes, 503 tests (476 PASS, 1 FAIL, 26 omitidos); después, 504 tests (476 PASS, el mismo FAIL, 27 omitidos). El nuevo contenedor PostgreSQL se omite sin su variable explícita.
- Selección de integración ejecutada antes de la instrucción de no hacer evals: 82 tests, 80 PASS, 1 FAIL y 1 omitido. Incluye creación, herramientas, medios, notas y evidencias con persistencia real y procesamiento determinístico. La prueba opcional de IA permaneció omitida.
- Fallo preexistente sin bases: `producto sin proveedor recibe opciones autorizadas sin escribir ni preguntar empresa`, por diferencia de estructura esperada en producto pendiente.
- Fallo preexistente con PostgreSQL: `v3 picker PostgreSQL: toque válido se convierte en opción persistida; lista vencida no elige proveedor`. Reproducido con el archivo de dominio anterior a la extracción. La copia temporal de comparación también tuvo un error de harness por no copiar un SQL de migración; no se presenta esa corrida como suite aprobada.

Los logs de esta sesión están en `/tmp/nihao-operations-baseline.log`, `/tmp/nihao-operations-suite.log`, `/tmp/nihao-operations-integration.log`, `/tmp/nihao-operations-integration-baseline.log`, `/tmp/nihao-operations-typecheck.log`, `/tmp/nihao-operations-lint.log` y `/tmp/nihao-operations-build.log`. Son temporales y no deben considerarse artefactos durables de release.

## Próximo paso

Actualización posterior: [la segunda sección ya extrae la actualización de productos](nihao-operations-product-updates-20261008.md). El texto siguiente conserva el próximo paso previsto al cerrar esta primera sección.

Extraer actualización de productos como caso de uso común. Preservar patches parciales, merge/borrado de notas, reglas de reanálisis web y propuesta/aprobación de WhatsApp. Después continuar con archivos y ciclo de capturas, sin ejecutar evals mientras siga vigente la instrucción del usuario.

No publicar este avance como implementación completa del plan ni como resolución de fallos preexistentes del agente.
