# Nihao Negocios — Estado de estabilización

Referencia operativa vigente. Los informes de [`audit/`](../audit/) son el baseline histórico; las conclusiones de esta fase se verifican contra el código de la rama.

## Snapshot

- Rama candidata: `stabilize/nihao`, código en `2a2fcc0` sobre la estabilización local existente; el HEAD incluye el cierre documental. Cambios descritos aquí son locales; no hubo push, deploy, escritura remota, cambio en Evolution ni migración remota.
- Producción observada por la auditoría del 2026-10-10: Vercel/Railway en `ac61c49`; no se reconsultó en esta fase. Staging no se considera equivalente ni validado.
- PostgreSQL usado por las pruebas: sólo `127.0.0.1:5434/nihao_audit`; las credenciales no se registraron en logs ni documentación.
- No se añadieron migraciones Prisma.

## Fuentes del cliente

Se inspeccionó `/home/rcoirini/proyectos-bs/nihao-audit-input`, disponible en este entorno pese a que la versión anterior de este estado indicaba que faltaba. Se leyeron completos `BOT nihao - correciones 1.0.docx` y `Especificaciones BOT (1).pdf`, y se procesaron los chats de los cuatro ZIP y sus medios. Los originales y las extracciones permanecieron fuera del repositorio.

- Los dos exports `WhatsApp Chat - Nihao BOT` y `(1)` contienen el mismo hilo y medios duplicados, con diferencia observada de cinco horas entre timestamps exportados; `(2)` es otro hilo. Se compararon hashes para no contar reenvíos/exportaciones como incidentes nuevos y se retuvo el orden de cada export.
- Los tres hilos aportan incidentes textuales de confusión proveedor/producto, asociación de evidencia, preguntas repetidas y fallos/reintentos de audio. Son ejemplos observados; no se infiere contenido de los audios.
- Se deduplicaron 65 archivos multimedia recibidos a 44 blobs únicos (21 exposiciones duplicadas); 36 imágenes únicas se revisaron visualmente en hojas temporales locales. Contienen tarjetas y productos, y muestran evidencia que requiere conservar vínculo con su mensaje; no se copiaron ni se transcribieron datos personales al repositorio.
- No había herramienta local de transcripción de audio. Los audios se conservaron y se cotejaron por identidad/hash, export y ubicación en la cronología, pero no se atribuye contenido hablado no verificable.
- No se agregó un golden fixture con contenido del cliente: los casos de asociación visual dependen de medios personales y el texto extraído no se pudo verificar completamente/anonymizar de forma segura. Los fixtures mantenidos son sintéticos; las regresiones reales observables se documentan sin conversaciones ni contactos.

## Hallazgos y cambios verificados

### NHA-001 — starvation del worker

La causa del fast path que dejaba `evaluatedRevision` retrasada y reabría una ráfaga terminal ya se reprodujo y corrigió en la iteración anterior. Los tests PostgreSQL locales cubren checkpoint terminal, revisión nueva, reanudación y fairness. No prueba el scheduler ni las tres ráfagas de producción; no se intentó recuperar datos remotos.

### NHA-002 — normalización de teléfonos

La búsqueda sólo coincidía con la cadena almacenada. Ahora busca alias argentinos internacionales y formas domésticas `0/15`, conserva candidatos exactos y no elige una persona cuando los alias llevan a más de una membresía activa. Tests cubren equivalencias y colisión de persona. No se fusionaron cuentas ni se consultaron datos remotos.

### NHA-003 — autenticidad del webhook

La ruta aceptaba eventos sin autenticación. Ahora valida `x-nihao-webhook-secret` antes de parsear el body o inicializar servicios; falla cerrado si falta configuración, ésta es corta o la cabecera no coincide. Test cubre los casos. **Pendiente para staging:** configurar el mismo secreto de al menos 32 caracteres como `EVOLUTION_WEBHOOK_SECRET` y cabecera personalizada del webhook Evolution. No se modificó Evolution remoto. La versión consultada documenta cabeceras personalizadas en webhooks: [documentación oficial Evolution](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md).

### NHA-009 — eval runner

El runner retornaba éxito ante aserciones `FAIL`. Ahora termina con código 1 ante `FAIL`, `XPASS` o `ERROR`; tests unitarios cubren esos estados. `eval:channel` encontró C06 (el saludo no nombraba Nihao Web), se corrigió el texto y la corrida posterior dio **10/10 PASS**. La primera corrida dio código 1, comprobando que el `FAIL` ya bloquea.

### NHA-017 — replay offline

La causa confirmada de los ocho fallos era contractual: M/O/G/H/K usaban respuestas simuladas sin el campo requerido `finish_turn.outcomes`; K también necesitaba el resultado semántico `NO_ACTION`. No se rebajaron las expectations ni se alteró su significado. G además dejó visible que la ejecución por WhatsApp confirmaba un producto sólo por nombre/evidencia.

Se actualizaron los mocks al contrato actual y la creación/finalización de productos de WhatsApp ahora los mantiene `DRAFT`; OCR, captions, asociación de fotos/audio, retries y updates comerciales no sustituyen la confirmación explícita en Web. Las actualizaciones manuales explícitas mantienen la ruta de confirmación. Es una regla ya descrita en producto/UAT, ahora aplicada de forma coherente al camino multimodal y al de texto.

### CI y otros flujos comprobados

Se agregó `.github/workflows/ci.yml`: PostgreSQL efímero, migraciones, Prisma validate, typecheck, lint, suite completa y build en PR/push a `main` y `stabilize/nihao`. No se configuraron branch protections ni required checks, porque eso implicaría escrituras remotas.

Se verificaron contra código y tests captura original/ID estable, retries, receipts/transacciones, almacenamiento local de blobs, adjuntos, receipts de producto, asociación de varias tarjetas/productos, y scopes Web/API de proveedores/productos/reportes/exports. La suite también ejercita captura offline local y reconexión. Esto no certifica R2, Evolution, navegador en staging o sincronización con un servidor remoto.

## Validación automática local

- Suite completa con PostgreSQL `nihao_audit`: **760 PASS, 0 FAIL, 2 SKIP**, 762 tests. Los skips son HTTP local autenticado e IA live, ambos requieren servicios/credenciales explícitos.
- Replay PostgreSQL: A–J y tape offline; 34 imágenes con ventanas, OCR 503, recuperación durable y replay; ocho tarjetas independientes, frente/reverso, proveedor existente, alias seguros y notas: **PASS**.
- Casos antes fallidos NHA-017 M/O/G/H/K y assertions dependientes: **PASS** sin cambiar expectations.
- Pruebas de productos tras cambio de estado: asociaciones/adjuntos, rollback, retries, concurrencia, Web confirm explícito y protección de DRAFT: **PASS**.
- Burst/captura de 20 elementos y worker con reinicios/errores parciales están cubiertos por replay y casos PostgreSQL. Esto no simula la entrega real de 20–50 mensajes que Evolution reenvía tras desconexión.
- `typecheck`: PASS. `lint`: PASS con cuatro warnings preexistentes (tres navegaciones `window.location.assign` y un import no usado en tests). `prisma validate`: PASS. `pnpm build`: PASS (Prisma generate + Next.js production build).
- No se ejecutó IA live, audio real, WhatsApp, Evolution ni staging.

## Pendiente para UAT / fuera del alcance local

- Configurar webhook secret y verificar staging con entrega real, incluyendo desconexión/reconexión y ráfagas de 20–50 mensajes, luego reinicio/recuperación del worker.
- Confirmar recepción efectiva frente a mensaje sólo enviado desde dispositivo; verificar originales, IDs, timestamps, contexto y estado duradero en DB/R2 ante OCR, IA, asociación, copia y respuesta fallidos.
- Audio: validar transcripción/asociación multimodal real y notas comerciales contra criterio humano; no hay transcript verificable de los medios exportados.
- Validar productos/proveedores/pendientes/edición/confirmación y reportes/exportaciones en Web; offline → reconnect con navegador; acceso de empresa/viajero y evidencia visible.
- Verificar observabilidad, política autorizada de retención/R2, datos históricos y permisos; ningún original se eliminó ni migró.
- Después del UAT, preparar un único release coordinado: backup/lectura previa, SHA e imagen identificados, migraciones (ninguna nueva en este candidato), secret Evolution y variables, checks CI/branch protection, smoke de recepción/persistencia/worker, flujo Web, rollback y aprobación. No ejecutar desde esta tarea.

## Problemas que siguen abiertos

- **NHA-001:** el fix local está en tests; recuperación de ráfagas existentes y scheduler de staging/producción pendientes.
- **NHA-002:** aliases argentinos cubiertos; auditoría de conflictos/personas y otros formatos internacionales queda pendiente.
- **NHA-003:** código local cerrado; configurar secreto/cabecera y verificar recepción real en staging.
- **NHA-004:** workflow local agregado; branch protection/required checks no configurados remotamente.
- **NHA-005:** staging y su relación con producción no quedaron identificados/verificados.
- **NHA-006:** los errores conversacionales demostrados requieren tape/transcripción verificable y UAT; no se cambió el modelo ni se inventó contenido de audio.
- **NHA-007/008:** revisión completa de permisos y consistencia histórica de ownership todavía necesita datos de entorno autorizados.
- **NHA-010/011/012/013/014:** certificación UAT, observabilidad, i18n, documentación histórica y trazabilidad remota de releases siguen pendientes.
- **NHA-015/016/018:** aplicar/verificar migraciones del entorno, probar reconexión física/offline y confirmar inventario/retención de R2 quedan para staging/UAT y decisión autorizada.
- **NHA-017:** cerrado en replay determinístico local; UAT con evidencia multimedia humana sigue pendiente.

## Commits, estado y próximo paso

Commits locales de esta fase: `4940349` (productos permanecen DRAFT hasta confirmación web), `2c82de8` (aliases telefónicos, autenticidad del webhook y ayuda), `2a2fcc0` (fixtures de replay, evals y CI); antes de esta fase: `e67b8fd` (NHA-001) y `8309244` (estado de la iteración anterior). El cierre documental está incluido en el HEAD. No hay push; Git quedó limpio tras el cierre.

Validación local completada: `eval:channel` 10/10, Prisma validate, typecheck, lint y build aprobados; suite completa PostgreSQL PASS. Próximo paso: configurar secreto y cabecera en staging y ejecutar UAT integral con Evolution/Web reales. No está validado hasta entonces.
