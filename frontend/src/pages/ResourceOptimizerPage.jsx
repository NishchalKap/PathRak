import { useState } from "react";
import { optimizeResources } from "../api";
import { Metric, Notice, PageHeader } from "../components/UI";

const PRESET_MUNICIPAL = [
  { name: "Smart Street Lighting", cost: 18, benefit: 32, category: "Lighting" },
  { name: "Raised Pedestrian Crossing", cost: 12, benefit: 20, category: "Pedestrian" },
  { name: "CCTV & SOS Booth", cost: 20, benefit: 28, category: "Surveillance" },
  { name: "Footpath Pavement Repair", cost: 10, benefit: 18, category: "Pedestrian" },
  { name: "Emergency Call Box Signal", cost: 15, benefit: 25, category: "Emergency" },
];

// Classic counterexample instance where greedy fails:
// Budget = 50. Greedy picks Project A (benefit 60) and has 20 left -> Total 60.
// DP & Branch & Bound pick Projects B + C (benefit 45 + 45 = 90) -> Total 90!
const PRESET_GREEDY_COUNTEREXAMPLE = [
  { name: "Project A (Ratio 2.0)", cost: 30, benefit: 60, category: "Heuristic Trap" },
  { name: "Project B (Ratio 1.8)", cost: 25, benefit: 45, category: "Optimal Set" },
  { name: "Project C (Ratio 1.8)", cost: 25, benefit: 45, category: "Optimal Set" },
];

export default function ResourceOptimizerPage() {
  const [projects, setProjects] = useState(PRESET_MUNICIPAL);
  const [budget, setBudget] = useState(40);
  const [method, setMethod] = useState("all"); // "dp" | "branch_and_bound" | "greedy" | "all"
  const [result, setResult] = useState(null);
  const [comparisonResults, setComparisonResults] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // New project inputs
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState(10);
  const [newBenefit, setNewBenefit] = useState(15);
  const [newCategory, setNewCategory] = useState("Safety");

  const loadPreset = (type) => {
    setError("");
    setResult(null);
    setComparisonResults(null);
    if (type === "municipal") {
      setProjects(PRESET_MUNICIPAL);
      setBudget(40);
    } else if (type === "greedy_fail") {
      setProjects(PRESET_GREEDY_COUNTEREXAMPLE);
      setBudget(50);
    }
  };

  const handleAddProject = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const c = parseInt(newCost, 10);
    const b = parseInt(newBenefit, 10);
    if (isNaN(c) || isNaN(b) || c < 0 || b < 0) {
      setError("Project cost and benefit must be non-negative integers.");
      return;
    }
    setProjects([
      ...projects,
      { name: newName.trim(), cost: c, benefit: b, category: newCategory.trim() || "General" },
    ]);
    setNewName("");
    setNewCost(10);
    setNewBenefit(15);
    setError("");
  };

  const removeProject = (index) => {
    setProjects(projects.filter((_, i) => i !== index));
    setResult(null);
    setComparisonResults(null);
  };

  const run = async () => {
    const b = parseInt(budget, 10);
    if (isNaN(b) || b < 0) {
      setError("Budget must be a non-negative integer.");
      return;
    }
    if (projects.length === 0) {
      setError("Please include at least one project candidate.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setComparisonResults(null);

    try {
      if (method === "all") {
        const [resDp, resBnB, resGreedy] = await Promise.all([
          optimizeResources({ projects, budget: b, method: "dp" }),
          optimizeResources({ projects, budget: b, method: "branch_and_bound" }),
          optimizeResources({ projects, budget: b, method: "greedy" }),
        ]);
        setComparisonResults({
          dp: resDp,
          bnb: resBnB,
          greedy: resGreedy,
        });
        setResult(resDp);
      } else {
        const res = await optimizeResources({ projects, budget: b, method });
        setResult(res);
      }
    } catch (err) {
      setError(err.message || "Failed to execute resource optimizer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack algorithm-page">
      <PageHeader
        eyebrow="Resource & Budget Planning"
        title="Infrastructure Budget Optimizer"
        description="Solve constrained municipal budget allocation using 0/1 Knapsack Dynamic Programming, Branch & Bound search with fractional bounding, and Greedy heuristic ranking."
      />

      <section className="panel algorithm-controls">
        <div className="field">
          <label>Problem Presets</label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => loadPreset("municipal")}
            >
              Municipal Safety (Budget ₹40)
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => loadPreset("greedy_fail")}
            >
              Greedy Heuristic Failure Case (Budget ₹50)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-2">
          <div className="field">
            <label htmlFor="budget">Available Budget (₹ Lakhs or Units)</label>
            <input
              id="budget"
              className="input"
              type="number"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="resource-method">Optimization Method</label>
            <select
              id="resource-method"
              className="input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="all">Compare All 3 Methods (DP, B&B, Greedy)</option>
              <option value="dp">0/1 Knapsack Dynamic Programming (Exact Optimal)</option>
              <option value="branch_and_bound">Branch & Bound (Exact Optimal with Pruning)</option>
              <option value="greedy">Greedy Benefit/Cost Ratio (Fast Heuristic)</option>
            </select>
          </div>
        </div>

        <button className="btn btn-primary mt-2" onClick={run} disabled={loading}>
          {loading ? "Optimizing Budget..." : "Run Budget Optimization"}
        </button>
      </section>

      {error && <Notice tone="warning" title="Optimization error">{error}</Notice>}

      <section className="panel data-panel">
        <div className="flex justify-between items-center mb-2">
          <h2>Candidate Projects ({projects.length})</h2>
          <span className="text-xs text-ink-soft">Each project can be selected at most once (0/1)</span>
        </div>

        <div className="edge-list mb-4">
          {projects.map((p, idx) => (
            <span key={`${p.name}-${idx}`} className="group relative">
              <strong>{p.name}</strong>
              <small className="ml-1 text-ink-faint">({p.category})</small>
              <b>Cost: {p.cost} | Benefit: {p.benefit}</b>
              <button
                type="button"
                className="ml-2 text-danger hover:underline text-xs"
                title="Remove project"
                onClick={() => removeProject(idx)}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {/* Add Project Form */}
        <form onSubmit={handleAddProject} className="flex flex-wrap items-center gap-2 pt-3 border-t border-line text-sm">
          <strong className="text-xs">Add Project:</strong>
          <input
            className="input w-36 py-1"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            type="number"
            min="0"
            className="input w-20 py-1"
            placeholder="Cost"
            value={newCost}
            onChange={(e) => setNewCost(e.target.value)}
          />
          <input
            type="number"
            min="0"
            className="input w-20 py-1"
            placeholder="Benefit"
            value={newBenefit}
            onChange={(e) => setNewBenefit(e.target.value)}
          />
          <input
            className="input w-28 py-1"
            placeholder="Category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm">Add</button>
        </form>
      </section>

      {/* Comparison table when all methods are compared */}
      {comparisonResults && (
        <section className="panel data-panel mb-4">
          <h2>Method Comparison (Budget: {budget})</h2>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-line text-ink-soft">
                  <th className="py-2">Method</th>
                  <th>Optimality</th>
                  <th>Total Benefit</th>
                  <th>Budget Used</th>
                  <th>Selected Projects</th>
                  <th>Execution</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line">
                  <td className="py-2 font-semibold">0/1 Knapsack DP</td>
                  <td className="text-safe font-semibold">Guaranteed Optimal</td>
                  <td className="font-bold text-sm text-brand">{comparisonResults.dp.total_benefit}</td>
                  <td>{comparisonResults.dp.total_cost} / {budget}</td>
                  <td>{comparisonResults.dp.selected_projects.map((p) => p.name).join(", ")}</td>
                  <td>{comparisonResults.dp.execution_ms} ms</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 font-semibold">Branch & Bound</td>
                  <td className="text-safe font-semibold">Guaranteed Optimal</td>
                  <td className="font-bold text-sm text-brand">{comparisonResults.bnb.total_benefit}</td>
                  <td>{comparisonResults.bnb.total_cost} / {budget}</td>
                  <td>{comparisonResults.bnb.selected_projects.map((p) => p.name).join(", ")}</td>
                  <td>{comparisonResults.bnb.execution_ms} ms</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 font-semibold">Greedy Ratio</td>
                  <td className={comparisonResults.greedy.total_benefit < comparisonResults.dp.total_benefit ? "text-danger font-semibold" : "text-safe"}>
                    {comparisonResults.greedy.total_benefit < comparisonResults.dp.total_benefit ? "Sub-optimal Heuristic" : "Optimal for this instance"}
                  </td>
                  <td className="font-bold text-sm">{comparisonResults.greedy.total_benefit}</td>
                  <td>{comparisonResults.greedy.total_cost} / {budget}</td>
                  <td>{comparisonResults.greedy.selected_projects.map((p) => p.name).join(", ")}</td>
                  <td>{comparisonResults.greedy.execution_ms} ms</td>
                </tr>
              </tbody>
            </table>
          </div>
          {comparisonResults.greedy.total_benefit < comparisonResults.dp.total_benefit && (
            <div className="mt-3 p-2 bg-danger-soft text-danger text-xs rounded border border-danger">
              Notice: The greedy ratio heuristic achieved a total benefit of {comparisonResults.greedy.total_benefit}, while Dynamic Programming and Branch & Bound proved the true maximum benefit is {comparisonResults.dp.total_benefit}. Greedy makes myopic choices based on benefit/cost ratio, which can leave stranded capacity.
            </div>
          )}
        </section>
      )}

      {/* Main Single Result Details */}
      {result && (
        <section className="algorithm-results">
          <div className="metric-grid">
            <Metric label="Total Benefit" value={result.total_benefit} detail="Objective maximized" tone="safe" />
            <Metric label="Budget Utilized" value={`${result.total_cost} / ${budget}`} detail={`${Math.round((result.total_cost / Math.max(1, budget)) * 100)}% budget allocated`} />
            <Metric label="Selected Projects" value={result.selected_projects.length} detail={`Out of ${projects.length} candidates`} />
            <Metric label="Algorithm" value={result.method.toUpperCase()} detail={`${result.execution_ms} ms`} />
          </div>

          <div className="panel data-panel">
            <h2>Allocated Project Portfolio</h2>
            <div className="edge-list my-3">
              {result.selected_projects.map((p) => (
                <span key={p.name} className="border-brand">
                  {p.name}
                  <b>Cost: {p.cost} | Benefit: {p.benefit}</b>
                </span>
              ))}
            </div>

            {result.nodes_explored !== undefined && (
              <p className="text-xs text-ink-soft">
                Branch & Bound state: <strong>{result.nodes_explored}</strong> nodes explored,{" "}
                <strong>{result.branches_pruned}</strong> branches pruned using fractional knapsack upper bound.
              </p>
            )}
            {result.table_cells !== undefined && (
              <p className="text-xs text-ink-soft">
                Dynamic programming table size: <strong>{result.table_cells}</strong> subproblem cells evaluated in O(N × W) time.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
