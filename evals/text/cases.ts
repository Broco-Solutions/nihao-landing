import type { EvalFixture } from "../core/types.ts";

export type TextCase = EvalFixture & { text: string };
export const TEXT_CASES: TextCase[] = [
  { caseId: "T01-complete-spanish", text: "Proveedor Guangzhou Yunda, fábrica de monopatines eléctricos. FOB USD 420 por unidad, MOQ 100 unidades, tiempo de entrega 25 días. Interés 4 de 5.",
    expected: { companyName: "Guangzhou Yunda", supplierType: "FACTORY", category: "Monopatines eléctricos", fob: { amount: 420, currency: "USD", unit: "unidad" }, moq: { quantity: 100, unit: "unidades" }, leadTime: { days: 25 }, interestScore: 4 }, mustRemainMissing: ["contact", "city", "province"] },
  { caseId: "T02-incomplete", text: "Conocimos a Shenzhen Delta Tools. Hablamos con Li Ming. Fabrican herramientas.",
    expected: { companyName: "Shenzhen Delta Tools", contactName: "Li Ming", category: "Herramientas" }, mustRemainMissing: ["fob", "moq", "leadTime", "interestScore", "province"] },
  { caseId: "T03-complete-english", text: "Supplier Shenzhen Fast Wheels. Contact Jane Li. Factory in Shenzhen. Electric scooters. FOB USD 85 per unit. MOQ 300 units. Lead time 20 days. Interest 4 out of 5.",
    expected: { companyName: "Shenzhen Fast Wheels", contactName: "Jane Li", city: "Shenzhen", supplierType: "FACTORY", category: "Electric scooters", fob: { amount: 85, currency: "USD", unit: "unit" }, moq: { quantity: 300, unit: "units" }, leadTime: { days: 20 }, interestScore: 4 }, mustRemainMissing: ["province"] },
  { caseId: "T04-mixed-language", text: "公司名称 Guangzhou Ming Light，联系人 Chen Wei。City: Guangzhou. Product: LED lighting. No price or minimum order was discussed.",
    expected: { companyName: "Guangzhou Ming Light", contactName: "Chen Wei", city: "Guangzhou", category: "LED lighting" }, mustRemainMissing: ["province", "fob", "moq", "leadTime", "interestScore"] },
  { caseId: "T05-no-location-inference", text: "Empresa Northstar Parts. Contacto Ana Pérez, correo ana@northstar.example y teléfono +54 9 341 555 1234. No compartieron ubicación.",
    expected: { companyName: "Northstar Parts", contactName: "Ana Pérez", email: "ana@northstar.example", phone: "+54 9 341 555 1234" }, mustRemainMissing: ["city", "province", "fob", "moq", "leadTime", "interestScore"] },
  { caseId: "T06-numeric-disambiguation", text: "Empresa Pacific Tools. Teléfono +86 138 0012 3456. FOB USD 26 por unidad; MOQ 480 unidades; lead time 35 días.",
    expected: { companyName: "Pacific Tools", phone: "+86 138 0012 3456", fob: { amount: 26, currency: "USD", unit: "unidad" }, moq: { quantity: 480, unit: "unidades" }, leadTime: { days: 35 } }, mustRemainMissing: ["city", "province", "interestScore"] },
  { caseId: "T07-very-incomplete", text: "Proveedor de iluminación. Interesante.",
    expected: { category: "Iluminación" }, mustRemainMissing: ["companyName", "city", "province", "contact", "fob", "moq", "leadTime", "interestScore"] },
  { caseId: "T08-explicit-unknown", text: "Nos mostraron productos, pero todavía no sabemos MOQ ni precio.",
    expected: {}, mustRemainMissing: ["companyName", "fob", "moq", "leadTime", "interestScore"] },
];
