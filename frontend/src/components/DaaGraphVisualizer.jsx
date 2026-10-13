import React, { useState, useEffect, useRef } from "react";
import { getDijkstraTrace, getKruskalTrace } from "../api";
import Icon from "./Icon";

const PSEUDOCODE = {
  dijkstra: [
    { line: 1, text: "def Dijkstra(G, s, t):", desc: "Initialize single-source shortest path" },
    { line: 2, text: "  dist[v] = inf for all v in V; dist[s] = 0", desc: "Start vertex has distance 0, others inf" },
    { line: 3, text: "  PQ.insert((0, s))", desc: "Insert start into min-priority queue" },
    { line: 4, text: "  while PQ is not empty:", desc: "Extract minimum tentative distance vertex" },
    { line: 5, text: "    u = PQ.extract_min()", desc: "Finalize shortest path to u" },
    { line: 6, text: "    if u == t: return reconstruct_path(s, t)", desc: "Target reached optimally" },
    { line: 7, text: "    for each neighbor (u, v) with weight w:", desc: "Examine incident edges from u" },
    { line: 8, text: "      if dist[u] + w < dist[v]:", desc: "Edge relaxation test" },
    { line: 9, text: "        dist[v] = dist[u] + w; prev[v] = u", desc: "Update tentative distance and predecessor" },
    { line: 10, text: "        PQ.decrease_key_or_push((dist[v], v))", desc: "Push relaxed distance into priority queue" },
  ],
  kruskal: [
    { line: 1, text: "def Kruskal(G):", desc: "Initialize Minimum Spanning Tree" },
    { line: 2, text: "  A = empty set", desc: "A holds the growing MST forest" },
    { line: 3, text: "  for each v in V: Make-Set(v)", desc: "Initialize Disjoint Set Union (DSU) partitions" },
    { line: 4, text: "  sort edges E in non-decreasing order by weight", desc: "Greedy ordering O(E log E)" },
    { line: 5, text: "  for each edge (u, v) in sorted E:", desc: "Inspect edge with minimum available weight" },
    { line: 6, text: "    if Find-Set(u) != Find-Set(v):", desc: "Cycle detection via representative roots" },
    { line: 7, text: "      A = A union {(u, v)}", desc: "Accept edge into MST" },
    { line: 8, text: "      Union(u, v)", desc: "Merge disjoint components" },
    { line: 9, text: "  return A", desc: "Spanning tree complete" },
  ],
};

const SAMPLE_BENCHMARK_GRAPHS = {
  bengaluru: {
    name: "Bengaluru Safety Corridor (Demo)",
    nodes: ["MG_Road", "Cubbon", "Brigade", "Residency", "Indiranagar", "Koramangala"],
    positions: {
      MG_Road: { x: 70, y: 190 },
      Cubbon: { x: 210, y: 80 },
      Brigade: { x: 210, y: 300 },
      Residency: { x: 370, y: 260 },
      Indiranagar: { x: 390, y: 80 },
      Koramangala: { x: 530, y: 190 },
    },
    edges: [
      { source: "MG_Road", target: "Cubbon", distance: 2.5, cost: 2.5, time: 6, risk: 2 },
      { source: "MG_Road", target: "Brigade", distance: 1.8, cost: 1.8, time: 4, risk: 1 },
      { source: "Cubbon", target: "Indiranagar", distance: 4.2, cost: 4.2, time: 10, risk: 3 },
      { source: "Brigade", target: "Residency", distance: 1.4, cost: 1.4, time: 3, risk: 1 },
      { source: "Cubbon", target: "Residency", distance: 3.1, cost: 3.1, time: 7, risk: 2 },
      { source: "Residency", target: "Koramangala", distance: 3.8, cost: 3.8, time: 9, risk: 2 },
      { source: "Indiranagar", target: "Koramangala", distance: 2.9, cost: 2.9, time: 7, risk: 2 },
    ],
    start: "MG_Road",
    target: "Koramangala",
  },
  mesh: {
    name: "Multi-Route Mesh Topology",
    nodes: ["V1", "V2", "V3", "V4", "V5", "V6"],
    positions: {
      V1: { x: 80, y: 100 },
      V2: { x: 290, y: 80 },
      V3: { x: 500, y: 100 },
      V4: { x: 100, y: 290 },
      V5: { x: 300, y: 310 },
      V6: { x: 510, y: 280 },
    },
    edges: [
      { source: "V1", target: "V2", distance: 4.0, cost: 4.0, time: 8, risk: 2 },
      { source: "V1", target: "V4", distance: 2.0, cost: 2.0, time: 5, risk: 1 },
      { source: "V2", target: "V3", distance: 3.0, cost: 3.0, time: 6, risk: 2 },
      { source: "V2", target: "V5", distance: 1.0, cost: 1.0, time: 2, risk: 1 },
      { source: "V3", target: "V6", distance: 2.0, cost: 2.0, time: 4, risk: 1 },
      { source: "V4", target: "V5", distance: 3.0, cost: 3.0, time: 7, risk: 2 },
      { source: "V5", target: "V6", distance: 5.0, cost: 5.0, time: 11, risk: 3 },
      { source: "V2", target: "V4", distance: 6.0, cost: 6.0, time: 13, risk: 4 },
    ],
    start: "V1",
    target: "V6",
  },
};

export default function DaaGraphVisualizer({ customGraph = null, initialAlgorithm = "dijkstra" }) {
  const [selectedGraphKey, setSelectedGraphKey] = useState("bengaluru");
  const [algorithm, setAlgorithm] = useState(initialAlgorithm);
  const [criterion, setCriterion] = useState("distance");
  const [traceData, setTraceData] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1200); // ms per step
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const playTimerRef = useRef(null);

  // Active graph selection: prefer customGraph if passed (e.g. from RoutePage), else sample graph
  const activeGraph = customGraph || SAMPLE_BENCHMARK_GRAPHS[selectedGraphKey];

  // Auto-generate clean positions in an elliptical ring if positions are not provided
  const nodePositions = React.useMemo(() => {
    if (activeGraph.positions) return activeGraph.positions;
    const nodes = activeGraph.nodes || [];
    const positions = {};
    const count = nodes.length;
    const cx = 300;
    const cy = 190;
    const rx = 220;
    const ry = 120;
    nodes.forEach((n, idx) => {
      const angle = (idx / count) * 2 * Math.PI - Math.PI / 2;
      positions[n] = {
        x: Math.round(cx + rx * Math.cos(angle)),
        y: Math.round(cy + ry * Math.sin(angle)),
      };
    });
    return positions;
  }, [activeGraph]);

  // Load trace from backend
  const loadTrace = async () => {
    setLoading(true);
    setError("");
    setIsPlaying(false);
    setCurrentStepIndex(0);

    try {
      if (algorithm === "dijkstra") {
        const start = activeGraph.start || activeGraph.nodes[0];
        const target = activeGraph.target || activeGraph.nodes[activeGraph.nodes.length - 1];
        const payload = {
          nodes: activeGraph.nodes,
          edges: activeGraph.edges,
          start,
          target,
          criterion,
          directed: false,
        };
        const data = await getDijkstraTrace(payload);
        setTraceData(data);
      } else {
        const payload = {
          nodes: activeGraph.nodes,
          edges: activeGraph.edges,
          criterion: criterion === "distance" ? "cost" : criterion,
        };
        const data = await getKruskalTrace(payload);
        setTraceData(data);
      }
    } catch (err) {
      console.error("Failed to load algorithm trace:", err);
      setError(err.message || "Failed to generate algorithm trace.");
      setTraceData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrace();
  }, [selectedGraphKey, algorithm, criterion, customGraph]);

  // Playback loop
  useEffect(() => {
    if (isPlaying && traceData?.events?.length) {
      playTimerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= traceData.events.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, traceData, playbackSpeed]);

  const currentEvent = traceData?.events?.[currentStepIndex] || null;
  const totalSteps = traceData?.events?.length || 0;

  // Active highlighted pseudocode line
  const activePseudoLine = React.useMemo(() => {
    if (!currentEvent) return null;
    const type = currentEvent.event_type;
    if (algorithm === "dijkstra") {
      if (type === "INITIALIZE") return 2;
      if (type === "POP_MIN") return 5;
      if (type === "EXAMINE_EDGE") return 7;
      if (type === "RELAX") return 9;
      if (type === "FINALIZE") return 5;
      if (type === "COMPLETE") return 6;
    } else if (algorithm === "kruskal") {
      if (type === "INITIALIZE") return 3;
      if (type === "ACCEPT_EDGE") return 7;
      if (type === "REJECT_CYCLE") return 6;
      if (type === "COMPLETE") return 9;
    }
    return null;
  }, [currentEvent, algorithm]);

  // Node styling logic based on current trace step
  const getNodeState = (nodeId) => {
    if (!currentEvent) return "default";
    if (algorithm === "dijkstra") {
      if (currentEvent.current_vertex === nodeId) return "current";
      if (currentEvent.finalized?.includes(nodeId)) return "finalized";
      if (currentEvent.priority_queue?.some(([_, n]) => n === nodeId)) return "in_queue";
      if (nodeId === activeGraph.start) return "start";
      if (nodeId === activeGraph.target) return "target";
    }
    return "default";
  };

  // Edge styling logic based on current trace step
  const getEdgeState = (edge) => {
    if (!currentEvent) return "default";
    const u = edge.source;
    const v = edge.target;

    if (algorithm === "dijkstra") {
      if (
        currentEvent.edge &&
        ((currentEvent.edge.source === u && currentEvent.edge.target === v) ||
          (currentEvent.edge.source === v && currentEvent.edge.target === u))
      ) {
        return currentEvent.event_type === "RELAX" ? "relaxed" : "examined";
      }
      if (currentEvent.event_type === "COMPLETE" && traceData?.final_path) {
        for (let i = 0; i < traceData.final_path.length - 1; i++) {
          const p1 = traceData.final_path[i];
          const p2 = traceData.final_path[i + 1];
          if ((p1 === u && p2 === v) || (p1 === v && p2 === u)) return "path";
        }
      }
    } else if (algorithm === "kruskal") {
      if (
        currentEvent.edge &&
        ((currentEvent.edge.source === u && currentEvent.edge.target === v) ||
          (currentEvent.edge.source === v && currentEvent.edge.target === u))
      ) {
        return currentEvent.event_type === "ACCEPT_EDGE" ? "accepted" : "rejected";
      }
      if (
        currentEvent.selected_edges?.some(
          (e) => (e.source === u && e.target === v) || (e.source === v && e.target === u)
        )
      ) {
        return "accepted";
      }
    }
    return "default";
  };

  return (
    <div className="border border-line rounded-xl bg-surface p-4 shadow-sm space-y-4">
      {/* Header & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center text-brand">
            <Icon name="route" size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">
              Algorithm Execution Studio
            </h3>
            <p className="text-xs text-ink-soft">
              Interactive trace visualizer on graph corridors and network topologies.
            </p>
          </div>
        </div>

        {/* Algorithm & Topology Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {!customGraph && (
            <select
              className="input text-xs py-1 h-8"
              value={selectedGraphKey}
              onChange={(e) => setSelectedGraphKey(e.target.value)}
            >
              <option value="bengaluru">Bengaluru Safety Corridor</option>
              <option value="mesh">Multi-Route Mesh Topology</option>
            </select>
          )}

          <div className="flex bg-surface-subtle p-0.5 rounded-lg border border-line text-xs font-semibold">
            <button
              type="button"
              className={`px-3 py-1 rounded-md transition-colors ${
                algorithm === "dijkstra" ? "bg-brand text-white shadow-xs" : "text-ink-soft hover:text-ink"
              }`}
              onClick={() => setAlgorithm("dijkstra")}
            >
              Dijkstra
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-md transition-colors ${
                algorithm === "kruskal" ? "bg-brand text-white shadow-xs" : "text-ink-soft hover:text-ink"
              }`}
              onClick={() => setAlgorithm("kruskal")}
            >
              Kruskal MST
            </button>
          </div>

          <select
            className="input text-xs py-1 h-8"
            value={criterion}
            onChange={(e) => setCriterion(e.target.value)}
          >
            <option value="distance">Distance Weight</option>
            <option value="cost">Planning Cost</option>
            <option value="time">Travel Time</option>
            <option value="risk">Hazard Score</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between p-3 bg-danger-soft text-danger text-xs rounded-lg border border-line">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-xs btn-secondary"
            onClick={loadTrace}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Studio Viewport: Split Graph Canvas + Stepper & Pseudocode */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Interactive Graph SVG (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-surface-subtle border border-line rounded-xl p-3 overflow-hidden">
          <div className="flex items-center justify-between text-xs text-ink-soft mb-2 px-1">
            <span className="font-semibold text-ink">
              {activeGraph.name || "Graph Network"} ({activeGraph.nodes.length} Vertices, {activeGraph.edges.length} Edges)
            </span>
            <span>
              Target: <strong className="text-brand">{activeGraph.target || activeGraph.nodes[activeGraph.nodes.length - 1]}</strong>
            </span>
          </div>

          {/* SVG Canvas */}
          <div className="relative w-full aspect-[4/3] bg-surface rounded-lg border border-line flex items-center justify-center overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-xs text-ink-soft">
                <span className="animate-spin w-5 h-5 border-2 border-brand border-t-transparent rounded-full" />
                <span>Computing execution trace...</span>
              </div>
            ) : (
              <svg viewBox="0 0 600 380" className="w-full h-full select-none">
                {/* Edges */}
                {activeGraph.edges.map((e, idx) => {
                  const p1 = nodePositions[e.source] || { x: 50, y: 50 };
                  const p2 = nodePositions[e.target] || { x: 150, y: 150 };
                  const state = getEdgeState(e);
                  const mx = (p1.x + p2.x) / 2;
                  const my = (p1.y + p2.y) / 2;

                  let strokeColor = "#c7d4cf"; // default line
                  let strokeWidth = 2;
                  let strokeDasharray = "none";

                  if (state === "examined") {
                    strokeColor = "#e4ae50"; // caution amber
                    strokeWidth = 3.5;
                  } else if (state === "relaxed") {
                    strokeColor = "#087f6d"; // brand teal
                    strokeWidth = 4;
                  } else if (state === "path") {
                    strokeColor = "#11875d"; // safe emerald
                    strokeWidth = 4.5;
                  } else if (state === "accepted") {
                    strokeColor = "#11875d"; // MST accepted
                    strokeWidth = 4;
                  } else if (state === "rejected") {
                    strokeColor = "#c9363e"; // danger red
                    strokeWidth = 2;
                    strokeDasharray = "4 4";
                  }

                  return (
                    <g key={`edge-${e.source}-${e.target}-${idx}`}>
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                      {/* Edge Weight Label */}
                      <rect
                        x={mx - 15}
                        y={my - 9}
                        width={30}
                        height={18}
                        rx={4}
                        fill="#ffffff"
                        stroke="#dce5e1"
                        strokeWidth={1}
                      />
                      <text
                        x={mx}
                        y={my + 3.5}
                        textAnchor="middle"
                        fontSize={9.5}
                        fontWeight="600"
                        fill="#53655f"
                        fontFamily="monospace"
                      >
                        {e[criterion] ?? e.cost ?? e.weight}
                      </text>
                    </g>
                  );
                })}

                {/* Nodes rendered on top of edges */}
                {activeGraph.nodes.map((nodeId) => {
                  const pos = nodePositions[nodeId] || { x: 50, y: 50 };
                  const state = getNodeState(nodeId);
                  const distVal = currentEvent?.distances?.[nodeId];
                  const distDisplay = distVal === null || distVal === undefined ? "inf" : distVal.toFixed(1);

                  let fillColor = "#ffffff";
                  let strokeColor = "#75847f";
                  let textColor = "#10201c";
                  let radius = 22;

                  if (state === "current") {
                    fillColor = "#dff4ee"; // brand soft
                    strokeColor = "#087f6d"; // brand teal
                    textColor = "#056555";
                    radius = 24;
                  } else if (state === "finalized") {
                    fillColor = "#e1f5ec"; // safe soft
                    strokeColor = "#11875d"; // safe emerald
                    textColor = "#0b5b3e";
                  } else if (state === "in_queue") {
                    fillColor = "#fff2d5"; // caution soft
                    strokeColor = "#a96708"; // caution
                    textColor = "#7d4a04";
                  } else if (nodeId === activeGraph.start) {
                    fillColor = "#dff4ee";
                    strokeColor = "#087f6d";
                  }

                  const cleanLabel = nodeId.replace(/_/g, " ");

                  return (
                    <g key={`node-${nodeId}`} className="transition-all duration-300">
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={radius}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={state === "current" ? 3.5 : 2}
                        className="transition-all duration-300 shadow-sm"
                      />
                      <text
                        x={pos.x}
                        y={pos.y + 4}
                        textAnchor="middle"
                        fontSize={cleanLabel.length > 8 ? 9 : 10.5}
                        fontWeight="700"
                        fill={textColor}
                      >
                        {cleanLabel.length > 10 ? cleanLabel.slice(0, 9) + "…" : cleanLabel}
                      </text>

                      {/* Tentative Distance Badge above node */}
                      {algorithm === "dijkstra" && currentEvent?.distances && (
                        <g>
                          <rect
                            x={pos.x - 20}
                            y={pos.y - radius - 15}
                            width={40}
                            height={14}
                            rx={4}
                            fill="#10201c"
                            opacity={0.88}
                          />
                          <text
                            x={pos.x}
                            y={pos.y - radius - 4.5}
                            textAnchor="middle"
                            fontSize={8.5}
                            fontWeight="600"
                            fill="#ffffff"
                            fontFamily="monospace"
                          >
                            d:{distDisplay}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Canvas Legend */}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-[10px] text-ink-soft">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-brand border border-brand" />
              Current Exploring
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#11875d] border border-[#11875d]" />
              Finalized / Optimal
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#a96708] border border-[#a96708]" />
              In Priority Queue
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-white border border-[#75847f]" />
              Unvisited
            </span>
          </div>
        </div>

        {/* Right Column: Execution Stepper, Explanations & Pseudocode (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
          {/* Stepper Controls Bar */}
          <div className="p-3 bg-surface-subtle border border-line rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs">
                <span className="text-ink-soft">Step </span>
                <strong className="text-sm text-brand font-mono">
                  {totalSteps > 0 ? currentStepIndex + 1 : 0}
                </strong>
                <span className="text-ink-soft"> of {totalSteps}</span>
              </div>
              <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-surface border border-line text-ink-soft font-mono">
                {currentEvent?.event_type || "READY"}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-brand h-full transition-all duration-200"
                style={{
                  width: `${totalSteps > 1 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0}%`,
                }}
              />
            </div>

            {/* Playback Buttons */}
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={() => setCurrentStepIndex(0)}
                disabled={currentStepIndex === 0 || totalSteps === 0}
                title="Reset to Start"
              >
                Reset
              </button>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentStepIndex === 0 || totalSteps === 0}
              >
                Prev
              </button>
              <button
                type="button"
                className="btn btn-xs btn-primary font-bold min-w-[70px]"
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={totalSteps === 0}
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={() => setCurrentStepIndex((prev) => Math.min(totalSteps - 1, prev + 1))}
                disabled={currentStepIndex >= totalSteps - 1 || totalSteps === 0}
              >
                Next
              </button>

              <select
                className="input text-[10px] py-0 h-6 w-20"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              >
                <option value={1800}>0.5x</option>
                <option value={1200}>1.0x</option>
                <option value={600}>2.0x</option>
              </select>
            </div>
          </div>

          {/* Step Explanation Card */}
          <div className="p-3 bg-surface border border-line rounded-xl shadow-xs space-y-1.5">
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
              Step Decision & State
            </h4>
            <p className="text-xs text-ink-soft leading-relaxed min-h-[38px]">
              {currentEvent?.explanation ||
                "Select algorithm and step through the execution trace to observe state changes."}
            </p>

            {/* Final Path or MST Result if complete */}
            {currentEvent?.event_type === "COMPLETE" && (
              <div className="pt-2 border-t border-line text-xs font-semibold text-safe">
                {algorithm === "dijkstra" && traceData?.final_path && (
                  <p>Path: {traceData.final_path.join(" -> ")} | Cost: {traceData.total_cost ?? "inf"}</p>
                )}
                {algorithm === "kruskal" && traceData?.selected_edges && (
                  <p>MST Edges: {traceData.selected_edges.length} | Cost: {traceData.total_cost ?? 0}</p>
                )}
              </div>
            )}

            {/* Priority Queue / Disjoint Components Snapshot */}
            {algorithm === "dijkstra" && currentEvent?.priority_queue && currentEvent.event_type !== "COMPLETE" && (
              <div className="pt-2 border-t border-line text-[11px]">
                <strong className="text-ink-soft block mb-1">
                  Min-Priority Queue: [dist, vertex]
                </strong>
                <div className="flex gap-1.5 flex-wrap">
                  {currentEvent.priority_queue.map(([d, v], idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded bg-surface-subtle border border-line font-mono text-[10px]"
                    >
                      ({d.toFixed(1)}, {v})
                    </span>
                  ))}
                  {currentEvent.priority_queue.length === 0 && (
                    <span className="text-ink-faint italic">Queue is empty</span>
                  )}
                </div>
              </div>
            )}

            {algorithm === "kruskal" && currentEvent?.dsu_components && currentEvent.event_type !== "COMPLETE" && (
              <div className="pt-2 border-t border-line text-[11px]">
                <strong className="text-ink-soft block mb-1">
                  Disjoint Forest Components:
                </strong>
                <div className="flex gap-1.5 flex-wrap">
                  {currentEvent.dsu_components.map((comp, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded bg-surface-subtle border border-line font-mono text-[10px]"
                    >
                      &#123;{comp.join(", ")}&#125;
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Synchronized Pseudocode Window */}
          <div className="p-3 bg-surface-subtle border border-line rounded-xl space-y-1.5 font-mono text-[11px] overflow-hidden">
            <div className="flex items-center justify-between text-[10px] text-ink-faint font-sans pb-1 border-b border-line">
              <span className="font-semibold text-ink-soft">
                Pseudocode ({algorithm.toUpperCase()})
              </span>
              <span>{algorithm === "dijkstra" ? "O((V + E) log V)" : "O(E log E)"}</span>
            </div>
            <div className="space-y-0.5 overflow-x-auto max-h-[140px] pt-1">
              {(PSEUDOCODE[algorithm] || []).map((line) => {
                const isHighlighted = activePseudoLine === line.line;
                return (
                  <div
                    key={line.line}
                    className={`px-1.5 py-0.5 rounded transition-colors flex items-center justify-between ${
                      isHighlighted
                        ? "bg-brand text-white font-bold shadow-xs"
                        : "text-ink hover:bg-surface"
                    }`}
                  >
                    <span>{line.text}</span>
                    {isHighlighted && (
                      <span className="text-[9px] font-sans opacity-90 ml-2 hidden sm:inline">
                        active
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
