// Compatibilidad de imports de la Iteración 1. El núcleo real vive en lib/bot.
export { calculateMissingFields, normalizeLeadTimeToDays, normalizeTier1Data } from "./bot/tier1.ts";
export type { CaptureStatus, Fob, LeadTime, Moq, SupplierType, Tier1Data, Tier1Field } from "./bot/types.ts";
