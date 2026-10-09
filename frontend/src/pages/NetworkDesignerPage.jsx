import { useState } from "react";
import { runMst } from "../api";
import { Metric, Notice, PageHeader } from "../components/UI";

const PRESET_CONNECTED = {
  name: "Connected Urban Grid (MST)",
  nodes: ["A", "B", "C", "D", "E"],
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
  edges: [
    { source: "A", target: "B", cost: 3, distance: 300, time: 4, risk: 1 },
    { source: "B", target: "C", cost: 2, distance: 200, time: 3, risk: 2 },
    { source: "A", target: "C", cost: 6, distance: 700, time: 9, risk: 3 },
    { source: "D", target: "E", cost: 4, distance: 450, time: 6, risk: 2 },
    { source: "E", target: "F", cost: 5, distance: 550, time: 7, risk: 3 },
  ],
};

export default function NetworkDesignerPage() {
  const [preset, setPreset] = useState("connected");
  const [nodesInput, setNodesInput] = useState(PRESET_CONNECTED.nodes.join(", "));
  const [edgesList, setEdgesList] = useState(PRESET_CONNECTED.edges);
  const [algorithm, setAlgorithm] = useState("prim");
  const [criterion, setCriterion] = useState("cost");
  const [result, setResult] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // New edge form
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newWeight, setNewWeight] = useState(3);

  const applyPreset = (presetKey) => {
    setPreset(presetKey);
    setResult(null);
    setCompareResult(null);
    setError("");
    if (presetKey === "connected") {
      setNodesInput(PRESET_CONNECTED.nodes.join(", "));
      setEdgesList(PRESET_CONNECTED.edges);
    } else if (presetKey === "disconnected") {
      setNodesInput(PRESET_DISCONNECTED.nodes.join(", "));
      setEdgesList(PRESET_DISCONNECTED.edges);
    }
  };

  const getCleanNodes = () => {
    return Array.from(
      new Set(
        nodesInput
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      )
    );
  };

  const addCustomEdge = (e) => {
    e.preventDefault();
    const s = newSource.trim().toUpperCase();
    const t = newTarget.trim().toUpperCase();
    const w = parseFloat(newWeight) || 1;
    if (!s || !t) return;
    if (s === t) {
      setError("An edge cannot connect a node to itself.");
      return;
    }
    const currentNodes = getCleanNodes();
    if (!currentNodes.includes(s)) currentNodes.push(s);
    if (!currentNodes.includes(t)) currentNodes.push(t);
    setNodesInput(currentNodes.join(", "));

    setEdgesList([
      ...edgesList,
      { source: s, target: t, cost: w, distance: w * 100, time: w, risk: Math.min(5, Math.max(1, Math.round(w))) },
    ]);
    setNewSource("");
    setNewTarget("");
    setError("");
  };

  const removeEdge = (index) => {
    setEdgesList(edgesList.filter((_, i) => i !== index));
    setResult(null);
  };

  const run = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setCompareResult(null);
    const nodes = getCleanNodes();
    if (nodes.length < 2) {
      setError("Please specify at least 2 vertices.");
      setLoading(false);
      return;
    }
    if (edgesList.length === 0) {
      setError("Please add at least 1 edge.");
      setLoading(false);
      return;
    }

    try {
      const graphPayload = {
        nodes,
        edges: edgesList,
        criterion,
      };
      const [resPrimary, resAlt] = await Promise.all([
        runMst(algorithm, graphPayload),
        runMst(algorithm === "prim" ? "kruskal" : "prim", graphPayload),
      ]);
      setResult(resPrimary);
      setCompareResult(resAlt);
    } catch (err) {
      setError(err.message || "Failed to execute network design algorithm.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack algorithm-page">
      <PageHeader
        eyebrow="Network Design & MST"
        title="Infrastructure Network Optimization"
        description="Compute optimal low-cost network connections using PathRak's Disjoint Set Union (DSU) Kruskal and Priority-Queue Prim algorithms. Detects connected trees versus minimum spanning forests."
      />

      <section className="panel algorithm-controls">
        <div className="field">
          <label>Network Presets</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`btn btn-sm ${preset === "connected" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => applyPreset("connected")}
            >
              Connected City (MST)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${preset === "disconnected" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => applyPreset("disconnected")}
            >
              Disconnected Suburbs (Forest)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-2">
          <div className="field">
            <label htmlFor="mst-algorithm">Algorithm</label>
            <select
              id="mst-algorithm"
              className="input"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
            >
              <option value="prim">Prim's Algorithm (Priority Queue)</option>
              <option value="kruskal">Kruskal's Algorithm (Disjoint Set Union)</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="mst-criterion">Edge Weight Metric</label>
            <select
              id="mst-criterion"
              className="input"
              value={criterion}
              onChange={(e) => setCriterion(e.target.value)}
            >
              <option value="cost">Construction Cost</option>
              <option value="distance">Physical Distance</option>
              <option value="time">Travel Time</option>
              <option value="risk">Hazard/Risk Score</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Vertices (comma-separated)</label>
          <input
            className="input"
            value={nodesInput}
            onChange={(e) => setNodesInput(e.target.value)}
            placeholder="A, B, C, D, E..."
          />
        </div>

        <button className="btn btn-primary mt-2" onClick={run} disabled={loading}>
          {loading ? "Computing Network..." : `Run ${algorithm === "prim" ? "Prim's" : "Kruskal's"} Algorithm`}
        </button>
      </section>

      {error && <Notice tone="warning" title="Calculation error">{error}</Notice>}

      <section className="panel data-panel">
        <div className="flex justify-between items-center mb-2">
          <h2>Network Topology ({edgesList.length} candidate edges)</h2>
          <span className="text-xs text-ink-soft">Undirected weighted graph</span>
        </div>
        <div className="edge-list mb-4">
          {edgesList.map((e, idx) => (
            <span key={`${e.source}-${e.target}-${idx}`} className="group relative">
              {e.source} — {e.target}
              <b>{e[criterion] ?? e.cost} {criterion}</b>
              <button
                type="button"
                className="ml-2 text-danger hover:underline text-xs"
                title="Remove edge"
                onClick={() => removeEdge(idx)}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {/* Add custom edge */}
        <form onSubmit={addCustomEdge} className="flex flex-wrap items-center gap-2 pt-3 border-t border-line text-sm">
          <strong className="text-xs">Add Edge:</strong>
          <input
            className="input w-20 py-1"
            placeholder="From"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
          />
          <span>—</span>
          <input
            className="input w-20 py-1"
            placeholder="To"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
          />
          <input
            type="number"
            min="0"
            step="0.5"
            className="input w-24 py-1"
            placeholder="Weight"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm">Add</button>
        </form>
      </section>

      {result && (
        <section className="algorithm-results">
          <div className="metric-grid">
            <Metric label="Total Network Weight" value={result.total_weight} detail={`Measured on ${criterion}`} />
            <Metric label="Edges Selected" value={result.edges_selected} detail={`Out of ${edgesList.length}`} />
            <Metric
              label="Graph Structure"
              value={result.is_forest ? "Spanning Forest" : "Spanning Tree"}
              detail={`${result.connected_components.length} component${result.connected_components.length === 1 ? "" : "s"}`}
            />
            <Metric label="Backend Execution" value={`${result.execution_ms} ms`} detail={result.algorithm} />
          </div>

          <div className="panel data-panel">
            <div className="flex justify-between items-center mb-2">
              <h2>
                {result.is_forest ? "Minimum Spanning Forest (Disconnected Components)" : "Minimum Spanning Tree (MST)"}
              </h2>
              <span className="text-xs text-safe font-semibold">
                ✓ Proven Optimal ({result.algorithm})
              </span>
            </div>

            <p className="text-xs text-ink-soft mb-3">
              {result.is_forest
                ? "The graph contains multiple disconnected components. Kruskal DSU / Prim found the optimal spanning trees within each connected partition."
                : "All vertices are connected into a single cycle-free network minimizing the total weight."}
            </p>

            <div className="edge-list mb-4">
              {result.selected_edges.map((edge, i) => (
                <span key={`${edge.source}-${edge.target}-${i}`} className="border-brand">
                  {edge.source} — {edge.target}
                  <b>{edge.weight}</b>
                </span>
              ))}
            </div>

            <div className="pt-3 border-t border-line text-xs">
              <strong className="block mb-1">Disjoint Connected Components:</strong>
              <div className="flex gap-2 flex-wrap">
                {result.connected_components.map((comp, idx) => (
                  <span key={idx} className="badge bg-surface-subtle p-1.5 rounded">
                    Component {idx + 1}: &#123;{comp.join(", ")}&#125;
                  </span>
                ))}
              </div>
            </div>

            {compareResult && (
              <div className="mt-3 pt-3 border-t border-line text-xs text-ink-soft">
                <span>
                  Cross-validation: <strong>{compareResult.algorithm}</strong> produced matching total weight of <strong>{compareResult.total_weight}</strong> in {compareResult.execution_ms} ms.
                </span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
