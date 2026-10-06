# Public Nihao replay fixtures

Synthetic assets and structured AI mocks, with fictional `.test` contact addresses.
No client originals or private accounts. PNGs are drawn by code; WAVs use a local
synthetic voice; the PDF is a synthetic sample and remains manual review.

A–J cover the ten requested client incident patterns; K covers native documents
and reply metadata. Each JSON defines messages, authorized seed catalog, mock
responses and partial expectations. These cases verify backend decisions and
transactions; they do not measure real vision/transcription accuracy.

Run from repository root with local `EVAL_AGENT_DATABASE_URL` pointing exclusively
to `localhost/nihao_agent_test`:

```sh
npm run replay -- fixtures/whatsapp-replay/public/C-explicit-alfa.json
```

Original client cases belong in the gitignored `fixtures/whatsapp-replay/local/`.
Reports/tapes belong in gitignored `replay-output/`.

See [full instructions](../../../docs/development/whatsapp-replay-harness.md).
Regeneration is optional: `node --import tsx scripts/generate-replay-fixtures.mts`
(macOS `say`/`afconvert` required only to regenerate synthetic audio).
