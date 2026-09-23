import type { Run } from "@atlas/contracts";

type Line = Run["lines"][number];
const rank: Record<Line["urgency"], number> = { high: 0, normal: 1, none: 2 };

export function orderRunLines(lines: readonly Line[], highFirst: boolean): Line[] {
  if (!highFirst) return [...lines];
  return lines.map((line, index) => ({ line, index }))
    .sort((a, b) => rank[a.line.urgency] - rank[b.line.urgency] || a.index - b.index)
    .map(({ line }) => line);
}
