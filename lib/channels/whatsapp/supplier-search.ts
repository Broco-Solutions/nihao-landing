import { supplierSearchMatches } from "./supplier-identity.ts";

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
type SupplierSearchRecord = Parameters<typeof supplierSearchMatches>[0] & { id: string; companyNameLatin?: string | null };
export type SupplierSearchMatch = { type: "LITERAL" | "FUZZY"; score: number };

// Optimal string alignment distance includes adjacent transpositions (Tools → Tolos).
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
  }
  return rows[a.length][b.length];
}

function fuzzyScore(name: string, query: string): number {
  const words = normalize(name).split(" ");
  const count = query.split(" ").length;
  let best = 0;
  // Compare complete word windows so legal suffixes do not penalize a trade name.
  for (let start = 0; start + count <= words.length; start++) {
    const candidate = words.slice(start, start + count).join(" ");
    if (Math.abs(candidate.length - query.length) > 3) continue;
    const edits = distance(query, candidate);
    const score = 1 - edits / Math.max(query.length, candidate.length);
    if (edits <= 3 && score >= 0.8) best = Math.max(best, score);
  }
  return best;
}

export function rankSupplierSearch<T extends SupplierSearchRecord>(records: T[], query: string): Array<{ record: T; match: SupplierSearchMatch }> {
  const normalizedQuery = normalize(query);
  const names = (record: T) => [record.companyName, record.companyNameLatin].filter((name): name is string => Boolean(name));
  const literal = records.filter(record => supplierSearchMatches(record, query, !query.trim() || Boolean(normalizedQuery && names(record).some(name => ` ${normalize(name)} `.includes(` ${normalizedQuery} `)))));
  if (literal.length) return literal.map(record => ({ record, match: { type: "LITERAL", score: 1 } }));
  // Contact identifiers remain exact; short queries are too ambiguous for fuzzy matching.
  if (normalizedQuery.length < 4 || normalizedQuery.length > 120 || !/\p{L}/u.test(normalizedQuery) || /[@.:/\d]/u.test(query)) return [];
  return records.map(record => ({ record, match: { type: "FUZZY" as const, score: Math.max(0, ...names(record).map(name => fuzzyScore(name, normalizedQuery))) } }))
    .filter(result => result.match.score > 0)
    .sort((a, b) => b.match.score - a.match.score || a.record.id.localeCompare(b.record.id));
}
