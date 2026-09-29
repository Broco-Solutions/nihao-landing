import type { BatchEvidence } from "../../lib/channels/whatsapp/batch-association.ts";

export const providers = ["Alfa Tools", "Boreal Textiles", "Costa Parts", "Delta Lighting", "Estrella Packaging"] as const;

export const burstEvidence: BatchEvidence[] = [
  { id: "img-alfa-card", type: "IMAGE", text: null, ocrText: "ALFA TOOLS\ncontacto@alfatools.example\n+54 11 5555 1001" },
  { id: "img-boreal-product", type: "IMAGE", text: null, ocrText: "BOREAL TEXTILES\nTejidos" },
  { id: "img-costa-card", type: "IMAGE", text: null, ocrText: "COSTA PARTS\nventas@costaparts.example" },
  { id: "img-delta-product", type: "IMAGE", text: null, ocrText: "DELTA LIGHTING\nLuminarias" },
  { id: "img-estrella-card", type: "IMAGE", text: null, ocrText: "ESTRELLA PACKAGING\nventas@estrella.example" },
  { id: "img-costa-product", type: "IMAGE", text: null, ocrText: "COSTA PARTS\nRepuestos" },
  { id: "img-alfa-product", type: "IMAGE", text: null, ocrText: "ALFA TOOLS\nHerramientas" },
  { id: "img-estrella-product", type: "IMAGE", text: null, ocrText: "ESTRELLA PACKAGING\nEnvases" },
  { id: "img-boreal-card", type: "IMAGE", text: null, ocrText: "BOREAL TEXTILES\nventas@boreal.example" },
  { id: "img-delta-card", type: "IMAGE", text: null, ocrText: "DELTA LIGHTING\nventas@delta.example" },
  { id: "comment-delta", type: "TEXT", text: "Delta Lighting: FOB USD 12 por lámpara, MOQ 100.", ocrText: null },
  { id: "comment-alfa", type: "TEXT", text: "Alfa Tools: interés 4/5, entrega en 30 días.", ocrText: null },
  { id: "comment-estrella", type: "TEXT", text: "Estrella Packaging: envases reciclables, MOQ 500.", ocrText: null },
  { id: "comment-costa", type: "TEXT", text: "Costa Parts: repuestos de maquinaria, FOB USD 8.", ocrText: null },
  { id: "comment-boreal", type: "TEXT", text: "Boreal Textiles: telas de algodón, entrega en 20 días.", ocrText: null },
];

export const goldGroups = [
  { name: providers[0], messageIds: ["img-alfa-card", "img-alfa-product", "comment-alfa"] },
  { name: providers[1], messageIds: ["img-boreal-card", "img-boreal-product", "comment-boreal"] },
  { name: providers[2], messageIds: ["img-costa-card", "img-costa-product", "comment-costa"] },
  { name: providers[3], messageIds: ["img-delta-card", "img-delta-product", "comment-delta"] },
  { name: providers[4], messageIds: ["img-estrella-card", "img-estrella-product", "comment-estrella"] },
];

export const goldImageKinds: Record<string, "BUSINESS_CARD" | "PRODUCT_IMAGE"> = Object.fromEntries(
  burstEvidence.filter((item) => item.type === "IMAGE").map((item) => [item.id, item.id.endsWith("card") ? "BUSINESS_CARD" : "PRODUCT_IMAGE"]),
);

export const goldProposal = { groups: goldGroups, suggestions: [], imageKinds: goldImageKinds };
