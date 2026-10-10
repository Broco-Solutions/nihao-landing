# Evals de memoria reciente — 4 de octubre de 2026

La memoria conserva referencias de las últimas 5 conversaciones terminadas durante 24 horas, por usuario, teléfono e instancia. Los valores comerciales se consultan o extraen de nuevo; las aprobaciones no se heredan.

## Validación

- 237 pruebas automáticas aprobadas, sin omisiones, con PostgreSQL local aislado para v2/v3.
- Build, TypeScript y lint de los archivos modificados aprobados.
- Suite ampliada inicial: 25/30 PASS, 5 FAIL, 0 ERROR.
- Después de limitar el prompt y la tool de memoria a referencias al contexto: 29/30 PASS; falló WP06 por una pregunta de empresa innecesaria.
- Se reforzaron las instrucciones de reparación de FACTS y la validación de empresa ya indicada. Verificación final: 6/6 PASS (cinco casos nuevos y WP06), 0 FAIL/ERROR. Los reportes anteriores se conservan.

Las evals usan Mistral real y registros PostgreSQL reales aislados. No envían mensajes por Evolution ni verifican WhatsApp físico. El vencimiento se simula fechando la conversación anterior 25 horas atrás. Cada caso comienza con datos aislados y los elimina al finalizar.

## Conversaciones nuevas y resultados

### WA26-memory-continue — PASS

**Primera conversación — Usuario:**

```text
Agregá producto Taladro a Alfa Tools. FOB USD 9 por unidad.
```

**Nihao:**

```text
📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
```

**Evento de la eval:** termina la primera conversación y comienza una nueva, con estado vacío y acceso a la memoria reciente.

**Segunda conversación — Usuario:**

```text
Agregale el producto Martillo. FOB USD 3 por unidad.
```

**Nihao:**

```text
📋 Producto «Martillo» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
```

**Resultado observado en la base y el estado del agente:**

```json
{
  "products": 2,
  "prices": [
    3,
    9
  ],
  "supplierIds": [
    "supplier-alfa",
    "supplier-alfa"
  ],
  "question": false
}
```

**Comprobaciones:**

| Campo | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| products | 2 | 2 | PASS |
| prices | [3,9] | [3,9] | PASS |
| supplierIds | ["supplier-alfa","supplier-alfa"] | ["supplier-alfa","supplier-alfa"] | PASS |
| question | false | false | PASS |

### WA27-memory-last-product — PASS

**Primera conversación — Usuario:**

```text
Agregá producto Taladro a Alfa Tools. FOB USD 9 por unidad. MOQ 500 unidades.
```

**Nihao:**

```text
📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
```

**Evento de la eval:** termina la primera conversación y comienza una nueva, con estado vacío y acceso a la memoria reciente.

**Segunda conversación — Usuario:**

```text
Corregí el FOB del último producto a USD 7 por unidad.
```

**Nihao:**

```text
✅ Producto «Taladro» actualizado: {"fob":{"unit":"unidad","amount":7,"rawText":"USD 7 por unidad","currency":"USD"}}.
```

**Resultado observado en la base y el estado del agente:**

```json
{
  "products": 1,
  "fob": 7,
  "moq": 500,
  "status": "DRAFT",
  "question": false
}
```

**Comprobaciones:**

| Campo | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| products | 1 | 1 | PASS |
| fob | 7 | 7 | PASS |
| moq | 500 | 500 | PASS |
| status | "DRAFT" | "DRAFT" | PASS |
| question | false | false | PASS |

### WA28-memory-expired — PASS

**Primera conversación — Usuario:**

```text
Agregá producto Taladro a Alfa Tools. FOB USD 9 por unidad.
```

**Nihao:**

```text
📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
```

**Evento de la eval:** la primera conversación se marca terminada y se fecha 25 horas atrás; queda fuera de la ventana de memoria.

**Segunda conversación — Usuario:**

```text
Agregale el producto Martillo. FOB USD 3 por unidad.
```

**Nihao:**

```text
¿A qué proveedor querés agregar el producto Martillo?
```

**Resultado observado en la base y el estado del agente:**

```json
{
  "products": 1,
  "question": true
}
```

**Comprobaciones:**

| Campo | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| products | 1 | 1 | PASS |
| question | true | true | PASS |

### WA29-memory-ambiguous — PASS

**Primera conversación — Usuario:**

```text
Agregá producto Taladro a Alfa Tools. FOB USD 9 por unidad. Agregá producto Guante a Beta Medical. FOB USD 2 por unidad.
```

**Nihao:**

```text
📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
📋 Producto «Guante» guardado como borrador, asociado a Beta Medical. Revisalo y confirmalo en la web.
```

**Evento de la eval:** termina la primera conversación y comienza una nueva, con estado vacío y acceso a la memoria reciente.

**Segunda conversación — Usuario:**

```text
Agregale el producto Martillo. FOB USD 3 por unidad.
```

**Nihao:**

```text
¿A qué proveedor querés agregar el producto Martillo?
1. Alfa Tools (Broco Solutions) - Shenzhen
```

**Resultado observado en la base y el estado del agente:**

```json
{
  "products": 2,
  "question": true
}
```

**Comprobaciones:**

| Campo | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| products | 2 | 2 | PASS |
| question | true | true | PASS |

### WA30-memory-explicit-destination — PASS

**Primera conversación — Usuario:**

```text
Agregá producto Taladro a Alfa Tools. FOB USD 9 por unidad.
```

**Nihao:**

```text
📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
```

**Evento de la eval:** termina la primera conversación y comienza una nueva, con estado vacío y acceso a la memoria reciente.

**Segunda conversación — Usuario:**

```text
Agregá producto Martillo a Beta Medical. FOB USD 3 por unidad.
```

**Nihao:**

```text
📋 Producto «Martillo» guardado como borrador, asociado a Beta Medical. Revisalo y confirmalo en la web.
```

**Resultado observado en la base y el estado del agente:**

```json
{
  "products": 2,
  "supplierIds": [
    "supplier-beta",
    "supplier-alfa"
  ],
  "question": false
}
```

**Comprobaciones:**

| Campo | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| products | 2 | 2 | PASS |
| supplierIds | ["supplier-beta","supplier-alfa"] | ["supplier-beta","supplier-alfa"] | PASS |
| question | false | false | PASS |

## Regresión de homónimos con empresa explícita

```text
Cargá el producto Taladro para el proveedor Alfa Tools de Kendal Salud.
```

**Nihao:**

```text
📋 Producto «Taladro» guardado como borrador, asociado a Alfa Tools. Revisalo y confirmalo en la web.
```

**Resultado:** se crea un Taladro DRAFT asociado al proveedor Alfa Tools de Kendal Salud. No queda pregunta pendiente y no se crea otro proveedor.

## Reportes completos

- Verificación final: casos y trazas (reporte privado no disponible en este checkout): `test-data-private/eval-reports/whatsapp-agent-memory-release-20261004/cases.json`.
- Verificación final: resumen (reporte privado no disponible en este checkout): `test-data-private/eval-reports/whatsapp-agent-memory-release-20261004/summary.md`.
- Suite ampliada antes del último ajuste (reporte privado no disponible en este checkout): `test-data-private/eval-reports/whatsapp-agent-memory-final-20261004/summary.md`.
- [Arquitectura y reglas de memoria](../architecture/whatsapp-agent-tools.md).

Los reportes completos están en `test-data-private` y son locales; este documento conserva las conversaciones y resultados de las nuevas evals. Las evals se ejecutaron antes de publicar la implementación.
