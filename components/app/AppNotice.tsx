import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

export function AppNotice({ tone, title, children }: { tone: "success" | "error" | "warning" | "info"; title?: string; children: React.ReactNode }) {
  const styles = { success: "border-emerald-200 bg-emerald-50 text-emerald-900", error: "border-red-200 bg-red-50 text-red-900", warning: "border-amber-200 bg-amber-50 text-amber-950", info: "border-sky-200 bg-sky-50 text-sky-950" }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : tone === "warning" ? TriangleAlert : Info;
  return <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl border p-3 text-sm ${styles}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div>{title ? <p className="font-semibold">{title}</p> : null}<div className={title ? "mt-1" : ""}>{children}</div></div></div>;
}
