import type { Tier1Data } from "../../lib/bot/types.ts";
import type { EvalFixture } from "../core/types.ts";

type Fields = Partial<Tier1Data>;
export type MergeCase = EvalFixture & { evidence: Fields[] };
const moq = (quantity: number) => ({ quantity, unit: "unidades", notes: null, rawText: `${quantity} unidades` });
const fob = (amount: number) => ({ amount, currency: "USD", unit: "unidad", rawText: `USD ${amount} por unidad` });
export const MERGE_CASES: MergeCase[] = [
  { caseId: "M01-complementary", evidence: [{ companyName: "Luz Nova", contact: "Ana Ruiz" }, { fob: fob(20), moq: moq(100) }],
    expected: { companyName: "Luz Nova", contactName: "Ana Ruiz", fob: fob(20), moq: moq(100) }, mustRemainMissing: [], reviewExpected: [] },
  { caseId: "M02-same-value", evidence: [{ moq: moq(100) }, { moq: moq(100) }], expected: { moq: moq(100) }, mustRemainMissing: [], reviewExpected: [] },
  { caseId: "M03-conflict", evidence: [{ moq: moq(100) }, { moq: moq(500) }], expected: {}, mustRemainMissing: ["moq"], reviewExpected: ["moq"] },
  { caseId: "M04-missing-value", evidence: [{ moq: null }, { moq: moq(300) }], expected: { moq: moq(300) }, mustRemainMissing: [], reviewExpected: [] },
  { caseId: "M05-fob-conflict", evidence: [{ fob: fob(20) }, { fob: fob(24) }], expected: {}, mustRemainMissing: ["fob"], reviewExpected: ["fob"] },
];
