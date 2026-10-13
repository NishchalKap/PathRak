import { useState, useEffect, useRef, useMemo } from "react";
import { runMst, getPrimTrace, getKruskalTrace } from "../api";
import { Metric, Notice, PageHeader } from "../components/UI";
import Icon from "../components/Icon";

const PRESET_CONNECTED = {
  name: "Connected Urban Grid (MST)",
  nodes: ["A", "B", "C", "D", "E"],
  positions: {
    A: { x: 100, y: 110 },
    B: { x: 270, y: 70 },
    C: { x: 210, y: 250 },
    D: { x: 440, y: 110 },
    E: { x: 400, y: 270 },
  },
  edges: [
    { source: "A", target: "B", cost: 4, distance: 400, time: 5, risk: 2 },
    { source: "A", target: "C", cost: 2, distance: 200, time: 3, risk: 1 },
    { source: "B", target: "C", cost: 1, distance: 150, time: 2, risk: 1 },
    { source: "B", target: "D", cost: 5, distance: 600, time: 8, risk: 3 },
    { source: "C", target: "D", cost: 8, distance: 850, time: 10, risk: 4 },
    { source: "C", target: "E", cost: 10, distance: 1100, time: 14, risk: 5 },
    { source: "D", target: "E", cost: 2, distance: 250, time: 4, risk: 2 },
  ],
};

const PRESET_DISCONNECTED = {
  name: "Disconnected Suburbs (Spanning Forest)",
  nodes: ["A", "B", "C", "D", "E", "F"],
  positions: {
    A: { x: 90, y: 90 },
    B: { x: 220, y: 70 },
    C: { x: 140, y: 240 },
    D: { x: 380, y: 90 },
    E: { x: 500, y: 150 },
    F: { x: 420, y: 260 },
  },
  edges: [
    { source: "A", target: "B", cost: 3, distance: 300, time: 4, risk: 1 },
    { source: "B", target: "C", cost: 2, distance: 200, time: 3, risk: 2 },
    { source: "A", target: "C", cost: 6, distance: 700, time: 9, risk: 3 },
    { source: "D", target: "E", cost: 4, distance: 450, time: 6, risk: 2 },
    { source: "E", target: "F", cost: 5, distance: 550, time: 7, risk: 3 },
  ],
};

const PRESET_RING = {
  name: "Redundant Ring Infrastructure",
  nodes: ["R1", "R2", "R3", "R4", "R5"],
  positions: {
    R1: { x: 270, y: 60 },
    R2: { x: 440, y: 150 },
    R3: { x: 380, y: 280 },
    R4: { x: 160, y: 280 },
    R5: { x: 100, y: 150 },
  },
  edges: [
    { source: "R1", target: "R2", cost: 6, distance: 600, time: 7, risk: 2 },
    { source: "R2", target: "R3", cost: 3, distance: 300, time: 4, risk: 1 },
    { source: "R3", target: "R4", cost: 7, distance: 700, time: 8, risk: 3 },
    { source: "R4", target: "R5", cost: 2, distance: 200, time: 3, risk: 1 },
    { source: "R5", target: "R1", cost: 5, distance: 500, time: 6, risk: 2 },
    { source: "R1", target: "R3", cost: 9, distance: 900, time: 11, risk: 4 },
  ],
};

const PRESET_DENSE = {
  name: "Dense 4-Node Cross Mesh (K4)",
  nodes: ["N1", "N2", "N3", "N4"],
  positions: {
    N1: { x: 140, y: 80 },
    N2: { x: 400, y: 80 },
    N3: { x: 400, y: 260 },
    N4: { x: 140, y: 260 },
  },
  edges: [
    { source: "N1", target: "N2", cost: 1, distance: 100, time: 2, risk: 1 },
    { source: "N2", target: "N3", cost: 3, distance: 300, time: 4, risk: 2 },
    { source: "N3", target: "N4", cost: 2, distance: 200, time: 3, risk: 1 },
    { source: "N4", target: "N1", cost: 5, distance: 500, time: 6, risk: 3 },
    { source: "N1", target: "N3", cost: 7, distance: 700, time: 9, risk: 4 },
    { source: "N2", target: "N4", cost: 4, distance: 400, time: 5, risk: 2 },
  ],
};

export default function NetworkDesignerPage() {
  const [preset, setPreset] = useState("connected");
  const [nodes, setNodes] = useState(PRESET_CONNECTED.nodes);
  const [edgesList, setEdgesList] = useState(PRESET_CONNECTED.edges);
  const [algorithm, setAlgorithm] = useState("prim");
  const [criterion, setCriterion] = useState("cost");

  // Computation results
  const [result, setResult] = useState(null);
  const [crossValResult, setCrossValResult] = useState(null);
  const [traceData, setTraceData] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(800);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Add Edge Form State
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newWeight, setNewWeight] = useState("3");

  // Add Node State
  const [newNodeName, setNewNodeName] = useState("");

  const playTimerRef = useRef(null);

  // Position calculations for SVG canvas
  const nodePositions = useMemo(() => {
    let presetPositions = null;
    if (preset === "connected") presetPositions = PRESET_CONNECTED.positions;
    else if (preset === "disconnected") presetPositions = PRESET_DISCONNECTED.positions;
    else if (preset === "ring") presetPositions = PRESET_RING.positions;
    else if (preset === "dense") presetPositions = PRESET_DENSE.positions;

    const positions = {};
    const count = nodes.length;
    const cx = 270;
    const cy = 175;
    const rx = 200;
    const ry = 115;

    nodes.forEach((n, idx) => {
      if (presetPositions && presetPositions[n]) {
        positions[n] = presetPositions[n];
      } else {
        const angle = (idx / count) * 2 * Math.PI - Math.PI / 2;
        positions[n] = {
          x: Math.round(cx + rx * Math.cos(angle)),
          y: Math.round(cy + ry * Math.sin(angle)),
        };
      }
    });
    return positions;
  }, [nodes, preset]);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, []);

  // Playback loop
  useEffect(() => {
    if (isPlaying && traceData && traceData.events) {
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

  const applyPreset = (key) => {
    setIsPlaying(false);
    setPreset(key);
    setResult(null);
    setCrossValResult(null);
    setTraceData(null);
    setCurrentStepIndex(0);
    setError("");

    if (key === "connected") {
      setNodes([...PRESET_CONNECTED.nodes]);
      setEdgesList([...PRESET_CONNECTED.edges]);
    } else if (key === "disconnected") {
      setNodes([...PRESET_DISCONNECTED.nodes]);
      setEdgesList([...PRESET_DISCONNECTED.edges]);
    } else if (key === "ring") {
      setNodes([...PRESET_RING.nodes]);
      setEdgesList([...PRESET_RING.edges]);
    } else if (key === "dense") {
      setNodes([...PRESET_DENSE.nodes]);
      setEdgesList([...PRESET_DENSE.edges]);
    }
  };

  const addCustomNode = (e) => {
    e.preventDefault();
    const name = newNodeName.trim().toUpperCase();
    if (!name) return;
    if (nodes.includes(name)) {
      setError(`Node "${name}" already exists in the graph.`);
      return;
    }
    setNodes([...nodes, name]);
    setNewNodeName("");
    setError("");
    setResult(null);
    setTraceData(null);
  };

  const removeNode = (nodeToRemove) => {
    setIsPlaying(false);
    if (nodes.length <= 2) {
      setError("Cannot have fewer than 2 vertices for MST calculation.");
      return;
    }
    setNodes(nodes.filter((n) => n !== nodeToRemove));
    setEdgesList(edgesList.filter((e) => e.source !== nodeToRemove && e.target !== nodeToRemove));
    setResult(null);
    setCrossValResult(null);
    setTraceData(null);
    setError("");
  };

  const addCustomEdge = (e) => {
    e.preventDefault();
    const s = newSource.trim().toUpperCase();
    const t = newTarget.trim().toUpperCase();
    const w = parseFloat(newWeight);

    if (!s || !t) {
      setError("Please specify both source and destination vertices.");
      return;
    }
    if (s === t) {
      setError("Self-loops are invalid in MST graphs (source and target cannot be identical).");
      return;
    }
    if (!nodes.includes(s)) {
      setError(`Source node "${s}" is not in the vertex list.`);
      return;
    }
    if (!nodes.includes(t)) {
      setError(`Target node "${t}" is not in the vertex list.`);
      return;
    }
    if (isNaN(w) || w <= 0) {
      setError("Edge weight must be a positive number.");
      return;
    }

    // Check duplicate undirected edge
    const exists = edgesList.some(
      (edge) =>
        (edge.source === s && edge.target === t) ||
        (edge.source === t && edge.target === s)
    );
    if (exists) {
      setError(`An edge already exists between ${s} and ${t}. Duplicate undirected edges are disallowed.`);
      return;
    }

    const newEdgeObj = {
      source: s,
      target: t,
      cost: w,
      distance: w * 100,
      time: w * 2,
      risk: Math.min(5, Math.max(1, Math.round(w))),
    };

    setEdgesList([...edgesList, newEdgeObj]);
    setNewSource("");
    setNewTarget("");
    setError("");
    setResult(null);
    setCrossValResult(null);
    setTraceData(null);
  };

  const removeEdge = (idx) => {
    setIsPlaying(false);
    setEdgesList(edgesList.filter((_, i) => i !== idx));
    setResult(null);
    setCrossValResult(null);
    setTraceData(null);
    setError("");
  };

  const resetToInitialGraph = () => {
    applyPreset(preset);
  };

  const runOptimization = async () => {
    setIsPlaying(false);
    setError("");
    setLoading(true);
    setResult(null);
    setCrossValResult(null);
    setTraceData(null);
    setCurrentStepIndex(0);

    if (nodes.length < 2) {
      setError("Please define at least 2 vertices.");
      setLoading(false);
      return;
    }
    if (edgesList.length === 0) {
      setError("Please add at least 1 edge to build a network.");
      setLoading(false);
      return;
    }

    const payload = {
      nodes,
      edges: edgesList,
      criterion,
    };

    try {
      // 1. Run actual MST for selected algorithm
      // 2. Run alternate algorithm for cross-validation
      // 3. Fetch deterministic step-by-step trace
      const altAlgo = algorithm === "prim" ? "kruskal" : "prim";
      const traceFn = algorithm === "prim" ? getPrimTrace : getKruskalTrace;

      const [resPrimary, resAlt, traceRes] = await Promise.all([
        runMst(algorithm, payload),
        runMst(altAlgo, payload),
        traceFn(payload),
      ]);

      setResult(resPrimary);
      setCrossValResult(resAlt);
      setTraceData(traceRes);
      setCurrentStepIndex(0);
    } catch (err) {
      setError(err.message || "Execution failed. Please check graph validity.");
    } finally {
      setLoading(false);
    }
  };

  // Current animation step
  const currentStep = traceData && traceData.events ? traceData.events[currentStepIndex] : null;

  // Derive visual edge states from current trace step or final result
  const edgeVisualState = useMemo(() => {
    const states = {}; // `${u}-${v}` -> 'selected' | 'examining' | 'rejected' | 'candidate'

    const makeKey = (u, v) => (u < v ? `${u}-${v}` : `${v}-${u}`);

    edgesList.forEach((e) => {
      states[makeKey(e.source, e.target)] = "candidate";
    });

    if (currentStep) {
      // Trace mode
      if (currentStep.accepted_edges) {
        currentStep.accepted_edges.forEach((e) => {
          states[makeKey(e.source, e.target)] = "selected";
        });
      }
      if (currentStep.rejected_edges) {
        currentStep.rejected_edges.forEach((e) => {
          states[makeKey(e.source, e.target)] = "rejected";
        });
      }
      if (currentStep.current_edge) {
        const ce = currentStep.current_edge;
        const key = makeKey(ce.source, ce.target);
        if (currentStep.event_type === "CYCLE_REJECT") {
          states[key] = "rejected";
        } else if (currentStep.event_type === "ACCEPT_EDGE") {
          states[key] = "selected";
        } else {
          states[key] = "examining";
        }
      }
    } else if (result && result.selected_edges) {
      // Final static result mode
      result.selected_edges.forEach((e) => {
        states[makeKey(e.source, e.target)] = "selected";
      });
    }

    return states;
  }, [edgesList, currentStep, result]);

  // Visited / Active vertices
  const activeNodesSet = useMemo(() => {
    const set = new Set();
    if (currentStep) {
      if (currentStep.visited) currentStep.visited.forEach((v) => set.add(v));
      if (currentStep.current_node) set.add(currentStep.current_node);
      if (currentStep.current_edge) {
        set.add(currentStep.current_edge.source);
        set.add(currentStep.current_edge.target);
      }
    }
    return set;
  }, [currentStep]);

  return (
    <div className="page-stack algorithm-page" style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
      <PageHeader
        eyebrow="DAA Graph Optimization"
        title="Network Infrastructure Optimizer & MST"
        description="Design minimum-cost infrastructure networks with verified Disjoint Set Union (DSU) Kruskal and Priority Queue Prim algorithms. Features live step-by-step execution playback, graph editing, and cross-algorithmic validation."
      />

      {/* Preset and Setup Toolbar */}
      <section className="panel" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "1.25rem", borderRadius: "10px", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
              Sample Topology Presets
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                type="button"
                className={`btn btn-sm ${preset === "connected" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => applyPreset("connected")}
              >
                Connected Urban Grid (MST)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${preset === "disconnected" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => applyPreset("disconnected")}
              >
                Disconnected Suburbs (Forest)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${preset === "ring" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => applyPreset("ring")}
              >
                Metro Ring Cycle
              </button>
              <button
                type="button"
                className={`btn btn-sm ${preset === "dense" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => applyPreset("dense")}
              >
                Dense Mesh (K4)
              </button>
            </div>
          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={resetToInitialGraph}>
            <Icon name="refresh" /> Reset Topology
          </button>
        </div>

        {/* Algorithm Configuration */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--line)" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem", color: "var(--ink-soft)" }}>
              Algorithm
            </label>
            <select
              id="mst-algorithm"
              className="input"
              value={algorithm}
              onChange={(e) => {
                setAlgorithm(e.target.value);
                setResult(null);
                setTraceData(null);
              }}
              style={{ width: "100%" }}
            >
              <option value="prim">Prim's Algorithm (Priority Queue Cut)</option>
              <option value="kruskal">Kruskal's Algorithm (DSU Forest Union)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem", color: "var(--ink-soft)" }}>
              Weight Metric Criterion
            </label>
            <select
              id="mst-criterion"
              className="input"
              value={criterion}
              onChange={(e) => {
                setCriterion(e.target.value);
                setResult(null);
                setTraceData(null);
              }}
              style={{ width: "100%" }}
            >
              <option value="cost">Construction Cost (Standard units)</option>
              <option value="distance">Physical Distance (Meters)</option>
              <option value="time">Travel Latency (Minutes)</option>
              <option value="risk">Hazard / Risk Score</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", height: "40px" }}
              onClick={runOptimization}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Icon name="clock" /> Computing Network...
                </>
              ) : (
                <>
                  <Icon name="play" /> Run {algorithm === "prim" ? "Prim's" : "Kruskal's"} Algorithm
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <Notice tone="warning" title="Graph Specification Notice" style={{ marginBottom: "1.5rem" }}>
          {error}
        </Notice>
      )}

      {/* Main Interactive Grid: Graph Canvas on Left, Editor Table on Right */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: "1.5rem", marginBottom: "1.5rem" }}>
        
        {/* Visual Graph Canvas Panel */}
        <section className="panel" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "1.25rem", borderRadius: "10px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Icon name="compass" /> Network Canvas ({nodes.length} Vertices, {edgesList.length} Edges)
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: 10, height: 10, background: "#10b981", borderRadius: 2 }}></span> Selected MST
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: 10, height: 10, background: "#f59e0b", borderRadius: 2 }}></span> Inspected
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: 10, height: 10, background: "#ef4444", borderRadius: 2 }}></span> Cycle Reject
              </span>
            </div>
          </div>

          {/* SVG Graph Viewport */}
          <div
            style={{
              background: "var(--surface-subtle, #0f172a)",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              position: "relative",
              overflow: "hidden",
              minHeight: "350px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 540 350" style={{ width: "100%", height: "100%", maxHeight: "370px" }}>
              {/* Grid background dots */}
              <defs>
                <pattern id="net-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.06)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#net-grid)" />

              {/* Edge Lines */}
              {edgesList.map((e, idx) => {
                const posA = nodePositions[e.source];
                const posB = nodePositions[e.target];
                if (!posA || !posB) return null;

                const edgeKey = e.source < e.target ? `${e.source}-${e.target}` : `${e.target}-${e.source}`;
                const status = edgeVisualState[edgeKey] || "candidate";

                let strokeColor = "rgba(148, 163, 184, 0.35)";
                let strokeWidth = 2;
                let strokeDash = "none";
                let opacity = 0.65;

                if (status === "selected") {
                  strokeColor = "#10b981";
                  strokeWidth = 3.5;
                  opacity = 1;
                } else if (status === "examining") {
                  strokeColor = "#f59e0b";
                  strokeWidth = 3.5;
                  strokeDash = "6 3";
                  opacity = 1;
                } else if (status === "rejected") {
                  strokeColor = "#ef4444";
                  strokeWidth = 2;
                  strokeDash = "4 4";
                  opacity = 0.55;
                }

                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;
                const weightDisplay = e[criterion] ?? e.cost;

                return (
                  <g key={`edge-${edgeKey}-${idx}`}>
                    <line
                      x1={posA.x}
                      y1={posA.y}
                      x2={posB.x}
                      y2={posB.y}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDash}
                      strokeOpacity={opacity}
                    />
                    {/* Weight badge in midpoint */}
                    <rect
                      x={midX - 14}
                      y={midY - 9}
                      width={28}
                      height={18}
                      rx={4}
                      fill="var(--surface, #1e293b)"
                      stroke={strokeColor}
                      strokeWidth={1}
                      strokeOpacity={0.7}
                    />
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      fill={status === "selected" ? "#10b981" : status === "examining" ? "#f59e0b" : "var(--ink)"}
                      fontSize="10"
                      fontWeight="600"
                    >
                      {weightDisplay}
                    </text>
                  </g>
                );
              })}

              {/* Node Vertices */}
              {nodes.map((nodeName) => {
                const pos = nodePositions[nodeName] || { x: 270, y: 175 };
                const isNodeActive = activeNodesSet.has(nodeName);

                return (
                  <g key={`node-${nodeName}`} style={{ cursor: "pointer" }}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={18}
                      fill={isNodeActive ? "rgba(16, 185, 129, 0.2)" : "var(--surface, #1e293b)"}
                      stroke={isNodeActive ? "#10b981" : "var(--line-strong, #475569)"}
                      strokeWidth={isNodeActive ? 2.5 : 2}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 4}
                      textAnchor="middle"
                      fill="var(--ink, #f8fafc)"
                      fontSize="11"
                      fontWeight="700"
                    >
                      {nodeName}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Step-by-Step Playback Controls (Active when trace exists) */}
          {traceData && traceData.events && (
            <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink-soft)" }}>
                  Step {currentStepIndex + 1} of {traceData.events.length}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                  Trace: {traceData.algorithm} ({traceData.events.length} deterministic states)
                </span>
              </div>

              {/* Progress Slider */}
              <input
                type="range"
                min="0"
                max={traceData.events.length - 1}
                value={currentStepIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStepIndex(parseInt(e.target.value, 10));
                }}
                style={{ width: "100%", marginBottom: "0.75rem", accentColor: "var(--brand)" }}
              />

              {/* Buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Reset to beginning"
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentStepIndex(0);
                    }}
                  >
                    <Icon name="backward" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Previous step"
                    disabled={currentStepIndex <= 0}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentStepIndex((prev) => Math.max(0, prev - 1));
                    }}
                  >
                    <Icon name="step-backward" />
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${isPlaying ? "btn-secondary" : "btn-primary"}`}
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <Icon name="pause" /> : <Icon name="play" />} {isPlaying ? "Pause" : "Play"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Next step"
                    disabled={currentStepIndex >= traceData.events.length - 1}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentStepIndex((prev) => Math.min(traceData.events.length - 1, prev + 1));
                    }}
                  >
                    <Icon name="step-forward" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Jump to completion"
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentStepIndex(traceData.events.length - 1);
                    }}
                  >
                    <Icon name="forward" />
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>Speed:</span>
                  <select
                    className="input"
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(parseInt(e.target.value, 10))}
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", height: "30px" }}
                  >
                    <option value={1500}>0.6x (Slow)</option>
                    <option value={800}>1.0x (Normal)</option>
                    <option value={400}>2.0x (Fast)</option>
                    <option value={200}>4.0x (Ultra)</option>
                  </select>
                </div>
              </div>

              {/* Event Narrative Card */}
              {currentStep && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.6rem 0.85rem",
                    background: "var(--surface-subtle, #1e293b)",
                    borderRadius: "6px",
                    borderLeft: `4px solid ${
                      currentStep.event_type === "ACCEPT_EDGE"
                        ? "#10b981"
                        : currentStep.event_type === "CYCLE_REJECT"
                        ? "#ef4444"
                        : "var(--brand)"
                    }`,
                    fontSize: "0.8125rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                    <strong style={{ color: "var(--ink)" }}>{currentStep.event_type}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                      Accumulated Cost: <strong>{currentStep.total_cost ?? 0}</strong>
                    </span>
                  </div>
                  <div style={{ color: "var(--ink-soft)", lineHeight: 1.4 }}>{currentStep.description}</div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Graph Editor Panel */}
        <section className="panel" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "1.25rem", borderRadius: "10px", display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.75rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Icon name="table" /> Graph Topology Editor
          </h2>

          {/* Vertex Management */}
          <div style={{ marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink-soft)" }}>
                Vertices ({nodes.length}):
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
              {nodes.map((nodeName) => (
                <span
                  key={nodeName}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                    background: "var(--surface-subtle)",
                    border: "1px solid var(--line)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {nodeName}
                  <button
                    type="button"
                    onClick={() => removeNode(nodeName)}
                    style={{ background: "none", border: "none", color: "var(--danger, #ef4444)", cursor: "pointer", padding: "0 2px", fontSize: "11px" }}
                    title={`Delete node ${nodeName}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            {/* Add Node inline form */}
            <form onSubmit={addCustomNode} style={{ display: "flex", gap: "0.4rem" }}>
              <input
                className="input"
                placeholder="New Vertex (e.g. G)"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                style={{ flex: 1, padding: "0.3rem 0.5rem", fontSize: "0.8125rem" }}
              />
              <button type="submit" className="btn btn-secondary btn-sm">
                + Add Vertex
              </button>
            </form>
          </div>

          {/* Candidate Edges Table */}
          <div style={{ flex: 1, overflowY: "auto", maxHeight: "250px", marginBottom: "1rem" }}>
            <table className="table" style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)", color: "var(--ink-soft)", textAlign: "left" }}>
                  <th style={{ padding: "0.4rem" }}>Source</th>
                  <th style={{ padding: "0.4rem" }}>Target</th>
                  <th style={{ padding: "0.4rem" }}>{criterion.toUpperCase()} Weight</th>
                  <th style={{ padding: "0.4rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {edgesList.map((edge, idx) => (
                  <tr key={`${edge.source}-${edge.target}-${idx}`} style={{ borderBottom: "1px solid var(--line-subtle, rgba(255,255,255,0.05))" }}>
                    <td style={{ padding: "0.4rem", fontWeight: 600 }}>{edge.source}</td>
                    <td style={{ padding: "0.4rem", fontWeight: 600 }}>{edge.target}</td>
                    <td style={{ padding: "0.4rem" }}>
                      <strong>{edge[criterion] ?? edge.cost}</strong>
                    </td>
                    <td style={{ padding: "0.4rem", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => removeEdge(idx)}
                        style={{ background: "none", border: "none", color: "var(--danger, #ef4444)", cursor: "pointer", fontSize: "0.75rem", textDecoration: "underline" }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Edge Form */}
          <form onSubmit={addCustomEdge} style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--line)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "0.4rem", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-soft)", marginBottom: "0.2rem" }}>From</label>
              <input
                className="input"
                placeholder="From"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                style={{ width: "100%", padding: "0.3rem", fontSize: "0.8125rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-soft)", marginBottom: "0.2rem" }}>To</label>
              <input
                className="input"
                placeholder="To"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                style={{ width: "100%", padding: "0.3rem", fontSize: "0.8125rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-soft)", marginBottom: "0.2rem" }}>Weight</label>
              <input
                type="number"
                min="0.1"
                step="0.5"
                className="input"
                placeholder="Weight"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                style={{ width: "100%", padding: "0.3rem", fontSize: "0.8125rem" }}
              />
            </div>

            <button type="submit" className="btn btn-secondary btn-sm" style={{ height: "32px" }}>
              Add
            </button>
          </form>
        </section>
      </div>

      {/* Execution Results Section */}
      {result && (
        <section className="algorithm-results">
          {/* Engineering Metrics Grid */}
          <div className="metric-grid" style={{ marginBottom: "1.25rem" }}>
            <Metric
              label="Optimal Network Cost"
              value={result.total_weight}
              detail={`Summed across ${criterion}`}
            />
            <Metric
              label="Edges in Tree / Forest"
              value={`${result.edges_selected} of ${edgesList.length}`}
              detail={result.is_forest ? "Forest Partition" : "Tree Spanning"}
            />
            <Metric
              label="Graph Classification"
              value={result.is_forest ? "Spanning Forest" : "Spanning Tree (MST)"}
              detail={`${result.connected_components.length} Component${result.connected_components.length === 1 ? "" : "s"}`}
            />
            <Metric
              label="Execution Runtime"
              value={`${result.execution_ms} ms`}
              detail={result.algorithm}
            />
          </div>

          {/* Detailed Solution & Cross-Validation Panel */}
          <div className="panel" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "1.25rem", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                {result.is_forest
                  ? "Minimum Spanning Forest (Partitioned Components)"
                  : "Minimum Spanning Tree (MST)"}
              </h2>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#10b981",
                  background: "rgba(16, 185, 129, 0.1)",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}
              >
                ✓ Optimal Solution ({result.algorithm})
              </span>
            </div>

            <p style={{ fontSize: "0.8125rem", color: "var(--ink-soft)", margin: "0 0 1rem 0", lineHeight: 1.5 }}>
              {result.is_forest
                ? "The graph contains disconnected components. Rather than falsely reporting an impossible spanning tree, the algorithm determined optimal spanning trees within each partition, producing a Minimum Spanning Forest."
                : "All vertices are connected into a single acyclic subgraph minimizing total weight. Any edge removal disconnects the graph, and adding any candidate edge introduces a cycle."}
            </p>

            {/* Selected Edges Table */}
            <div style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Accepted Network Edges ({result.selected_edges.length})
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {result.selected_edges.map((edge, idx) => (
                  <span
                    key={`${edge.source}-${edge.target}-${idx}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.35rem 0.65rem",
                      borderRadius: "6px",
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "var(--ink)" }}>
                      {edge.source} — {edge.target}
                    </span>
                    <strong style={{ color: "#10b981" }}>{edge.weight}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Disjoint Connected Components Breakdown */}
            <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--line)", marginBottom: "1rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: "0.4rem" }}>
                Disjoint Connected Component Partitions:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {result.connected_components.map((comp, idx) => (
                  <span
                    key={`comp-${idx}`}
                    style={{
                      padding: "0.3rem 0.6rem",
                      borderRadius: "4px",
                      background: "var(--surface-subtle)",
                      border: "1px solid var(--line)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <strong>Component {idx + 1}:</strong> &#123;{comp.join(", ")}&#125; ({comp.length} vertices)
                  </span>
                ))}
              </div>
            </div>

            {/* Cross-Validation Verification Card */}
            {crossValResult && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "6px",
                  background:
                    Math.abs(result.total_weight - crossValResult.total_weight) < 1e-6
                      ? "rgba(16, 185, 129, 0.05)"
                      : "rgba(239, 68, 68, 0.05)",
                  border: `1px solid ${
                    Math.abs(result.total_weight - crossValResult.total_weight) < 1e-6
                      ? "rgba(16, 185, 129, 0.2)"
                      : "rgba(239, 68, 68, 0.2)"
                  }`,
                  fontSize: "0.8125rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    <strong>Algorithmic Cross-Validation:</strong> Prim and Kruskal both evaluated on this exact network topology.
                  </span>
                  <span style={{ fontWeight: 700, color: Math.abs(result.total_weight - crossValResult.total_weight) < 1e-6 ? "#10b981" : "#ef4444" }}>
                    {Math.abs(result.total_weight - crossValResult.total_weight) < 1e-6 ? "✓ Verified Identical Cost" : "⚠ Weight Divergence"}
                  </span>
                </div>
                <div style={{ color: "var(--ink-soft)", marginTop: "0.25rem", fontSize: "0.75rem" }}>
                  {result.algorithm}: <strong>{result.total_weight}</strong> in {result.execution_ms} ms &bull;{" "}
                  {crossValResult.algorithm}: <strong>{crossValResult.total_weight}</strong> in {crossValResult.execution_ms} ms
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
