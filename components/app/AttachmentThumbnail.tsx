"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import type { SupplierAttachmentView } from "@/lib/bot/types";
import { appApi } from "./api";

export function AttachmentThumbnail({ tripId, captureId }: { tripId: string; captureId: string }) {
  const [attachment, setAttachment] = useState<SupplierAttachmentView | null>(null);
  useEffect(() => {
    let active = true;
    appApi<{ attachments: SupplierAttachmentView[] }>(`/api/bot/captures/${captureId}/attachments?tripId=${encodeURIComponent(tripId)}`)
      .then(({ attachments }) => {
        if (active) setAttachment(attachments.find((item) => item.type === "BUSINESS_CARD") ?? attachments[0] ?? null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [captureId, tripId]);

  if (!attachment) return <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-paper-warm text-ink-faint"><ImageIcon className="h-5 w-5" /></span>;
  return <span role="img" aria-label="Adjunto del proveedor" className="h-16 w-16 shrink-0 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(attachment.url).slice(1, -1)})` }} />;
}
