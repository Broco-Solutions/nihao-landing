# WhatsApp: procesamiento por ráfagas (v2)

Implementado localmente el 2 de octubre de 2026. **No desplegado ni activado en producción.** El release productivo sigue siendo `84bb417`. Requiere las migraciones `20261002120000_whatsapp_bursts` y `20261002140000_whatsapp_existing_supplier_products`, además de `WHATSAPP_BURSTS_ENABLED=true` en el backend y sus workers. La bandera está desactivada por defecto; staging y UAT físico preceden la activación productiva.

## Experiencia

La ráfaga cierra después de **5 segundos sin mensajes nuevos**, o al recibir **listo**. Primero se descargan, leen y extraen todas sus evidencias; después se interpreta el conjunto. Una foto y un audio complementarios forman una carga aunque el audio no repita el proveedor. No se asocia por proximidad solamente. Fotos sin OCR conservan una descripción visual para asociación, sin convertir esa descripción en campos comerciales inventados.

El intérprete recibe segmentos literales, datos extraídos, referencias originales, mensajes citados, catálogo autorizado y la pregunta anterior. Distingue el proveedor externo de la empresa interna. Por ejemplo:

1. Foto-1 y Audio-1 se agrupan en una carga.
2. Foto-2 y Audio-2 se agrupan en otra.
3. Si falta empresa, una sola respuesta pregunta por las dos cargas, mostrando qué mensajes las forman.
4. «Las primeras dos por Kendal y las últimas dos por Broco» se interpreta con ese contexto y crea dos borradores con empresas distintas.

Una única empresa autorizada se asigna automáticamente. Varias requieren indicación explícita; no se hereda la empresa del proveedor anterior. Cada ráfaga tiene un viaje y cada grupo su empresa. Sólo se pregunta por viaje, empresa o relaciones dudosas; los datos comerciales faltantes y los conflictos quedan para la revisión web. Las cargas claras se guardan mientras las dudosas siguen pendientes. Todas son `DRAFT`: confirmar continúa siendo una acción humana en la web.

## Componentes

| Archivo | Responsabilidad |
| --- | --- |
| `lib/channels/whatsapp/burst-webhook.ts` | Adaptador de recepción: persiste antes del ACK; si falla, devuelve 503 para que Evolution reintente. |
| `prisma-burst-store.ts` | Inbox, revisión, leases, catálogo autorizado, reserva de decisiones y outbox. |
| `burst-reader.ts` | Original privado, OCR, visión, transcripción, fragmentos literales y candidatos de extracción con checkpoints. |
| `burst-interpreter.ts` | Prompt global, salida JSON y validación server-side de referencias y contexto. |
| `burst-service.ts` | Orquesta lectura completa, interpretación, reserva, materialización y respuesta. |
| `burst-materializer.ts` | IDs estables por grupo, merge conservador, borradores y copias independientes de adjuntos. |
| `burst-composition.ts` | Conecta Prisma, R2, Mistral y Evolution; lee la bandera. |

El prompt vigente está exportado como `BURST_INTERPRETER_PROMPT`. El modelo propone un plan; **no tiene tools ni acceso directo de escritura**. El servidor valida y ejecuta las operaciones con los repositorios de capturas y adjuntos existentes. OCR usa `mistral-ocr-4-1`, transcripción `voxtral-mini-latest`, y extracción/visión/planificación `mistral-small-2603`.

## Persistencia y concurrencia

- `WhatsAppBurst` versiona el estado y la revisión; contiene grupos con IDs estables, referencias, contexto, pregunta y capturas materializadas.
- `WhatsAppBurstMessage` guarda el descriptor recuperable de Evolution antes de descargar, timestamp original y secuencia durable. `UNIQUE(instance,messageId)` deduplica deliveries. Su lectura JSON conserva el original R2, OCR, observaciones visuales, transcripción, fragmentos y candidatos.
- `WhatsAppBurstReply` implementa un outbox único por lote/revisión. Los workers reclaman la respuesta; una revisión nueva invalida preguntas pendientes anteriores.
- Un índice parcial impide dos ráfagas activas por instancia/teléfono. La recepción usa un advisory lock transaccional corto; no descarga ni invoca modelos dentro de ese lock.
- La lectura usa leases recuperables de 330 segundos y checkpoints entre operaciones. El worker reclama de a un lote y limita su ventana de trabajo a 220 segundos, conservando progreso para la siguiente ejecución.
- Una llegada durante interpretación cambia la revisión: la reserva falla y se recalcula antes de materializar. Una llegada después de reservar se conserva para la siguiente revisión, manteniendo las cargas ya decididas.
- Una reserva interrumpida se retoma con IDs determinísticos, sin crear otras capturas. El merge existente conserva correcciones humanas.
- Los errores de lectura/planificación reintentan a los 30 segundos. Tras cinco fallos consecutivos se conserva la ráfaga, se avisa una sola vez y se espera «reintentar». Las reservas con escrituras incompletas mantienen su contexto y continúan reintentando.

Las etiquetas se ordenan inicialmente por timestamp original y secuencia de recepción. Una vez mostradas en una pregunta, sus posiciones quedan congeladas; una entrega tardía se agrega sin renumerar las referencias anteriores.

Un audio con varios proveedores conserva la transcripción completa y los segmentos seleccionados en el estado del lote. Cada captura recibe una **copia propia** del archivo, con otra clave R2: eliminar un adjunto no elimina el de otra captura. Los originales de staging y las lecturas se conservan para recuperación; esta iteración no añade un job de purga automática.

El outbox evita duplicados normales y concurrentes, pero Evolution no ofrece en este cliente una clave externa de idempotencia. Un crash después del envío externo y antes de registrar `SENT` puede reenviar una respuesta. No se promete entrega exactamente una vez en ese intervalo.

Los logs estructurados incluyen IDs, revisión, conteos y nombre de clase de error; no incluyen teléfonos, OCR, transcripciones ni datos comerciales.

## Compatibilidad y activación

La migración es aditiva: v2 usa tablas nuevas y no modifica los lotes v1. Los lotes v1 pendientes y las tarjetas legacy activas continúan por su procesador. `ping nihao`, mensajes no soportados y usuarios sin contexto autorizado conservan la ruta anterior. La autorización v2 exige `TripMember(TRAVELER)` y empresas activas con membresía, independientemente del rol global.

Orden de activación:

1. Desplegar código y aplicar migración en **staging**, con la bandera desactivada.
2. Configurar `WHATSAPP_BURSTS_ENABLED=true` en el backend que recibe el webhook y en el worker del mismo entorno.
3. Ejecutar los casos físicos [UAT-WA-BURST](../uat/mvp-uat-plan.md#uat-wa-burst--ráfagas-v2-pending-staging--uat-físico).
4. Con UAT aprobado, programar migración y activación en producción.

Para revertir, desactivar la bandera detiene nuevas entradas v2; los datos permanecen. No borrar tablas. Si hay ráfagas v2 pendientes, terminar su procesamiento antes de desactivar el worker: el procesador v1 no consume esa inbox.

## Validación reproducible

`pnpm test` incluye pruebas determinísticas de agrupación, referencias, controles, autorización, lectura visual y recuperación de medios. La suite PostgreSQL se omite si falta su variable para evitar conectar accidentalmente una base de proyecto.

```bash
# Base exclusivamente local, nombre fijo protegido por la suite.
docker run --detach --name nihao-burst-test --publish 127.0.0.1:15433:5432 \
  --env POSTGRES_PASSWORD=burst-local-test --env POSTGRES_DB=nihao_burst_test postgres:16-alpine
DATABASE_URL=postgresql://postgres:burst-local-test@127.0.0.1:15433/nihao_burst_test pnpm prisma:migrate:deploy
WHATSAPP_BURST_TEST_DATABASE_URL=postgresql://postgres:burst-local-test@127.0.0.1:15433/nihao_burst_test \
  node --import tsx --test tests/bot/whatsapp-bursts-db.test.mts
```

La regresión usa PostgreSQL y los repositorios reales, con Evolution, R2 y respuestas de modelos simulados. Comprueba la ráfaga hasta dos borradores reales, workers/deliveries concurrentes, revisiones, reinicios, copias de audio, ambigüedad parcial, fallos de transporte y permisos. **No certifica la inferencia del modelo con medios reales**: requiere staging y UAT físico.

## Productos para proveedores existentes — implementación local

Podés enviar, por ejemplo:

> Agregá el producto Taladro al proveedor Alfa Tools. FOB USD 9 por unidad, MOQ 500.

Y completar la misma ráfaga con fotos y audios. El planificador distingue
`PRODUCT` de `SUPPLIER_CAPTURE`: cada producto tiene su grupo de evidencias,
proveedor destino y condiciones comerciales. La segmentación también separa
productos distintos para evitar mezclar sus precios y cantidades.

El catálogo de proveedores confirmados se consulta sólo durante el procesamiento,
filtrado por viaje y empresas autorizadas; la recepción continúa liviana. Se
resuelven nombres explícitos, aliases parciales únicos y referencias previas.
Una coincidencia exacta única determina su empresa. Homónimos generan opciones
persistidas con empresa y ciudad; una respuesta numérica selecciona esas opciones.
Una búsqueda sin coincidencia conserva la carga y pregunta el destino, sin crear
un proveedor sustituto. Los IDs del modelo se validan contra catálogo y evidencia.

`prisma-product-materializer.ts` vuelve a comprobar rol TRAVELER, viaje activo o
planificado, empresa activa, membresía y proveedor confirmado antes de escribir.
Crea un `SupplierProduct(DRAFT)` sobre la captura del proveedor existente, con ID
determinístico, fuentes, revisión y conflictos. Los adjuntos tienen claves propias
por producto y quedan vinculados a su `productId`; sus audios conservan la
transcripción. Esta evidencia corresponde al producto y no invalida los campos
ya revisados del proveedor. Un reintento conserva ediciones humanas del producto.

En la web, la sección **Productos** muestra el borrador, condiciones, texto fuente,
fotos y audio original. **Editar** permite corregir los datos; **Confirmar producto**
lo pasa a `CONFIRMED`. Un producto sin nombre necesita que se complete antes de
confirmar. Los productos pendientes no se incluyen en informes, comparativas,
exportaciones ni métricas de productos confirmados.

La migración `20261002140000_whatsapp_existing_supplier_products` añade estado y
proveniencia a productos; los existentes conservan `CONFIRMED` por defecto para
mantener su comportamiento. El mensaje de ayuda sigue exactamente el texto acordado.

Validación local: 183 tests determinísticos PASS y 11 pruebas PostgreSQL PASS,
incluyendo carga texto/foto/audio, asociación real, revisión y recuperación de
un fallo después de persistir el producto. Build, TypeScript, Prisma y lint sin
nuevos errores PASS. Las respuestas de IA y el transporte siguen simulados;
la validación física de esta experiencia permanece pendiente en staging.
