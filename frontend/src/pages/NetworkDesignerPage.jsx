import { useState } from "react";
import { runMst } from "../api";
import { Metric, Notice, PageHeader } from "../components/UI";

const graph = {
  nodes: ["A", "B", "C", "D", "E"],
  edges: [
    { source: "A", target: "B", cost: 4 }, { source: "A", target: "C", cost: 2 },
    { source: "B", target: "C", cost: 1 }, { source: "B", target: "D", cost: 5 },
    { source: "C", target: "D", cost: 8 }, { source: "C", target: "E", cost: 10 },
    { source: "D", target: "E", cost: 2 },
  ],
};

export default function NetworkDesignerPage() {
  const [algorithm, setAlgorithm] = useState("prim");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); setError("");
    try { setResult(await runMst(algorithm, { ...graph, criterion: "cost" })); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  return <div className="page-stack algorithm-page">
    <PageHeader eyebrow="Network design" title="Minimum-cost infrastructure" description="Run PathRak's own Prim or Kruskal implementation over the displayed undirected network. A disconnected input returns a minimum spanning forest." />
    <section className="panel algorithm-controls"><div className="field"><label htmlFor="mst-algorithm">Algorithm</label><select id="mst-algorithm" className="input" value={algorithm} onChange={e => setAlgorithm(e.target.value)}><option value="prim">Prim's algorithm</option><option value="kruskal">Kruskal's algorithm</option></select></div><button className="btn btn-primary" onClick={run} disabled={loading}>{loading ? "Computing…" : `Run ${algorithm === "prim" ? "Prim" : "Kruskal"}`}</button></section>
    <section className="panel data-panel"><h2>Demo infrastructure graph</h2><p>Vertices are junctions; each edge cost is an illustrative construction cost. This controlled graph is not a map route.</p><div className="edge-list">{graph.edges.map(e => <span key={`${e.source}-${e.target}`}>{e.source} — {e.target}<b>{e.cost}</b></span>)}</div></section>
    {error && <Notice tone="warning" title="Network calculation failed">{error}</Notice>}
    {result && <section className="algorithm-results"><div className="metric-grid"><Metric label="Network cost" value={result.total_weight} /><Metric label="Edges selected" value={result.edges_selected} /><Metric label="Components" value={result.connected_components.length} /><Metric label="Execution" value={`${result.execution_ms} ms`} /></div><div className="panel data-panel"><h2>{result.is_forest ? "Minimum spanning forest" : "Minimum spanning tree"}</h2><div className="edge-list">{result.selected_edges.map((edge, i) => <span key={`${edge.source}-${edge.target}-${i}`}>{edge.source} — {edge.target}<b>{edge.weight}</b></span>)}</div></div></section>}
  </div>;
}
