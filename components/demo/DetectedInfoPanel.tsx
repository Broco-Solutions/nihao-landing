"use client";

import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import type { Conversation } from "./demo-data";

type DetectedInfoPanelProps = {
  conversation: Conversation;
  className?: string;
};

export function DetectedInfoPanel({ conversation, className }: DetectedInfoPanelProps) {
  const { detected } = conversation;

  const rows = [
    { label: "Proveedor", value: detected.supplier },
    { label: "Producto", value: detected.product },
    { label: "Ciudad", value: detected.city },
    { label: "Categoría", value: detected.category },
    { label: "Estado", value: detected.status },
    { label: "Próxima acción", value: detected.nextAction },
  ].filter((r) => r.value);

  return (
    <div className={cn("flex h-full flex-col border-l border-line bg-paper", className)}>
      <div className="border-b border-line px-5 py-4">
        <h3 className="font-display text-[15px] font-medium tracking-tight text-ink">
          Información detectada
        </h3>
        <p className="mt-1 text-[12px] text-ink-mute">Por el Asistente Nihao</p>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {detected.interest && (
          <div className="mb-5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              Nivel de interés
            </span>
            <div className="mt-2">
              <StatusBadge type="interest" value={detected.interest}>
                {detected.interest}
              </StatusBadge>
            </div>
          </div>
        )}
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.label}>
              <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                {row.label}
              </span>
              <p className="mt-1 text-[13px] font-medium text-ink">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
