import { createHash } from "node:crypto";
import { EvolutionRequestError, type EvolutionClient, type EvolutionSendListInput } from "../evolution/client.ts";
import type { AgentState } from "./agent-contract.ts";

export type ReplyContext = { burstId: string; revision: number; state: AgentState; delivery?: { messageId?: string } };
export const supplierRowId = (burstId: string, revision: number, index: number) => `nihao_supplier_${createHash("sha256").update(`${burstId}:${revision}`).digest("hex").slice(0, 20)}_${index + 1}`;
export function selectedSupplierNumber(selectionId: string, context: ReplyContext): string | null {
  const pending = context.state.agent?.pending;
  if (pending?.type !== "CLARIFICATION" || !pending.supplierPicker || !pending.products?.length) return null;
  const index = pending.options.slice(0, 10).findIndex((_o, i) => supplierRowId(context.burstId, context.revision, i) === selectionId);
  return index >= 0 ? String(index + 1) : null;
}
export function supplierList(number: string, text: string, context?: ReplyContext): EvolutionSendListInput | null {
  const pending = context?.state.agent?.pending;
  if (!context || pending?.type !== "CLARIFICATION" || !pending.supplierPicker || !pending.products?.length || !pending.options.length) return null;
  const description = text.replace(context.state.question ?? pending.text ?? "", pending.text ?? "Elegí el proveedor del producto.");
  if (description.length > 900) return null;
  return { number, title: "Proveedor del producto", description: `${description}\n\nTambién podés escribir el nombre del proveedor.`, buttonText: "Elegir proveedor", footerText: pending.options.length > 10 ? "Mostramos 10 opciones. Para otro proveedor, escribí su nombre." : "Nihao · Proveedores", sections: [{ title: "Proveedores disponibles", rows: pending.options.slice(0, 10).map((o, i) => ({ title: o.label.split(" · ")[0].slice(0, 24), description: o.label.slice(0, 72), rowId: supplierRowId(context.burstId, context.revision, i) })) }] };
}
export async function sendSupplierReply(client: Pick<EvolutionClient, "sendText" | "sendList">, phone: string, text: string, context?: ReplyContext) {
  const onSentMessageId = (id: string) => { if (context?.delivery) context.delivery.messageId = id; };
  const list = supplierList(phone, text, context);
  if (list && client.sendList) {
    try { await client.sendList({ ...list, onSentMessageId }); return; }
    catch (error) { if (!(error instanceof EvolutionRequestError) || ![400, 404, 405, 501].includes(error.status)) throw error; }
  }
  await client.sendText({ number: phone, text, onSentMessageId });
}
