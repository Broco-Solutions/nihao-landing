# OpenAI y conversaciones extendidas — 4 de octubre de 2026

OpenAI `gpt-5.6-luna` interpreta texto/transcripciones, maneja el contexto y ejecuta tools. Mistral mantiene OCR, imágenes y transcripción. Reporte final: `whatsapp-openai-final-acceptance-20261004`.

Las conversaciones siguientes reproducen las respuestas reales del modelo. Se ejecutaron con PostgreSQL local aislado, sin mensajes a clientes. WA31–WA34 prueban webhook/store/worker/outbox con envío capturado; WA35–WA37 prueban turnos persistidos, memoria entre conversaciones terminadas y aprobación/cancelación. No equivalen a UAT físico de WhatsApp. Las transcripciones de la suite son literales, no audios transcritos por Voxtral en esta ejecución.

## Resultado final

- Aceptación consolidada: 37/37 casos validados; 0 FAIL; 0 ERROR.
- La corrida completa dio 36 PASS y 1 ERROR de entorno en WA31: el worker tomó una conversación residual de una corrida interrumpida. Se verificó su fila persistida (creada antes del caso), se limpió únicamente la base local y se repitieron WA31–WA34 secuencialmente: 4/4 PASS en `whatsapp-openai-clean-worker-recovery-20261004`. El resultado consolidado usa esa conversación real para WA31; el ERROR original se conserva.
- Estabilidad de WA22/WA31/WA33/WA34: 12/12 PASS (cuatro casos × tres) en `whatsapp-openai-final-stability-20261004`, sin reanudaciones. Las 38 fuentes/fixtures coinciden entre todos los reportes y el código publicado.
- 258 pruebas automatizadas PASS, sin omisiones. TypeScript, lint, Prisma y build Next aprobados.
- Reanudaciones de infraestructura en la suite: 0. No se reintentan fallos funcionales.
- WA35–WA37: 19 turnos de usuario con 19 respuestas; se validan los datos guardados y la pregunta pendiente después de cada turno.

## Hallazgo y corrección

La ejecución inicial `whatsapp-openai-extended-initial-20261004` tuvo 3 PASS (WA35–WA37) y 1 FAIL (WA34). Después de preguntar por proveedor, interpretó “a broco” como empresa interna y volvió a preguntar. La ejecución diagnóstica reprodujo el fallo. Se corrigió el prompt para que el significado dependa de la pregunta pendiente y se añadió validación que exige buscar el nombre antes de repetir la pregunta. WA34 pasó luego en `whatsapp-openai-routing-corrected-20261004`; la suite final verifica todas las conversaciones con la corrección. La primera suite completa tuvo 34/37 PASS: fallaron WA22 (ID de evidencia incorrecto), WA31 (proveedor sustituto creado sin pedido) y WA33 (validaciones contradictorias de empresa/proveedor). Se bloquearon proveedores sustitutos, se añadieron IDs válidos al error de referencias, se evitó cerrar como ayuda el producto expresado con “Tengo” y se distinguió la pregunta pendiente de empresa del proveedor. La repetición intermedia de WA33 tuvo 2/3 PASS y permitió identificar el ciclo entre las dos validaciones. Se conservaron los reportes iniciales y las expectativas; las ejecuciones completas iniciadas con fuentes reemplazadas se detuvieron y no cuentan como aceptación.

## Conversaciones y resultados

### WA31-legacy-product-company-name — PASS

**Usuario:**

> Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias

**Nihao:**

> ¿Para qué empresa es el próximo proveedor? Respondé con el número:
> 1. Broco Solutions
> 2. Kendal Salud

**Usuario:**

> para broco

**Nihao:**

> No encontré un proveedor llamado “Broco”. ¿Cuál es el proveedor del vaso de vidrio?

**Usuario:**

> Es del proveedor Alfa Tools

**Nihao:**

> 📋 Producto «vaso de vidrio» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Resultado producido:**

- `firstWaiting`: `true`.
- `asksCompany`: `false`.
- `asksSupplier`: `true`.
- `sendsHelp`: `false`.
- `initialProducts`: `0`.
- `products`: `1`.
- `drafts`: `0`.
- `name`: `"vaso de vidrio"`.
- `fob`: `30`.
- `currency`: `"USD"`.
- `days`: `60`.
- `moq`: `null`.
- `status`: `"DRAFT"`.
- `finalDone`: `true`.
- Se creó un único producto DRAFT para el proveedor elegido y se derivó su empresa. No se creó un proveedor sustituto ni se inventó MOQ.
- Comprobaciones correctas: 18. Reanudaciones de infraestructura: 0.

### WA32-legacy-product-company-number — PASS

**Usuario:**

> Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias

**Nihao:**

> ¿Para qué empresa es el próximo proveedor? Respondé con el número:
> 1. Broco Solutions
> 2. Kendal Salud

**Usuario:**

> 1

**Nihao:**

> ¿A qué proveedor pertenece el vaso de vidrio?

**Usuario:**

> Es del proveedor Alfa Tools

**Nihao:**

> 📋 Producto «vaso de vidrio» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Resultado producido:**

- `firstWaiting`: `true`.
- `asksCompany`: `false`.
- `asksSupplier`: `true`.
- `sendsHelp`: `false`.
- `initialProducts`: `0`.
- `products`: `1`.
- `drafts`: `0`.
- `name`: `"vaso de vidrio"`.
- `fob`: `30`.
- `currency`: `"USD"`.
- `days`: `60`.
- `moq`: `null`.
- `status`: `"DRAFT"`.
- `finalDone`: `true`.
- Se creó un único producto DRAFT para el proveedor elegido y se derivó su empresa. No se creó un proveedor sustituto ni se inventó MOQ.
- Comprobaciones correctas: 18. Reanudaciones de infraestructura: 0.

### WA33-legacy-repeated-product-latest-terms — PASS

El inbox inicial contiene dos versiones del vaso de vidrio: FOB USD 30/plazo 30 días y la versión posterior FOB USD 30/plazo 60 días. El modelo debe conservar la segunda para la carga.

**Usuario:**

> Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias

**Nihao:**

> ¿Para qué empresa es el próximo proveedor? Respondé con el número:
> 1. Broco Solutions
> 2. Kendal Salud

**Usuario:**

> para broco

**Nihao:**

> ¿A qué proveedor corresponde el vaso de vidrio?

**Usuario:**

> a broco

**Nihao:**

> 📋 Producto «vaso de vidrio» guardado como borrador, asociado a Broco. Revisalo y confirmalo en la web.

**Resultado producido:**

- `firstWaiting`: `true`.
- `asksCompany`: `false`.
- `asksSupplier`: `true`.
- `sendsHelp`: `false`.
- `initialProducts`: `0`.
- `products`: `1`.
- `drafts`: `0`.
- `name`: `"vaso de vidrio"`.
- `fob`: `30`.
- `currency`: `"USD"`.
- `days`: `60`.
- `moq`: `null`.
- `status`: `"DRAFT"`.
- `finalDone`: `true`.
- Se creó un único producto DRAFT para el proveedor elegido y se derivó su empresa. No se creó un proveedor sustituto ni se inventó MOQ.
- Comprobaciones correctas: 18. Reanudaciones de infraestructura: 0.

### WA34-product-supplier-determines-company — PASS

**Usuario:**

> Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias

**Nihao:**

> ¿A qué proveedor querés agregar el vaso de vidrio? Indicame el nombre del proveedor existente o confirmame que es un proveedor nuevo.

**Usuario:**

> a broco

**Nihao:**

> 📋 Producto «vaso de vidrio» guardado como borrador, asociado a Broco. Revisalo y confirmalo en la web.

**Resultado producido:**

- `firstWaiting`: `true`.
- `asksCompany`: `false`.
- `asksSupplier`: `true`.
- `sendsHelp`: `false`.
- `initialProducts`: `0`.
- `products`: `1`.
- `drafts`: `0`.
- `name`: `"vaso de vidrio"`.
- `fob`: `30`.
- `currency`: `"USD"`.
- `days`: `60`.
- `moq`: `null`.
- `status`: `"DRAFT"`.
- `finalDone`: `true`.
- Se creó un único producto DRAFT para el proveedor elegido y se derivó su empresa. No se creó un proveedor sustituto ni se inventó MOQ.
- Comprobaciones correctas: 18. Reanudaciones de infraestructura: 0.

### WA35-extended-product-context-corrections — PASS

**Usuario:**

> Tengo un vaso de vidrio con precio FOB de 30 USD y leedtime de 60 dias

**Nihao:**

> ¿A qué proveedor querés asociar el producto “vaso de vidrio”? Si es un proveedor existente, indicame su nombre o alias; si es nuevo, pasame el nombre del proveedor.

**Usuario:**

> Es del proveedor Alfa Tools

**Nihao:**

> 📋 Producto «vaso de vidrio» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Usuario:**

> Corregí el FOB del último producto a USD 28. Conservá el plazo.

**Nihao:**

> ✅ Producto «vaso de vidrio» actualizado: {"fob":{"amount":28,"currency":"USD"}}.

**Usuario:**

> Agregale el producto Jarra de vidrio. FOB USD 12 por unidad, MOQ 200 unidades, plazo 45 días.

**Nihao:**

> 📋 Producto «Jarra de vidrio» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Usuario:**

> ¿Cuál es el FOB y el plazo del producto vaso de vidrio del proveedor Alfa Tools?

**Nihao:**

> El vaso de vidrio de Alfa Tools figura con FOB de USD 28 y plazo de 60 días.

**Usuario:**

> Corregí el plazo del producto Jarra de vidrio del proveedor Alfa Tools a 50 días. No cambies el FOB ni MOQ.

**Nihao:**

> ✅ Producto «Jarra de vidrio» actualizado: {"leadTime":{"days":50,"rawText":"50 días"}}.

**Resultado producido:**

| Producto | Proveedor | FOB | MOQ | Plazo (días) | Estado |
|---|---|---|---|---|---|
| vaso de vidrio | Alfa Tools | USD 28 | Pendiente | 60 | DRAFT |
| Jarra de vidrio | Alfa Tools | USD 12 | 200 | 50 | DRAFT |

- `turn1:products`: `0`.
- `turn2:products`: `1`.
- `turn2:fob`: `30`.
- `turn2:days`: `60`.
- `turn3:products`: `1`.
- `turn3:fob`: `28`.
- `turn3:days`: `60`.
- `turn4:products`: `2`.
- `turn4:fob`: `12`.
- `turn4:days`: `45`.
- `turn4:moq`: `200`.
- `turn5:products`: `2`.
- `turn5:fob`: `28`.
- `turn5:days`: `60`.
- `turn6:products`: `2`.
- `turn6:fob`: `12`.
- `turn6:days`: `50`.
- `turn6:moq`: `200`.
- `noNewSuppliers`: `0`.
- Comprobaciones correctas: 36. Reanudaciones de infraestructura: 0.

### WA36-extended-ambiguity-explicit-destination — PASS

**Usuario:**

> Agregá producto Taladro al proveedor Alfa Tools. FOB USD 9 por unidad, MOQ 500 unidades.

**Nihao:**

> 📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Usuario:**

> Agregá producto Guante al proveedor Beta Medical. FOB USD 2 por unidad, MOQ 1000 unidades.

**Nihao:**

> 📋 Producto «Guante» guardado como borrador, asociado a Beta Medical. Revisalo y confirmalo en la web.

**Usuario:**

> Agregale el producto Martillo. FOB USD 3 por unidad, MOQ 200 unidades.

**Nihao:**

> ¿A qué proveedor querés agregar el producto Martillo?
> 1. Beta Medical — Shanghai — Kendal Salud
> 2. Alfa Tools — Shenzhen — Broco Solutions

**Usuario:**

> Es para Alfa Tools

**Nihao:**

> 📋 Producto «Martillo» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Usuario:**

> Corregí el FOB del producto Guante del proveedor Beta Medical a USD 2.50. Conservá el MOQ.

**Nihao:**

> ✅ Producto «Guante» actualizado: {"fob":{"amount":2.5,"rawText":"USD 2.50","currency":"USD"}}.

**Usuario:**

> ¿Cuál es el FOB y MOQ del producto Martillo del proveedor Alfa Tools?

**Nihao:**

> El producto Martillo tiene FOB de USD 3 por unidad y MOQ de 200 unidades.

**Resultado producido:**

| Producto | Proveedor | FOB | MOQ | Plazo (días) | Estado |
|---|---|---|---|---|---|
| Taladro | Alfa Tools | USD 9 | 500 | Pendiente | DRAFT |
| Martillo | Alfa Tools | USD 3 | 200 | Pendiente | DRAFT |
| Guante | Beta Medical | USD 2.5 | 1000 | Pendiente | DRAFT |

- `turn1:products`: `1`.
- `turn1:fob`: `9`.
- `turn2:products`: `2`.
- `turn2:fob`: `2`.
- `turn3:products`: `2`.
- `turn4:products`: `3`.
- `turn4:fob`: `3`.
- `turn4:moq`: `200`.
- `turn5:products`: `3`.
- `turn5:fob`: `2.5`.
- `turn5:moq`: `1000`.
- `turn6:products`: `3`.
- `turn6:fob`: `3`.
- `turn6:moq`: `200`.
- `noNewSuppliers`: `0`.
- Comprobaciones correctas: 34. Reanudaciones de infraestructura: 0.

### WA37-extended-supplier-approval-and-products — PASS

**Usuario:**

> Corregí la ciudad del proveedor Alfa Tools: ahora es Guangzhou.

**Nihao:**

> ¿Confirmás este cambio en «Alfa Tools»?
> Actual: {"city":"Shenzhen"}
> Nuevo: {"city":"Guangzhou"}
> Respondé sí para aplicar o cancelar para descartarlo. Esta aprobación no confirma borradores.

**Usuario:**

> cancelar

**Nihao:**

> La propuesta se canceló. No se aplicaron cambios.

**Usuario:**

> Corregí la ciudad del proveedor Alfa Tools: ahora es Guangzhou.

**Nihao:**

> ¿Confirmás este cambio en «Alfa Tools»?
> Actual: {"city":"Shenzhen"}
> Nuevo: {"city":"Guangzhou"}
> Respondé sí para aplicar o cancelar para descartarlo. Esta aprobación no confirma borradores.

**Usuario:**

> sí

**Nihao:**

> ✅ Proveedor «Alfa Tools» actualizado: {"city":"Guangzhou"}.

**Usuario:**

> Agregá producto Taladro al proveedor Alfa Tools. FOB USD 9 por unidad, plazo 30 días.

**Nihao:**

> 📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Usuario:**

> Corregí el FOB del último producto a USD 7. Conservá el plazo.

**Nihao:**

> ✅ Producto «Taladro» actualizado: {"fob":{"amount":7,"currency":"USD"}}.

**Usuario:**

> Agregale el producto Martillo. FOB USD 3 por unidad, MOQ 200 unidades.

**Nihao:**

> 📋 Producto «Martillo» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Resultado producido:**

| Producto | Proveedor | FOB | MOQ | Plazo (días) | Estado |
|---|---|---|---|---|---|
| Taladro | Alfa Tools | USD 7 | Pendiente | 30 | DRAFT |
| Martillo | Alfa Tools | USD 3 | 200 | Pendiente | DRAFT |

- `turn1:products`: `0`.
- `turn2:products`: `0`.
- `turn3:products`: `0`.
- `turn4:products`: `0`.
- `turn5:products`: `1`.
- `turn5:fob`: `9`.
- `turn5:days`: `30`.
- `turn6:products`: `1`.
- `turn6:fob`: `7`.
- `turn6:days`: `30`.
- `turn7:products`: `2`.
- `turn7:fob`: `3`.
- `turn7:moq`: `200`.
- `noNewSuppliers`: `0`.
- `approvedSupplierCity`: `"Guangzhou"`.
- `cancelledProposal`: `1`.
- Comprobaciones correctas: 31. Reanudaciones de infraestructura: 0.

## Alcance productivo

El producto se asocia al proveedor; su empresa se toma del registro existente. Las respuestas breves conservan la carga pendiente. Las versiones repetidas de un producto recuperado usan las condiciones comerciales completas más recientes. Una propuesta sobre datos confirmados requiere aprobación explícita; los borradores se revisan y confirman en la web.

La memoria conserva referencias de las últimas cinco conversaciones terminadas de 24 horas. No permite inventar nuevos datos ni aprobar cambios. La ventana de agrupación sigue siendo 20 segundos; estos resultados no garantizan un tiempo fijo de respuesta ni validan entrega física por WhatsApp.

El borrador de vaso de vidrio del incidente real quedó corregido a 60 días mediante validación y control de concurrencia; se conservó su estado DRAFT y la auditoría histórica. Esa reparación es independiente de las evals sintéticas.
