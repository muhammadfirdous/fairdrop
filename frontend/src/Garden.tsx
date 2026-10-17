import { useState } from "react";
import { Droplets, ChevronDown } from "lucide-react";
import type { Plot, Snapshot } from "./types";
import { litres } from "./api";
const beds = [
  { x: 50, y: 50, w: 147, h: 105 },
  { x: 214, y: 50, w: 120, h: 105 },
  { x: 351, y: 50, w: 157, h: 105 },
  { x: 84, y: 220, w: 120, h: 105 },
  { x: 222, y: 220, w: 139, h: 105 },
  { x: 379, y: 220, w: 158, h: 105 },
];
export function Garden({
  plots,
  snapshot,
  selected,
  onSelect,
  opening,
}: {
  plots: Plot[];
  snapshot: Snapshot | null;
  selected: string;
  onSelect: (id: string) => void;
  opening: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const body = (
    <>
      <div className="schematic-header">
        <div>
          <span className="eyebrow">The growing space</span>
          <h2>Garden schematic</h2>
        </div>
        <span className="map-label">Not to scale</span>
      </div>
      <svg
        className="garden-svg"
        viewBox="0 0 590 410"
        role="group"
        aria-label="Interactive garden schematic. Select a plot to see its allocation."
      >
        <defs>
          <pattern
            id="unmet"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(40)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="7"
              stroke="#c8cec2"
              strokeWidth="1.5"
            />
          </pattern>
          <pattern
            id="rows"
            width="13"
            height="13"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 0 13" stroke="#9ab7c5" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect x="20" y="22" width="549" height="332" rx="4" fill="#eceee5" />
        <path
          d="M20 188 H569 M36 188 V354"
          fill="none"
          stroke="#fffdf8"
          strokeWidth="22"
        />
        <path
          d="M21 188 H570"
          stroke="#c8cec2"
          strokeDasharray="3 6"
          strokeWidth="1"
        />
        <text x="474" y="192" fill="#5b655d" fontSize="9" letterSpacing="2">
          GARDEN PATH
        </text>
        {plots
          .filter((p) => p.active)
          .map((p) => {
            const b = beds[p.position] || beds[0],
              r = snapshot?.rows.find((r) => r.plot_id === p.id);
            const ratio =
              r?.approved_ml && r.allocated_ml != null
                ? r.allocated_ml / r.approved_ml
                : 0;
            const isSelected = p.id === selected;
            return (
              <g
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`${p.name}, ${r ? `${litres(r.allocated_ml)} of ${litres(r.approved_ml)} litres allocated` : "awaiting allocation"}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(p.id);
                  }
                }}
                className="garden-bed"
              >
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx="3"
                  fill="#fffdf8"
                  stroke={isSelected ? "#276c91" : "#aeb9ac"}
                  strokeWidth={isSelected ? 2.5 : 1}
                />
                <rect
                  x={b.x + 6}
                  y={b.y + 6}
                  width={b.w - 12}
                  height={b.h - 12}
                  fill="url(#unmet)"
                  rx="2"
                />
                <rect
                  x={b.x + 6}
                  y={b.y + 6 + (b.h - 12) * (1 - ratio)}
                  width={b.w - 12}
                  height={(b.h - 12) * ratio}
                  fill={isSelected ? "#c4dfeb" : "#dfedf2"}
                />
                <rect
                  x={b.x + 6}
                  y={b.y + 6 + (b.h - 12) * (1 - ratio)}
                  width={b.w - 12}
                  height={(b.h - 12) * ratio}
                  fill="url(#rows)"
                />
                <rect
                  x={b.x + 12}
                  y={b.y + 22}
                  width={b.w - 24}
                  height="55"
                  rx="2"
                  fill="#fffdf8"
                  fillOpacity="0.94"
                />
                <text
                  x={b.x + b.w / 2}
                  y={b.y + 44}
                  textAnchor="middle"
                  fill="#20392f"
                  fontFamily="Georgia"
                  fontSize="19"
                >
                  Plot {p.id}
                </text>
                <text
                  x={b.x + b.w / 2}
                  y={b.y + 63}
                  textAnchor="middle"
                  fill="#365c6d"
                  fontSize="10.5"
                >
                  {r
                    ? `${litres(r.allocated_ml)} of ${litres(r.approved_ml)} L`
                    : "Awaiting allocation"}
                </text>
              </g>
            );
          })}
        <path
          d="M36 355 V380 H77"
          stroke="#8a9689"
          fill="none"
          strokeWidth="1.5"
        />
        <text x="20" y="398" fill="#5b655d" fontSize="10" letterSpacing="1">
          ENTRANCE
        </text>
        <rect
          x="80"
          y="363"
          width="204"
          height="36"
          rx="3"
          fill="#fffdf8"
          stroke="#b8cbd4"
        />
        <path
          d="M97 369 C97 369 91 377 91 381 A6 6 0 0 0 103 381 C103 377 97 369Z"
          fill="none"
          stroke="#276c91"
          strokeWidth="1.5"
        />
        <text x="112" y="378" fill="#20392f" fontSize="10.5">
          SHARED WATER SOURCE
        </text>
        <text x="112" y="391" fill="#5b655d" fontSize="10">
          {litres(opening)} L opening budget · manual
        </text>
      </svg>
      <div className="map-legend">
        <span>
          <i className="swatch water-fill" />
          Allocated water
        </span>
        <span>
          <i className="swatch hatch" />
          Unmet approved demand
        </span>
        <span className="map-tip">Select a plot for details</span>
      </div>
    </>
  );
  return (
    <section className={`garden-panel ${expanded ? "expanded" : ""}`}>
      <button
        className="mobile-map-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <Droplets size={18} />
        Garden schematic
        <ChevronDown size={18} />
      </button>
      <div className="garden-content">{body}</div>
    </section>
  );
}
