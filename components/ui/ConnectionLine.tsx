import { cn } from "@/lib/utils";

type ConnectionLineProps = {
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function ConnectionLine({
  orientation = "horizontal",
  className,
}: ConnectionLineProps) {
  if (orientation === "vertical") {
    return (
      <div className={cn("relative h-full min-h-[60px] w-px", className)}>
        <div className="absolute inset-0 border-l border-dashed border-line" />
        <span className="absolute -left-[3px] top-0 h-1.5 w-1.5 rounded-full bg-nihao/40" />
        <span className="absolute -bottom-0 -left-[3px] h-1.5 w-1.5 rounded-full bg-nihao/40" />
      </div>
    );
  }

  return (
    <div className={cn("relative h-px w-full", className)}>
      <div className="absolute inset-0 border-t border-dashed border-line" />
      <span className="absolute -top-[3px] left-0 h-1.5 w-1.5 rounded-full bg-nihao/40" />
      <span className="absolute -top-[3px] right-0 h-1.5 w-1.5 rounded-full bg-nihao/40" />
    </div>
  );
}
