# Evals: selector de proveedor por WhatsApp — 2026-10-04

Modelo: `gpt-5.6-luna` real. PostgreSQL local aislado. Webhook, worker, estado pendiente, outbox y cliente Evolution productivos; transporte de WhatsApp simulado. No se enviaron mensajes a clientes ni se escribieron datos de eval en producción.

## WA38 — carga de sillas y selección de Broco

Run: `whatsapp-supplier-picker-final-20261004`. Resultado: **3/3 PASS**, cero FAIL/ERROR. Cada repetición incluyó los siguientes dos turnos de usuario.

### Conversación 1

**Usuario:** Tengo un vendedor de sillas de plastico con fob 90 y leadtime de 45 dias

**Nihao:** ¿A qué proveedor pertenece el producto? Elegí una opción o escribí su nombre.

También podés escribir el nombre del proveedor.

Botón: **Elegir proveedor**. Opciones:

- Beta Medical · Kendal Salud · Shanghai
- Broco · Broco Solutions · Shenzhen

**Usuario:** toca **Broco** en la lista.

**Nihao:** 📋 Producto «sillas de plastico» guardado como borrador, asociado a Broco. Revisalo y confirmalo en la web.

**Resultado persistido:** un producto borrador «sillas de plastico» asociado al proveedor Broco y su empresa Broco Solutions; FOB 90, plazo 45 días, moneda y MOQ pendientes. Antes de elegir había cero productos. Una única lista enviada y ningún proveedor nuevo creado.

Comprobaciones: **12 correctas**, cero incorrectas. Tiempo total de procesamiento de ambos turnos en eval: 21.6 s; no incluye la espera real de agrupación ni entrega de WhatsApp.

### Conversación 2

**Usuario:** Tengo un vendedor de sillas de plastico con fob 90 y leadtime de 45 dias

**Nihao:** ¿A qué proveedor pertenece el producto? Elegí una opción o escribí su nombre.

También podés escribir el nombre del proveedor.

Botón: **Elegir proveedor**. Opciones:

- Beta Medical · Kendal Salud · Shanghai
- Broco · Broco Solutions · Shenzhen

**Usuario:** toca **Broco** en la lista.

**Nihao:** 📋 Producto «sillas de plastico» guardado como borrador, asociado a Broco. Revisalo y confirmalo en la web.

**Resultado persistido:** un producto borrador «sillas de plastico» asociado al proveedor Broco y su empresa Broco Solutions; FOB 90, plazo 45 días, moneda y MOQ pendientes. Antes de elegir había cero productos. Una única lista enviada y ningún proveedor nuevo creado.

Comprobaciones: **12 correctas**, cero incorrectas. Tiempo total de procesamiento de ambos turnos en eval: 24.9 s; no incluye la espera real de agrupación ni entrega de WhatsApp.

### Conversación 3

**Usuario:** Tengo un vendedor de sillas de plastico con fob 90 y leadtime de 45 dias

**Nihao:** ¿A qué proveedor pertenece el producto? Elegí una opción o escribí su nombre.

También podés escribir el nombre del proveedor.

Botón: **Elegir proveedor**. Opciones:

- Beta Medical · Kendal Salud · Shanghai
- Broco · Broco Solutions · Shenzhen

**Usuario:** toca **Broco** en la lista.

**Nihao:** 📋 Producto «sillas de plastico» guardado como borrador, asociado a Broco. Revisalo y confirmalo en la web.

**Resultado persistido:** un producto borrador «sillas de plastico» asociado al proveedor Broco y su empresa Broco Solutions; FOB 90, plazo 45 días, moneda y MOQ pendientes. Antes de elegir había cero productos. Una única lista enviada y ningún proveedor nuevo creado.

Comprobaciones: **12 correctas**, cero incorrectas. Tiempo total de procesamiento de ambos turnos en eval: 23.4 s; no incluye la espera real de agrupación ni entrega de WhatsApp.

## Verificación determinística

266 tests PASS, sin fallos ni skips. Incluyen apertura de lista, formato Evolution v2, límite de diez filas, selección por ID, etiquetas adulteradas, selección vieja/ajena, persistencia de la respuesta numérica, homónimos sin la palabra «proveedor» en la pregunta y fallback textual ante rechazo definitivo. TypeScript y build aprobados; ESLint sin errores (el script de eval está excluido por la configuración de lint).

## Límites de la validación

La selección y envío se simularon contra el adaptador Evolution; falta probar la presentación y entrega del menú en un teléfono real. Si Evolution rechaza el envío de listas con un error definitivo, Nihao envía opciones numeradas. No se promete una latencia fija.

## Regresiones y conversación extendida

Run: `whatsapp-supplier-picker-regression-final-20261004`. **5/5 PASS**, cero FAIL/ERROR. Estas regresiones registran respuestas del orquestador; WA38 verifica además el envío de la lista y su callback.

### WP05-homonyms-numeric-answer

**Usuario:** Agregá producto Taladro a Alfa Tools.

**Nihao:** ¿A cuál Alfa Tools querés agregar el producto Taladro?
1. Alfa Tools · Broco Solutions · Shenzhen
2. Alfa Tools · Kendal Salud · Shanghai

**Usuario:** 2

**Nihao:** 📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Resultado:** Un producto Taladro borrador asociado a Alfa Tools de Kendal Salud; no se inventaron condiciones comerciales. El estado inicial habilitó el selector aun cuando la pregunta sólo decía «¿A cuál Alfa Tools…?».

Comprobaciones: **8 correctas**, cero incorrectas.

### WP06-homonyms-company

**Usuario:** Cargá el producto Taladro para el proveedor Alfa Tools de Kendal Salud.

**Nihao:** 📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Resultado:** Un producto Taladro borrador asociado al proveedor Alfa Tools de Kendal Salud. No preguntó por destino porque estaba identificado.

Comprobaciones: **6 correctas**, cero incorrectas.

### WP08-missing-supplier

**Usuario:** Quiero agregar un producto a un proveedor que ya cargamos. Producto: Lámpara. FOB USD 7 por unidad.

**Nihao:** ¿A qué proveedor pertenece el producto? Elegí una opción o escribí su nombre.
1. Alfa Tools · Broco Solutions · Shenzhen
2. Beta Medical · Kendal Salud · Shanghai

**Resultado:** Producto Lámpara pendiente, con pregunta de proveedor y opciones autorizadas. Cero productos persistidos antes de seleccionar.

Comprobaciones: **4 correctas**, cero incorrectas.

### WA34-product-supplier-determines-company

**Usuario:** Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias

**Nihao:** ¿A qué proveedor pertenece el producto? Elegí una opción o escribí su nombre.
1. Beta Medical · Kendal Salud · Shanghai
2. Broco · Broco Solutions · Shenzhen

**Usuario:** a broco

**Nihao:** 📋 Producto «vaso de vidrio» guardado como borrador, asociado a Broco. Revisalo y confirmalo en la web.

**Resultado:** Un vaso de vidrio borrador para Broco: FOB USD 30, plazo 60 días, MOQ pendiente. La empresa se derivó del proveedor y no se creó un proveedor nuevo.

Comprobaciones: **18 correctas**, cero incorrectas.

### WA35-extended-product-context-corrections

**Usuario:** Tengo un vaso de vidrio con precio FOB de 30 USD y leedtime de 60 dias

**Nihao:** ¿A qué proveedor pertenece el producto? Elegí una opción o escribí su nombre.
1. Alfa Tools · Broco Solutions · Shenzhen
2. Beta Medical · Kendal Salud · Shanghai

**Usuario:** Es del proveedor Alfa Tools

**Nihao:** 📋 Producto «vaso de vidrio» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Usuario:** Corregí el FOB del último producto a USD 28. Conservá el plazo.

**Nihao:** ✅ Producto «vaso de vidrio» actualizado: {"fob":{"amount":28,"currency":"USD"}}.

**Usuario:** Agregale el producto Jarra de vidrio. FOB USD 12 por unidad, MOQ 200 unidades, plazo 45 días.

**Nihao:** 📋 Producto «Jarra de vidrio» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.

**Usuario:** ¿Cuál es el FOB y el plazo del producto vaso de vidrio del proveedor Alfa Tools?

**Nihao:** El vaso de vidrio de Alfa Tools figura con FOB de USD 28 y plazo de 60 días.

**Usuario:** Corregí el plazo del producto Jarra de vidrio del proveedor Alfa Tools a 50 días. No cambies el FOB ni MOQ.

**Nihao:** ✅ Producto «Jarra de vidrio» actualizado: {"leadTime":{"days":50,"rawText":"50 días"}}.

**Resultado:** Dos productos borradores para Alfa Tools: vaso de vidrio con FOB USD 28 y plazo 60 días; Jarra de vidrio con FOB USD 12, MOQ 200 unidades y plazo 50 días. La consulta devolvió los valores actuales y las correcciones conservaron los campos no modificados. No se creó un proveedor nuevo.

Comprobaciones: **36 correctas**, cero incorrectas.

## Aceptación del release

3/3 repeticiones del selector y 5/5 regresiones PASS. 42 hashes de fuentes/fixture coinciden con la versión publicada en cada reporte final. Los reportes JSON originales y la prueba de release se conservan en `test-data-private/`, excluidos de Git.
