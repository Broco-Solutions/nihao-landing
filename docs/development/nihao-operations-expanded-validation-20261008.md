# Validación ampliada de la separación de operaciones

Fecha: 8 de octubre de 2026.

Estado: **VALIDACIÓN LOCAL AMPLIADA APROBADA. UAT FÍSICO PENDIENTE**.

Continúa el [cierre del alcance local](nihao-operations-local-completion-20261008.md). Por instrucción del usuario, no se ejecutaron evals de IA ni pruebas con modelos reales.

## Resultado final

| Comprobación | Resultado |
| --- | --- |
| Suite amplia de tests unitarios e integración | 662 contabilizados: **661 aprobados, 0 fallos, 1 omitido**. |
| Prueba omitida | Caso explícito con IA real, excluido por instrucción del usuario. |
| Smoke HTTP autenticado | 7 tests aprobados; incluidos en la suite amplia y repetidos sobre el build final. |
| Legacy bursts y migración sintética | 11 tests aprobados; incluidos en la suite amplia. |
| TypeScript | Aprobado después del build final. |
| Lint de los módulos/tests modificados | Aprobado. |
| Build Next.js con Webpack, Node 24.21.0 | Aprobado. |
| `git diff --check` | Aprobado. |

Se excluyeron los archivos `*evals*` y `*replay*` de la ejecución. Los tests de herramientas/orquestación emplean respuestas y transportes simulados. Los nombres de variables/helpers históricos que contienen `EVAL` no implican ejecución de modelos: sólo habilitan fixtures y conexiones PostgreSQL aisladas.

## Qué se comprobó

- Creación, edición y promoción de capturas/proveedores; precios, monedas, MOQ, plazos, contactos, notas y condiciones omitidas.
- Cargas múltiples y asociación con proveedor explícito, contexto previo y evidencia; tarjetas frente/reverso, fotos, audio y condiciones pendientes con lectores/proveedores simulados.
- Permisos por viaje/empresa, membresías revocadas, versiones obsoletas, capturas eliminadas y originales ajenos.
- Transacciones con rollback, reintentos, recuperación de recibos y checkpoints, leases/revisiones obsoletas, concurrencia y outbox simulado.
- Los endpoints reales bajo Next.js: sesión firmada válida consultada por Better Auth, rechazo de sesión ausente/falsa, POST idempotente, corrección con promoción automática, confirmación revisada, creación/edición/consulta de producto, asociación/desasociación de imagen, validación 400, recurso inexistente 404, acceso ajeno 403 y conflictos 409.
- Borrado web de producto/proveedor, restricción de imágenes, conservación de originales y bloqueo de resurrección.

El smoke HTTP utiliza sesiones y registros sintéticos. No ejecuta login con contraseña, recuperación de contraseña, transferencia física a R2 ni extracción por IA; los adjuntos de ese smoke son metadata sintética.

## Hallazgos y cambios

La primera suite amplia detectó expectativas desactualizadas:

1. El test de lista vencida consultaba el último mensaje del workflow anterior, aunque el mensaje rechazado se guarda en un workflow nuevo. Ahora verifica el ID real del evento recibido, el aviso de lista vencida, la separación de workflows y que no se cree ningún producto.
2. El test de producto pendiente omitía IDs de procedencia que el runtime ya conserva. Ahora comprueba su estructura completa.
3. Cinco casos multimodales esperaban DRAFT para un producto con nombre válido. Se alinearon con la regla vigente de confirmación por nombre y agregan la comprobación de que no se invente precio.

Al habilitar además la base aislada de legacy bursts apareció un problema real anterior a la refactorización: las preguntas que sólo tenían `state.question`, sin `agent.pending`, no reconocían su respuesta libre. El mensaje abría otro workflow y la carga suspendida no continuaba. Se extendió `answersPending` para esos estados históricos conservando el rechazo de cargas independientes, medios nuevos y selecciones numéricas sin opciones.

La prueba de regresión también detectó que `\b` después de «Agregá/Cargá» no reconoce el límite de una letra acentuada en JavaScript. Se usa un delimitador explícito para que esos comandos sigan iniciando cargas independientes, tanto en selección de productos pendientes como en respuestas a preguntas. Los tests existentes de límites y el recorrido legacy completo pasan con el cambio.

No se modificaron las reglas comerciales para satisfacer tests antiguos. Las correcciones funcionales son de compatibilidad/routing del canal, no cambios en permisos ni en el modelo.

## Entorno y reproducción

Servidor HTTP local: `http://127.0.0.1:3107`, build de producción local de Next.js, secreto de autenticación sintético y cookie domain desactivado. No se reutilizaron sesiones reales.

Bases PostgreSQL temporales del mismo cluster `127.0.0.1:15437`:

- `nihao_agent_test`: operaciones y suite principal.
- `nihao_burst_test`: suite legacy; esquema clonado de la base de pruebas. La prueba de migración crea un schema sintético y hace rollback.

Las peticiones externas de `fetch` se bloquearon mediante un preload local. No se enviaron mensajes de WhatsApp, correos ni peticiones a modelos/R2. No se modificaron bases del proyecto, ni se desplegó. Se detuvieron servidor HTTP y PostgreSQL después de validar.

Para repetir el smoke con un servidor local configurado contra la misma base sintética:

```sh
EVAL_AGENT_DATABASE_URL=postgresql://postgres@127.0.0.1:15437/nihao_agent_test \
NIHAO_HTTP_TEST_ORIGIN=http://127.0.0.1:3107 \
NIHAO_HTTP_TEST_AUTH_SECRET='<mismo secreto sintético del servidor>' \
node --import tsx --test tests/bot/nihao-http.test.mts
```

El archivo de smoke se omite en ejecuciones generales sin estas variables. Sus validadores rechazan hosts/base de datos que no sean locales. La ejecución amplia seleccionó todos los `tests/bot/*.test.mts` salvo nombres que contengan `evals` o `replay`, con `EVAL_IMAGE_RULES_REAL_AI=false` y `LIVE_AI=false`. Se habilitaron ambas URLs de bases de prueba y las variables del smoke; `--test-concurrency=4` y `--test-name-pattern='^(?!real AI:)'`.

Evidencia temporal: `/tmp/nihao-full-tests.log`, `/tmp/nihao-http-tests.log`, `/tmp/nihao-burst-tests.log`, `/tmp/nihao-validation-typecheck.log`, `/tmp/nihao-validation-lint.log`, `/tmp/nihao-validation-build.log`. El [manifiesto actualizado](nihao-operations-validation-20261008.json) identifica los archivos probados, sin certificar una release publicada.

## Pendiente de aceptación real

Estos cambios todavía no están desplegados en staging. Falta ejecutar allí desde teléfono:

1. Tarjeta frente/reverso y nota: un proveedor, contactos correctos y originales recuperables.
2. Producto con proveedor explícito: precio, moneda, MOQ, plazo y notas correctos.
3. Producto sin proveedor explícito después de una tarjeta: asociación al contexto vigente.
4. Varias cargas consecutivas con fotos y audios: registros y condiciones separados.
5. Aclaración posterior y respuesta a selección de proveedor: continuidad sin duplicados ni uso de una lista vencida.
6. Edición web concurrente y reintento tras desconexión/reinicio: preservación de datos y recuperación.

Hay que comprobar la recepción/entrega real por Evolution y la transferencia real a R2. Esta aceptación física no fue sustituida por fixtures ni se presenta como aprobada. La publicación a producción conserva su requisito de autorización explícita.
