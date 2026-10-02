import type { BurstGroup, BurstCatalog, BurstSupplier } from "./burst-types.ts";

export const normalizeSupplierName = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const contains = (text: string, value: string) => Boolean(value && ` ${normalizeSupplierName(text)} `.includes(` ${normalizeSupplierName(value)} `));

/** Authorized identities and explicit references, never a model-selected arbitrary supplier ID. */
export function resolveProductAssociation(group: BurstGroup, prior: BurstGroup | undefined, trip: BurstCatalog["trips"][number] | undefined, text: string, answer: string | undefined): Pick<BurstGroup, "supplierId" | "supplierQuery" | "supplierOptions" | "companyId" | "productName"> {
  const suppliers = trip?.suppliers ?? [];
  let query = typeof group.supplierQuery === "string" && contains(text, group.supplierQuery) ? group.supplierQuery.trim() : prior?.supplierQuery ?? (group.name && contains(text, group.name) ? group.name : null);
  if (query && normalizeSupplierName(query).length < 3) query = null;
  let matches: BurstSupplier[] = query ? suppliers.filter((s) => !group.companyId || s.companyId === group.companyId).filter((s) => contains(s.name, query!) || contains(query!, s.name)) : [];
  // Exact names precede partial aliases, so Alfa Tools does not silently become Alfa Tools Medical.
  const exact = matches.filter((s) => normalizeSupplierName(s.name) === normalizeSupplierName(query!));
  if (exact.length) matches = exact;
  const cityMatches = matches.filter((s) => s.city && contains(text, s.city));
  if (matches.length > 1 && cityMatches.length === 1) matches = cityMatches;
  const choice = answer && /^\d+$/u.test(answer) ? prior?.supplierOptions?.[Number(answer) - 1] : undefined;
  const selected = prior?.supplierId ? suppliers.find((s) => s.id === prior.supplierId && (!group.companyId || group.companyId === s.companyId)) : choice ? matches.find((s) => s.id === choice) : matches.length === 1 ? matches[0] : undefined;
  if (group.supplierId && !suppliers.some((s) => s.id === group.supplierId)) throw new Error("Proveedor no autorizado");
  // Multiple candidates require an explicit persisted selection or a distinguishing city/company.
  if (group.supplierId && selected && group.supplierId !== selected.id) throw new Error("El proveedor propuesto no coincide con la evidencia");
  const productName = typeof group.productName === "string" && contains(text, group.productName) ? group.productName.trim().slice(0, 120) : prior?.productName ?? null;
  return { supplierQuery: query, supplierId: selected?.id ?? null, supplierOptions: selected ? [] : matches.map((s) => s.id), companyId: selected?.companyId ?? group.companyId, productName };
}
