# Evals del MVP de Nihao

Tres capas distintas: `pnpm test` verifica comportamiento determinístico; `eval:*` mide IA y conflictos con el core real; UAT físico prueba teléfono/WhatsApp/Evolution/conectividad. **AI EVALS ≠ UAT.** Un PASS de eval no valida el canal.

## Suites y comandos

Usar Node 24 y credenciales **locales** para Mistral. No se usa STAGING, Evolution ni R2 productivo. Los runners de imágenes cargan archivos locales en el `BusinessCardResolver` de producción; texto y transcripts usan `SupplierExtractionService` y los modelos/prompts productivos sin modificaciones. Merge/human corrections usan merge y repositorio de archivo existentes con datos sintéticos temporales. Channel usa fakes locales.

| Comando | Alcance |
|---|---|
| `pnpm eval:business-cards` | Cuatro tarjetas privadas, OCR Mistral y merge multi-foto |
| `pnpm eval:text` | Ocho textos sintéticos versionados |
| `pnpm eval:audio` | Seis transcripts sintéticos; extracción, **no** transcripción real |
| `pnpm eval:real-audio` | Voxtral y extracción si existe `test-data-private/audio/manifest.json`; si no, `SKIPPED — NO FIXTURES` |
| `pnpm eval:merge` | Siete casos determinísticos, conflictos y correcciones humanas |
| `pnpm eval:channel` | Seis casos con fakes; “Hola” es `XFAIL / KNOWN ISSUE` |
| `pnpm eval:all` | Todas las suites |
| `pnpm eval:compare -- <baseline-dir> <candidate-dir>` | Compara métricas y regresiones caso por caso |

Agregar `--runs 3` para medir estabilidad, o `--run-id mvp-baseline-001` para nombrar el reporte. Por defecto hay una repetición para controlar costo. Los reportes se escriben exclusivamente en `test-data-private/eval-reports/<run-id>/` (`summary.json`, `summary.md`, `cases.json`) y nunca deben agregarse a Git. `cases.json` puede contener datos privados: no compartirlo públicamente. Cada run guarda timestamp, SHA, rama, modelos, hashes de fuentes/fixtures, versiones y latencia. El runner registra los contadores de usage que Mistral incluya en su respuesta; no estima tokens faltantes ni dinero.

## Fixture de audio real futuro

Crear localmente `test-data-private/audio/manifest.json` con `{ "cases": [{ "caseId": "...", "file": "sample.ogg", "expectedTranscript": "...", "expectedNihao": {}, "mustRemainMissing": [] }] }`, y el audio en `test-data-private/audio/<caseId>/sample.ogg`. Sólo agregar recordings consentidos; no versionarlos. `expectedTranscript` se compara y se registra por separado de la extracción. Sin archivos reales, la suite se salta y no se presenta audio sintético como UAT.

## Scoring

Cada campo esperado se clasifica `correct`, `missingExpected` o `wrong`. Un valor en `mustRemainMissing` es `hallucinated`, con foco crítico en FOB, MOQ, entrega e interés. `WRONG` es más grave que `MISSING`; la tabla de métricas no decide automáticamente si un modelo mejoró. Los comparadores normalizan espacios/case, email, teléfono, URL y valor+unidad comercial sin fuzzy matching amplio. `contact` Tier 1 combina nombre/email/teléfono y admite sólo un teléfono: cuando la tarjeta muestra varios, cualquiera de los números visibles es válido, sin exigir almacenar todos. Website y otros facts sin columna Tier 1 quedan observacionales. El OCR de business cards productivo sólo admite empresa/contacto/ciudad/provincia: los `expectedNihao` privados siguen siendo la expectativa y sus fallos se reportan sin alterar el extractor.

Un caso pasa sólo si sus expectativas explícitas son correctas, no viola `mustRemainMissing`, y satisface REVIEW/merge/human override cuando corresponda. `XFAIL` se reserva para “Hola”; `XPASS` exige revisar el issue. El caso de corrección verbal en transcripts es `OBSERVATIONAL` hasta definir su política. Los reportes de comparación muestran precision, recall, wrong, missing, hallucinations, review, merge y regresiones concretas. Guardar un baseline nuevo antes de cambiar prompts/modelos; no modificar el core para hacer pasar fixtures.

## T07 — interés comercial inventado

El baseline `mvp-baseline-001` registró la hallucination crítica `"Proveedor de iluminación. Interesante."` → `interestScore=4`. **FIX IMPLEMENTED / PENDING REVIEW**: la core sólo acepta el score propuesto por Mistral si el texto o transcript original contiene una valoración numérica explícita del mismo valor, por ejemplo `Interés 4 de 5`, `Interés 4/5` o `Interest 4 out of 5`. `Interés 4` conserva el contrato previo. `Interesante`, otras frases vagas e `interés alto/medio/bajo` no tienen conversión automática documentada y permanecen missing; una persona puede corregir el campo durante la revisión. El eval local T07 pasó 3/3; esto no equivale a validación STAGING/UAT. No cambiar los expected ni el baseline histórico.

## Kendal — contacto complementario frente/reverso

El baseline `mvp-baseline-001` perdió nombre, email y teléfono porque el merge comparaba dos strings `contact` completos como si fueran contradictorios. **FIX IMPLEMENTED / PENDING REVIEW**: el merge productivo separa sólo componentes reconocibles del formato actual, normaliza equivalencias razonables y vuelve a serializar al mismo campo. Nombre/email/teléfono complementarios se conservan; valores incompatibles o texto libre no interpretable siguen en REVIEW. No hubo migration ni cambio de expected. Kendal recuperó los tres componentes y `mergeCorrect=true` en 3/3 evals locales; el status general sigue FAIL por la equivalencia de nombre comercial `KendalSalud`/`Kendal Salud`, que queda fuera de este milestone. AI EVALS ≠ UAT físico.
