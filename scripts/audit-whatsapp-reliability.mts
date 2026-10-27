import pg from "pg";

// Intentionally no dotenv, --apply, writes, provider clients or message sending.
// Use a read-only role where available; the session also enforces read-only.
const url = process.env.READONLY_DATABASE_URL;
if (!url) throw new Error("READONLY_DATABASE_URL is required");
const since = process.argv[2] ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
if (!Number.isFinite(Date.parse(since)) || process.argv.length > 3) throw new Error("Usage: audit-whatsapp-reliability.mts [ISO since]");
const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000, options: "-c default_transaction_read_only=on -c statement_timeout=15000" });
try {
  await db.connect();
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const counts: Record<string, unknown> = {};
  for (const [label, table, column] of [
    ["bursts", "WhatsAppBurst", "status"], ["originals", "WhatsAppBurstMessage", "storageStatus"],
    ["outbox", "WhatsAppBurstReply", "status"], ["pendingCommercialEvidence", "WhatsAppPendingEvidence", "status"],
  ]) counts[label] = (await db.query(`SELECT "${column}" AS status, count(*)::int AS count FROM "${table}" GROUP BY "${column}" ORDER BY "${column}"`)).rows;
  const inventory = (await db.query(`
    SELECT b.id, b.status, b.revision, b."createdAt", b."processingFinishedAt",
      b.state->'agent'->'termination' AS termination,
      b.state->'agent'->'functionalRemediation'->>'resolution' AS remediation,
      b.state->'agent'->'pending'->>'type' AS "pendingQuestionType",
      b.state->'agent'->'pending'->'businessDecision' AS "businessDecision",
      b.state->'ingestion'->'summary' AS "ingestionSummary",
      (SELECT count(*)::int FROM "WhatsAppBurstMessage" m WHERE m."burstId"=b.id) AS messages,
      (SELECT count(*)::int FROM "WhatsAppBurstMessage" m WHERE m."burstId"=b.id AND m."storageStatus"='STORED') AS "storedOriginals",
      (SELECT count(*)::int FROM "WhatsAppBurstMessage" m WHERE m."burstId"=b.id AND m."storageStatus"='PENDING_STORAGE') AS "pendingOriginals",
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'tool',o.tool,'status',o.status,'resourceId',o.result->>'id',
        'resourceExists',CASE
          WHEN o.tool IN ('create_product_draft','update_product') THEN EXISTS(SELECT 1 FROM "SupplierProduct" p WHERE p.id=o.result->>'id')
          WHEN o.tool='preserve_product_facts' THEN EXISTS(SELECT 1 FROM "WhatsAppPendingEvidence" p WHERE p.id=o.result->>'id')
          ELSE EXISTS(SELECT 1 FROM "SupplierCapture" c WHERE c.id=o.result->>'captureId') END)), '[]'::jsonb)
       FROM "WhatsAppAgentOperation" o WHERE o."burstId"=b.id) AS operations,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'sourceMessageId',p."sourceMessageId",'targetProductId',p."targetProductId")), '[]'::jsonb)
       FROM "WhatsAppPendingEvidence" p JOIN "WhatsAppBurstMessage" m ON m.id=p."sourceMessageId" WHERE m."burstId"=b.id) AS "pendingFacts",
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status)), '[]'::jsonb)
       FROM "WhatsAppBurstReply" r WHERE r."burstId"=b.id) AS replies
    FROM "WhatsAppBurst" b WHERE b.version=3 AND b."createdAt">=$1
    ORDER BY b."createdAt" DESC LIMIT 501`, [new Date(since)])).rows;
  if (inventory.length > 500) throw new Error("Inventory exceeds 500 bursts; use a narrower since date");
  const duplicates = (await db.query(`SELECT "burstId", tool, count(*)::int AS count FROM "WhatsAppAgentOperation"
    WHERE status='COMPLETED' AND tool IN ('create_product_draft','create_supplier_draft')
    GROUP BY "burstId",tool,result->>'id' HAVING count(*)>1 LIMIT 100`)).rows;
  await db.query("ROLLBACK");
  console.log(JSON.stringify({ mode: "READ_ONLY_DRY_RUN", observedAt: new Date().toISOString(), since, counts, duplicateReceiptTargets: duplicates, inventory,
    recoveryPolicy: "Review explicit burst/message IDs and existing resources. Preserve unresolved associations. No replays, writes or retroactive traveler messages are executed by this command." }, null, 2));
} catch (error) {
  // Never echo provider errors which could include connection credentials.
  console.error("WhatsApp read-only audit failed", { code: (error as { code?: string }).code ?? "AUDIT_FAILED" });
  process.exitCode = 1;
} finally { await db.end(); }
