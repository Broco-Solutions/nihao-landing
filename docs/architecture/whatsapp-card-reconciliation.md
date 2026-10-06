# Reconciliación canónica de tarjetas — 2026-10-06

## Auditoría antes de los cambios

`BurstReader.read` descarga y guarda el original; `readOriginalImage` llama visión independiente; `analyzer.readImage` produce OCR. `MistralExtractionProvider.extractReading` extrae `ExtractionCandidate` del OCR y `toCandidate` valida la respuesta. El candidato no ofrece un campo estructurado `personName`: `contact` puede contener nombres y contactos combinados.

`cardDisagreements` comparaba companyName normalizado por igualdad completa (si estaba respaldado en OCR), correos tomados del OCR mediante una expresión que incluía etiquetas, teléfonos del candidato con dígitos normalizados y website del candidato respaldado en OCR. Esos cuatro campos disparaban discrepancias. `readingNeedsReview` también disparaba la segunda visión por incertidumbre explícita, baja confianza o ilegibilidad.

La segunda visión se comparaba otra vez contra el mismo OCR crudo. Si no resolvía todas las discrepancias y la incertidumbre, el resultado quedaba `AMBIGUOUS_CARD_READING`. No se alteraron los prompts ni las condiciones de confianza/legibilidad.

## Flujo nuevo

```text
OCR original + candidato checkpointed
  → canonicalOcrCard (una representación para esta lectura)
  → compareCard(primera visión, OCR canónico)
  → si hay discrepancia o incertidumbre, segunda visión independiente
  → compareCard(segunda visión, el mismo OCR canónico)
  → PARSED o NEEDS_REVIEW, con señales checkpointed
```

Los campos originales permanecen en `ocr`, `ocrCandidate` e `independentReadings`. Los nuevos metadatos `ingestion.reconciliation` contienen versión, representación OCR y trazas first/second. No hay migraciones ni cambios en tool schemas.

## Helpers y reglas

- `canonicalEmail`: trim, lowercase, etiquetas E-mail/Email/Mail/Correo (también espacios y dos puntos de ancho completo), envoltorios externos balanceados y puntuación final. Conserva caracteres válidos del local part. No corrige letras, dominios o direcciones inválidas. `extractOcrEmails` entrega emails canónicos; los tokens etiquetados originales se conservan en tracing. Tokens inválidos producen `INVALID_OCR_EMAIL`, sin ser descartados como si fueran seguros.
- `canonicalName`: diferencias de case, espacios y puntuación; conserva acentos, letras, números, ampersand y plus. No hace transliteración, traducción ni fuzzy matching.
- `nameVariants` / `compareNames`: separadores `/`, `|`, saltos y límites claros CJK/latino; una coincidencia exacta de variante basta sólo si las variantes adicionales son de escrituras distintas. No acepta A/B contra A si A y B son nombres distintos de la misma escritura; tampoco acepta dos variantes CJK incompatibles bajo el mismo nombre inglés.
- `hasCjk`: Han, Hiragana, Katakana y Hangul. La detección de scripts también cubre otras escrituras para comparación de variantes delimitadas.
- `canonicalPhone`: elimina exclusivamente formato; preserva todos los dígitos. Acepta `(+86)` como prefijo explícito. No convierte `00` a `+`, no quita ceros ni infiere código de país. Tokens con texto adicional quedan inválidos.
- `canonicalDomain`: URL parseada, hostname exacto en lowercase. Ignora esquema/path para comparar el dominio; conserva guiones y subdominios, incluido www. No deduce websites desde emails.
- Contactos exactos generan señales de compatibilidad, pero nunca anulan un conflicto real de contactos ni nombres distintos en la misma escritura. Para nombres de escrituras totalmente disjuntas se requieren al menos dos clases de contactos coincidentes y ningún conflicto. Una única coincidencia telefónica no basta.
- Los helpers de nombres también soportan nombres personales bilingües, con tests. No se interpreta automáticamente `extractedFields.contact` como personName: no existe ese campo OCR estructurado y hacerlo podría inventar una discrepancia o identidad. Se preserva la política existente para ese campo.

Se mantiene la asimetría protectora existente: todos los contactos OCR deben encontrarse en visión; contactos visuales adicionales por sí solos no se consideran contradicciones. Formatos no soportados siguen en revisión.

## Señales estructuradas

`EXACT_NAME_MATCH`, `BILINGUAL_VARIANT_MATCH`, `CROSS_SCRIPT_CONTACT_MATCH`, `EMAIL_CANONICAL_MATCH`, `DOMAIN_MATCH`, `PHONE_MATCH`, `REAL_EMAIL_CONFLICT`, `REAL_PHONE_CONFLICT`, `REAL_DOMAIN_CONFLICT`, `COMPANY_NAME_CONFLICT`, `INVALID_OCR_EMAIL`, `INVALID_OCR_PHONE`, `INVALID_OCR_DOMAIN`.

Cada señal contiene field, reason, valores OCR raw/canonical y visión raw/canonical; no chain-of-thought. Las razones de incertidumbre visual siguen disponibles en cada lectura independiente.

## Replay real sin AI

Se exportaron 36 checkpoints de producción en una transacción READ ONLY, al directorio ignorado `fixtures/whatsapp-replay/local/reconciliation-20261006/`. La fotografía más reciente ya estaba PROCESSED y se conservó. El export tiene 19 tarjetas cuyo error original era AMBIGUOUS_CARD_READING.

`scripts/replay-card-reconciliation.mts` reproduce el BurstReader real para esas 19, reutilizando OCR, candidato, original checkpointed y ambas visiones. Las dependencias lanzan error si se solicita download, OCR, extracción o una visión sin tape. Usa un stub de bytes para el get del original: no revisa visualmente las fotos ni valida ground truth. No ejecuta grouping, escrituras de dominio ni outbox.

```sh
node --import tsx scripts/replay-card-reconciliation.mts \
  fixtures/whatsapp-replay/local/reconciliation-20261006/checkpoints.json \
  fixtures/whatsapp-replay/local/reconciliation-20261006/report.json
```

Resultado: **19 antes → 17 después**. Mensajes **8 y 10 → PARSED**, ambos sin necesitar segunda visión. Esto corrige el diagnóstico inicial excesivamente amplio: el replay no demuestra 19 falsos positivos.

| Mensaje | Campo | OCR raw | OCR canónico | Visión | Razón |
| --- | --- | --- | --- | --- | --- |
| 8 | companyName | DRAGINO TECHNOLOGY CO., LTD / 深圳市粹联科技开发有限公司 | draginotechnologycoltd; 深圳市粹联科技开发有限公司 | Dragino Technology Co., Ltd | BILINGUAL_VARIANT_MATCH |
| 10 | companyName | 富捷科技 / FUJIE TECHNOLOGY | 富捷科技; fujietechnology | FUJIE TECHNOLOGY | BILINGUAL_VARIANT_MATCH |
| 10 | emails | E-mail:sampan@chinafujie.com | sampan@chinafujie.com | sampan@chinafujie.com | EMAIL_CANONICAL_MATCH |

Los valores completos de cada fase/campo (también contactos que coincidieron) están en `report.json` y `report.md` locales privados, junto a la evidencia original. No se incorporan datos adicionales de clientes al repositorio.

| Mensajes que siguen ambiguos | Motivo reproducido |
| --- | --- |
| 3, 16 | Email, dominio y nombre incompatibles entre lecturas |
| 4 | Email y dominio distintos; teléfono OCR contaminado con código postal; incertidumbre telefónica visual |
| 6 | Incertidumbre telefónica explícita persistente |
| 14, 25 | Emails con caracteres realmente diferentes |
| 17 | Teléfono diferente e incertidumbre telefónica |
| 18 | Nombre diferente: Henan frente a Hunan; los contactos no anulan esa diferencia |
| 19 | Nombre y teléfono diferentes |
| 22 | Nombre, email, dominio y teléfono incompatibles |
| 23, 34 | Teléfono omitido/diferente; se conserva protección |
| 27, 30 | Emails y teléfonos incompatibles/omitidos |
| 29, 32 | Nombre/email incompatibles y/o incertidumbre visual; revisar trazas de ambas visiones |
| 31 | Incertidumbre explícita en varios campos, aunque no hay conflicto canónico |

Son diferencias reales entre los valores guardados, no una afirmación de cuál lectura coincide con la fotografía. No se fuerza su aceptación.

## Validación y límites

30 tests nuevos en `whatsapp-card-reconciliation.test.mts` cubren etiquetas, emails distintos/dudosos/caracteres válidos, variantes bilingües, otros alfabetos, empresas distintas, contactos, teléfonos, dominios y el flujo real de primera/segunda visión con checkpoints.

Suite completa con PostgreSQL aislado local: 428 tests, 428 pass, 0 fail, 0 skipped. Incluye replay operacional de 34 imágenes. Typecheck sin errores; lint sin errores y cuatro warnings de frontend preexistentes; git diff --check limpio.

Los assets ya complete no se reinterpretan automáticamente: se conserva el contrato de reutilización de checkpoints. Recuperar casos de producción ya marcados NEEDS_REVIEW requiere una operación explícita posterior; esta etapa no modifica producción. Sólo se reejecutó la reconciliación offline, no una ráfaga end-to-end con nuevos efectos. El replay reutiliza respuestas históricas; no garantiza que nuevas llamadas AI produzcan las mismas lecturas.

No se modificaron modelo, reasoning, prompts, thresholds, grouping, confirmación, audio association, tool schemas, límites operativos ni negocio. **No push. No deploy.**
