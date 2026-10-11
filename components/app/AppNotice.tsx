import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

export type AppNoticeTone = "success" | "error" | "warning" | "info";

export function AppNotice({ tone, title, children, className = "" }: { tone: AppNoticeTone; title?: string; children: React.ReactNode; className?: string }) {
  const styles = { success: "border-emerald-200 bg-emerald-50 text-emerald-900", error: "border-red-200 bg-red-50 text-red-900", warning: "border-amber-200 bg-amber-50 text-amber-950", info: "border-sky-200 bg-sky-50 text-sky-950" }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : tone === "warning" ? TriangleAlert : Info;
  return <div role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"} aria-atomic="true" data-tone={tone} className={`flex gap-3 rounded-xl border p-3 text-sm ${styles} ${className}`}><Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1">{title ? <p className="font-semibold">{title}</p> : null}<div className={`${title ? "mt-1 " : ""}break-words`}>{children}</div></div></div>;
}
