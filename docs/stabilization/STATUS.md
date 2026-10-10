# Nihao Negocios — Estado de estabilización

Referencia operativa vigente. Los informes de [`audit/`](../audit/) son el baseline histórico; las conclusiones de esta fase se verifican contra el código de la rama.

## Staging — validación 2026-10-10

- Rama publicada `stabilize/nihao`; PR draft [#11](https://github.com/Broco-Solutions/nihao-landing/pull/11) hacia `main`, sin merge. `origin/main` verificado en `ac61c49ceac083988f25d0015f0444a2a30b1d2d` al inicio y al cierre. Código Web y backend de exportación probado: `0cf08142bab737d18b5f827f7cba16f9616bebca`; backend de recepción: `6cc4175b29025cc221c61709df5cdc39175f9104`.
- Artefactos `0cf0814`: Vercel Preview `dpl_HVRtiiheknmZAZNSRhF79TzfSMnh` READY y Railway staging `d03c9aa0-d428-4c58-b4fc-c331528aeed2` SUCCESS. El upload CLI de Railway no aporta `commitHash` en metadata; el comando se ejecutó desde ese HEAD y su mensaje incluye el SHA. Frontend/backend comparten el mismo código, PostgreSQL está en 29/29 migraciones.
- Push de la rama activa CI y Vercel Preview. Railway staging sigue configurado para `develop`; el deploy del candidato se hizo explícitamente desde el directorio local. `staging.nihaonegocios.com` apunta al Preview de `stabilize/nihao`; `api-staging.nihaonegocios.com` apunta al servicio Railway staging. No se tocó `main` ni producción.
- Aislamiento: staging y producción tienen instancias/volúmenes y proxies PostgreSQL distintos. **Bloqueo confirmado:** staging reutilizaba bucket/credenciales R2 y claves Resend/Mistral de producción; se retiraron de staging antes del primer push y se redeployó la versión anterior para purgar el runtime. Staging tampoco tiene URL/key Evolution ni OpenAI. No se restaurarán recursos compartidos para UAT.
- Autenticación: secreto Better Auth exclusivo de staging, URL/backend y orígenes de staging; el dominio de cookie `.nihaonegocios.com` abarca ambos hosts, por lo que se usaron perfiles de navegador aislados. Una sesión de staging usa otra base y otro secreto. La entrega de invitaciones por email queda pendiente por aislamiento de Resend.
- Configuración activa: `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_AUTH_URL` del Preview apuntan sólo a `api-staging.nihaonegocios.com`; `DATABASE_URL` Preview y Railway usan PostgreSQL staging; `BETTER_AUTH_URL` y orígenes se fijaron a hosts staging. En Railway staging `WHATSAPP_AGENT_TOOLS_ENABLED=false`, `WHATSAPP_BURSTS_ENABLED=true` y `EVOLUTION_INSTANCE=nihao-staging-synthetic`; sin `EVOLUTION_API_URL`/key no hay envío. Se requiere bucket R2 exclusivo y credenciales de prueba antes de procesar medios; no hay migraciones nuevas en los commits de estabilización.
- Backup previo: `/home/rcoirini/proyectos-bs/nihao-audit-input/staging-backups/nihao-staging-pre-stabilize-20261010T034948Z.dump`, modo 600, 75 846 bytes, SHA-256 `d100503e764ff6964538099dd882863b589b95b000deec0c54cd90ec53f703a9`. `pg_restore --list` PASS. Restauración a PostgreSQL local y aplicación de 15 migraciones pendientes PASS; en staging, 29/29 migraciones terminadas, 0 fallidas. Los conteos de las 21 tablas existentes no disminuyeron tras migrar; sólo aumentaron filas sintéticas UAT.
- CI: el primer push falló porque tests PostgreSQL de archivos distintos reclamaban las mismas ráfagas en paralelo; se fijó `--test-concurrency=1`. El build Turbopack Preview falló en `next/font/google`; `next build --webpack` pasó localmente y en el siguiente Preview. Commit `efdea45` incorpora ambos cambios. Suite PostgreSQL local serial: **760 PASS, 0 FAIL, 2 SKIP** de 762. `typecheck`, `lint` (4 warnings preexistentes) y build Webpack PASS para `6cc4175`.
- CI del código `0cf0814`: los runs [38024247118](https://github.com/Broco-Solutions/nihao-landing/actions/runs/38024247118) y [38024249727](https://github.com/Broco-Solutions/nihao-landing/actions/runs/38024249727) terminaron **SUCCESS**. PostgreSQL CI: **761 PASS, 0 FAIL, 2 SKIP** de 763; migraciones, Prisma validate, typecheck, lint y build PASS. El test nuevo verifica el commit real de IndexedDB antes de confirmar guardado.
- Web con datos sintéticos: invitación aceptada por API, roles ADMIN/Traveler, captura DRAFT e idempotencia de `clientCaptureId`, edición y confirmación de proveedor. Para probar la revisión de un producto WhatsApp sin IA live, sólo el estado de un producto sintético se cambió de `CONFIRMED` a `DRAFT` mediante SQL acotado por ID/captura y origen; luego se reconfirmó por Web. No es evidencia de creación WhatsApp real. Se descubrió que el administrador no tenía pestaña Productos y que un 503 de adjuntos impedía mostrar productos guardados. Commit `6cc4175` permite la consulta independiente: Chromium headless verificó DRAFT en el panel y ficha ADMIN y en móvil Traveler 390 × 844. El Traveler confirmó el producto en Web; PostgreSQL/API mostró `CONFIRMED`, productos confirmados 0→1 y pendientes 1→0. PDF y XLSX reales se generaron con datos sintéticos (cabeceras `%PDF` y `PK`).
- Webhook staging: `EVOLUTION_WEBHOOK_SECRET` exclusivo de staging y `EVOLUTION_INSTANCE=nihao-staging-synthetic`. Evento sintético de conexión: sin cabecera 401, incorrecta 401, válida 200. La instancia Evolution 2.3.7 observada sólo existe en producción y no se modificó. Su [controlador 2.3.7](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/event/webhook/webhook.controller.ts) acepta `headers` personalizados; la [configuración 2.3.7](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/config/env.config.ts) indica 10 reintentos, espera inicial 5 s con retroceso exponencial hasta 300 s y jitter 0,2; 400/401/403/404/422 no se reintentan. Se necesita instancia de prueba para verificar la política en ejecución.
- Recepción durable sintética: se habilitó `WHATSAPP_BURSTS_ENABLED=true` sólo en staging. 30 eventos (24 textos, 3 imágenes, 3 audios como metadatos) y 3 reenvíos devolvieron 200; `WhatsAppBurstMessage` conserva 30 IDs únicos, 30 timestamps y una sola ráfaga. El estado quedó `OPEN`, revisión 30, intentos 0: `processDue` falla al crear dependencias por ausencia deliberada de IA/R2/Evolution. La recepción y deduplicación están comprobadas; procesamiento, originales binarios, reinicio y recuperación de worker siguen bloqueados. No se enviaron mensajes WhatsApp reales ni se ejecutó IA live.
- Offline Web: Chromium sin red reprodujo un ID local duplicado después del POST fallido. `createDraft` leía `localCaptureId` anterior aunque `persistCapture` ya había escrito otro ID; `f0772c3` reutiliza el ID persistido, fija el snapshot de captura y no afirma guardado local si IndexedDB falló. `e2a5df8` espera `transaction.oncomplete` y añade test de aborto posterior al `put`. Repetición en Chromium 390 × 844: un ID local, imagen sintética de 68 bytes conservada en IndexedDB; reconexión creó un DRAFT remoto y dos intentos de subir a R2 aislado conservaron el mismo ID remoto y el blob local, estado `ERROR` recuperable. No prueba almacenamiento R2 ni teléfono físico.
- Informes: la vista `insights` ya separaba productos DRAFT de confirmados, pero PDF/XLSX sólo incluían filas confirmadas y un contador de pendientes. `0cf0814` agrega «Productos pendientes» como sección/hoja aparte con FOB, MOQ y plazo rotulados sin confirmar. Test y staging autenticado: con un DRAFT, el XLSX tuvo 0 filas confirmadas y 1 pendiente; PDF válido. Chromium descargó PDF como ADMIN y XLSX como Traveler desde los enlaces Web. Revisión comercial humana pendiente.
- **No VALIDADO REAL:** procesamiento R2/IA, fotos/audio originales y respuesta WhatsApp, email de invitación, reconexión en teléfono físico y recepción desde Evolution. Los fixtures y Chromium headless no equivalen a UAT con medio o dispositivo real. La matriz vigente está en [`mvp-uat-plan.md`](../uat/mvp-uat-plan.md).

### Activación futura y rollback

1. Completar UAT bloqueado con recursos exclusivos de staging; comprobar reconciliación de originales DB/R2 y reintentos reales. Autorizar IA live y WhatsApp real antes de usarlos.
2. Preparar producción en una ventana controlada: registrar SHA/artefactos, snapshot PostgreSQL y manifiesto R2, comprobar credenciales, dominios, cola/worker y compatibilidad de las migraciones sin ejecutar cambios aún.
3. Activar primero la cabecera `x-nihao-webhook-secret` en Evolution productivo mientras el código antiguo todavía la ignora; comprobar una entrega con esa cabecera. Configurar el mismo `EVOLUTION_WEBHOOK_SECRET` en el backend productivo antes de desplegar código que falla cerrado. Esto evita 401 no reintentables durante la transición. No cambiar la URL del webhook.
4. Aplicar las migraciones compatibles, desplegar frontend y backend del mismo SHA, comprobar health/auth, una recepción duradera autorizada, deduplicación, worker, DB/R2 y reportes. Mantener observación durante la ventana de reintentos.
5. Si hay regresión, detener nuevas entregas de prueba y volver al último artefacto **verificado como compatible con las 29 migraciones**, manteniendo cabecera y secreto. Conservar DB y evidencias nuevas. Varias migraciones pendientes transforman o sustituyen estructuras; no se certificó que el código productivo anterior funcione con ese esquema. Ensayar el rollback sobre una restauración antes de promover. Restaurar el backup sólo como recuperación de desastre después de preservar lo recibido desde él y planificar reconciliación; no hacer rollback ciego de datos.

## Snapshot local anterior (histórico)

Las secciones desde aquí documentan el cierre local `7006113` previo a la publicación; sus referencias a «sin push» y «staging pendiente» no describen el estado vigente de arriba.

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
