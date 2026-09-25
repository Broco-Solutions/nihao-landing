# Nihao MVP evals

The versioned evaluator lives here. Private images, audio, expected JSON and every report stay under ignored `test-data-private/`.

- Deterministic tests (`pnpm test`) guard states, permissions, idempotency, merge and human correction.
- AI evals measure OCR/extraction/transcription quality through the production providers and `SupplierExtractionService`.
- Physical UAT validates WhatsApp, Evolution, camera, connectivity and the end-user experience; evals do not replace it.

See [development/evals.md](../docs/development/evals.md) for commands, scoring and fixture contracts.
