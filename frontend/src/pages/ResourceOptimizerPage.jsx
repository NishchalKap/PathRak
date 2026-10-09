import { useState } from "react";
import { optimizeResources } from "../api";
import { Metric, Notice, PageHeader } from "../components/UI";

const projects = [
  { name: "Street lighting", cost: 18, benefit: 32, category: "Safety" },
  { name: "Raised crossing", cost: 12, benefit: 20, category: "Walking" },
  { name: "Bus shelter", cost: 20, benefit: 28, category: "Transit" },
  { name: "Footpath repair", cost: 10, benefit: 18, category: "Walking" },
  { name: "Signal upgrade", cost: 15, benefit: 25, category: "Traffic" },
];

export default function ResourceOptimizerPage() {
  const [method, setMethod] = useState("dp"), [budget, setBudget] = useState(40), [result, setResult] = useState(null), [error, setError] = useState("");
  const run = async () => { setError(""); try { setResult(await optimizeResources({ projects, budget: Number(budget), method })); } catch (err) { setError(err.message); } };
  return <div className="page-stack algorithm-page"><PageHeader eyebrow="Budget planning" title="Infrastructure resource optimizer" description="Compare a benefit-to-cost greedy heuristic with exact 0/1 dynamic programming or PathRak's Branch & Bound solver. Costs are integer planning units." />
    <section className="panel algorithm-controls"><div className="field"><label htmlFor="budget">Budget</label><input id="budget" className="input" type="number" min="0" value={budget} onChange={e => setBudget(e.target.value)} /></div><div className="field"><label htmlFor="resource-method">Method</label><select id="resource-method" className="input" value={method} onChange={e => setMethod(e.target.value)}><option value="greedy">Greedy ratio (not guaranteed optimal)</option><option value="dp">0/1 Knapsack dynamic programming</option><option value="branch_and_bound">Branch & Bound (optimal)</option></select></div><button className="btn btn-primary" onClick={run}>Optimize budget</button></section>
    <section className="panel data-panel"><h2>Candidate projects</h2><div className="edge-list">{projects.map(p => <span key={p.name}>{p.name}<b>{p.cost} cost · {p.benefit} benefit</b></span>)}</div></section>
    {error && <Notice tone="warning" title="Optimization failed">{error}</Notice>}
    {result && <section className="algorithm-results"><div className="metric-grid"><Metric label="Total benefit" value={result.total_benefit} /><Metric label="Total cost" value={result.total_cost} /><Metric label="Execution" value={`${result.execution_ms} ms`} /><Metric label="Method" value={result.method} /></div><div className="panel data-panel"><h2>Selected projects</h2><div className="edge-list">{result.selected_projects.map(p => <span key={p.name}>{p.name}<b>{p.cost} cost · {p.benefit} benefit</b></span>)}</div>{result.nodes_explored !== undefined && <p>Nodes explored: {result.nodes_explored}; branches pruned: {result.branches_pruned}. The solution is proven optimal.</p>}</div></section>}
  </div>;
}
