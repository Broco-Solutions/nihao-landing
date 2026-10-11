import type { EvidenceGraph } from "./ingestion-types.ts";

export function updateGraphSummary(graph: EvidenceGraph) {
  for (const asset of graph.assets) {
    const loads = graph.loads.filter((load) => asset.loadIds.includes(load.id));
    if (loads.some((load) => load.status === "PENDING_RETRY")) asset.status = "PENDING_RETRY";
    else if (loads.some((load) => load.status === "FAILED")) asset.status = "FAILED";
    else if (loads.some((load) => load.status === "NEEDS_REVIEW")) asset.status = "NEEDS_REVIEW";
    else if (loads.length && loads.every((load) => load.status === "PROCESSED")) asset.status = "PROCESSED";
    else if (loads.length) asset.status = "GROUPED";
    asset.resolution = loads.find((load) => load.resolution)?.resolution;
    asset.error = loads.find((load) => load.error)?.error;
  }
  const actionable = graph.loads.filter((load) => !load.resolution);
  graph.summary = {
    resolvedHistorical: graph.loads.filter((load) => load.resolution).length,
    totalAssets: graph.assets.length,
    totalLogicalLoads: graph.loads.length,
    processed: actionable.filter((load) => load.status === "PROCESSED").length,
    pending: actionable.filter((load) => !["PROCESSED", "NEEDS_REVIEW", "FAILED"].includes(load.status)).length,
    needsReview: actionable.filter((load) => load.status === "NEEDS_REVIEW").length,
    failed: actionable.filter((load) => load.status === "FAILED").length,
  };
}
