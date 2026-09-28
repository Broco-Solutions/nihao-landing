import type { EvalFixture } from "../core/types.ts";

export type TranscriptCase = EvalFixture & { transcript: string };
export const TRANSCRIPT_CASES: TranscriptCase[] = [
  { caseId: "A01-spanish-clear", transcript: "La empresa es Luz del Sur, fabrica lámparas LED. FOB 18 dólares por unidad, MOQ 200 unidades y entrega en 30 días.",
    expected: { companyName: "Luz del Sur", category: "Lámparas LED", supplierType: "FACTORY", fob: { amount: 18, currency: "USD", unit: "unidad" }, moq: { quantity: 200, unit: "unidades" }, leadTime: { days: 30 } }, mustRemainMissing: ["city", "province", "interestScore"] },
  { caseId: "A02-english-clear", transcript: "Supplier Harbor Components. Contact Sam Lee. Factory. FOB USD 12 per unit, MOQ 500 units, lead time 21 days.",
    expected: { companyName: "Harbor Components", contactName: "Sam Lee", supplierType: "FACTORY", fob: { amount: 12, currency: "USD", unit: "unit" }, moq: { quantity: 500, unit: "units" }, leadTime: { days: 21 } }, mustRemainMissing: ["city", "province", "interestScore"] },
  { caseId: "A03-disfluencies", transcript: "Eh, la empresa, sí, se llama Brisa Tech. Hablé con Lucía. Son, este, fabricantes de sensores. MOQ, digamos, doscientas unidades.",
    expected: { companyName: "Brisa Tech", contactName: "Lucía", category: "Sensores", supplierType: "FACTORY", moq: { quantity: 200, unit: "unidades" } }, mustRemainMissing: ["city", "province", "fob", "leadTime", "interestScore"] },
  { caseId: "A04-mixed", transcript: "Proveedor Ocean Wheels, contact Maria Chen. They make bicicletas eléctricas. FOB USD 320 per unit; MOQ 80 unidades.",
    expected: { companyName: "Ocean Wheels", contactName: "Maria Chen", category: "Bicicletas eléctricas", fob: { amount: 320, currency: "USD", unit: "unit" }, moq: { quantity: 80, unit: "unidades" } }, mustRemainMissing: ["city", "province", "leadTime", "interestScore"] },
  { caseId: "A05-incomplete", transcript: "Vimos un proveedor de accesorios para cocina, pero todavía no tengo nombre ni precios.",
    expected: { category: "Accesorios para cocina" }, mustRemainMissing: ["companyName", "contact", "city", "province", "fob", "moq", "leadTime", "interestScore"] },
  { caseId: "A06-verbal-correction", transcript: "El MOQ era cien... perdón, quinientas unidades.",
    expected: {}, mustRemainMissing: ["companyName", "fob", "leadTime", "interestScore"], observational: true },
];
