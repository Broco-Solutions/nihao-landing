import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

if (process.env.PRODUCTION_EVAL !== 'Viaje de Pruebas') throw new Error('Explicit eval authorization required');
const tripId = '60e57ace-136b-4604-b3e1-a44f0a1e1e32';
const accountId = 'iHPdAuHlSE3KNtp1VvYQ7qtmvlMYXI8Y';
const runIds = ['c7ea6a77', 'ad32dde9', 'de05355d', 'c8b91a6f', '14906c93', '4b977831'].map(id => `EVAL-2026-10-07-${id}`);
const webRun = 'EVAL-WEB-2026-10-07-b984b745';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
try {
  const scenarios: Array<Record<string, unknown>> = [];
  let selectedSupplier: string | undefined;
  for (const run of runIds) {
    const path = `replay-output/${run}/report.json`;
    const report = JSON.parse(await readFile(path, 'utf8'));
    const rows = await db.whatsAppBurst.findMany({
      where: { instance: `production-eval-${run}`, userId: accountId }, select: { id: true, state: true },
    });
    for (const scenario of report.scenarios) {
      if (scenario.label === '14-ambiguous-supplier-clarification-numeric') selectedSupplier = scenario.state.agent.pending.options[0].id;
      const row = rows.find(r => r.id === scenario.burstId);
      if (row) {
        // Keep the checkpoint at each revision, especially before approval/cancellation.
        scenario.finalState = row.state;
        scenario.state ??= row.state;
        const state = row.state as { agent?: { calls: Array<{ name: string; result: { error?: string; message?: string } }> } };
        scenario.toolErrors = state.agent?.calls.filter(c => c.result?.error).map(c => ({ tool: c.name, error: c.result.error, message: c.result.message }));
      }
      scenarios.push({ run, label: scenario.label, status: scenario.status, burstId: scenario.burstId, error: scenario.error, toolErrors: scenario.toolErrors });
    }
    await writeFile(path, JSON.stringify(report, null, 2), { mode: 0o600 });
  }
  const products = await db.supplierProduct.findMany({
    where: { capture: { tripId }, OR: [...runIds, webRun].map(run => ({ name: { contains: run } })) },
    include: { images: { select: { id: true } }, capture: { select: { tripId: true, companyId: true } } }, orderBy: { createdAt: 'asc' },
  });
  assert.equal(products.length, 27);
  assert.ok(products.every(p => p.status === 'CONFIRMED'));
  assert.equal(products.filter(p => p.name?.includes(webRun)).length, 12);
  const product = (name: string) => { const result = products.find(p => p.name === name); assert.ok(result, name); return result; };
  assert.equal(Number(product('Bloques de construcción EVAL-2026-10-07-de05355d').fobAmount), 6);
  assert.equal(product('Vasos descartables EVAL-2026-10-07-14906c93').fobAmount, null);
  for (const [name, amount, quantity] of [['Rompecabezas infantil', 4, 200], ['Auto de juguete', 5, 300], ['Dispensador de agua', 6, 400]] as const) {
    const row = product(`${name} EVAL-2026-10-07-de05355d`);
    assert.equal(Number(row.fobAmount), amount); assert.equal(row.moqQuantity, quantity);
  }
  assert.ok(selectedSupplier);
  assert.equal(product('Producto con proveedor ambiguo EVAL-2026-10-07-14906c93').supplierId, selectedSupplier);
  const idempotency = JSON.parse(await readFile('replay-output/EVAL-2026-10-07-c7ea6a77/idempotency.json', 'utf8'));
  const pendingProposals = await db.whatsAppAgentOperation.count({ where: { burst: { instance: { in: runIds.map(run => `production-eval-${run}`) } }, status: 'PROPOSED' } });
  const summary = {
    tripId, sourceCommit: 'c30d278401c9935fc98ae8afb753c2b6609175c1',
    cases: scenarios.length + 1, passed: scenarios.filter(s => s.status === 'PASS').length + 1, failed: scenarios.filter(s => s.status === 'FAIL').length,
    skipped: ['17-approve-proposal: blocked by failed scenario 16; positive approval tested in separate run'], idempotency,
    confirmedProducts: products.length, agentProducts: 15, webApiProducts: 12,
    imagesOnProducts: products.reduce((count, p) => count + p.images.length, 0), pendingProposals, scenarios, products,
  };
  await writeFile('replay-output/production-eval-20261007-summary.json', JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...summary, scenarios: undefined, products: undefined }));
} finally { await db.$disconnect(); }
