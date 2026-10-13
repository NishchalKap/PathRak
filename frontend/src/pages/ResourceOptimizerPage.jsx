import { useState } from "react";
import { optimizeResources } from "../api";
import { Metric, Notice, PageHeader } from "../components/UI";
import Icon from "../components/Icon";

const PRESET_MUNICIPAL = [
  { id: "1", name: "Smart Street Lighting Grid", cost: 18, benefit: 32, category: "Lighting" },
  { id: "2", name: "Raised Pedestrian Crossings", cost: 12, benefit: 20, category: "Pedestrian" },
  { id: "3", name: "CCTV & Emergency SOS Posts", cost: 20, benefit: 28, category: "Surveillance" },
  { id: "4", name: "Footpath Pavement Repair", cost: 10, benefit: 18, category: "Pedestrian" },
  { id: "5", name: "Emergency Transit Call Boxes", cost: 15, benefit: 25, category: "Emergency" },
];

const PRESET_GREEDY_COUNTEREXAMPLE = [
  { id: "1", name: "High-Ratio Asset (Ratio 2.0)", cost: 30, benefit: 60, category: "Heuristic Trap" },
  { id: "2", name: "Complementary Asset A (Ratio 1.8)", cost: 25, benefit: 45, category: "Optimal Set" },
  { id: "3", name: "Complementary Asset B (Ratio 1.8)", cost: 25, benefit: 45, category: "Optimal Set" },
];

const PRESET_BALANCED = [
  { id: "1", name: "Indiranagar Safety Hub", cost: 14, benefit: 28, category: "Zone Hub" },
  { id: "2", name: "Koramangala Patrol Kiosk", cost: 16, benefit: 30, category: "Patrol" },
  { id: "3", name: "Cubbon Park Walkway Sensors", cost: 8, benefit: 15, category: "Sensors" },
  { id: "4", name: "MG Road Light Retrofits", cost: 11, benefit: 22, category: "Lighting" },
  { id: "5", name: "Brigade Road Speed Calming", cost: 9, benefit: 16, category: "Traffic" },
  { id: "6", name: "Residency Road Help Booth", cost: 12, benefit: 19, category: "Emergency" },
];

export default function ResourceOptimizerPage() {
  const [projects, setProjects] = useState(PRESET_MUNICIPAL);
  const [budget, setBudget] = useState(40);
  const [method, setMethod] = useState("all"); // "all" | "dp" | "branch_and_bound" | "greedy"
  const [result, setResult] = useState(null);
  const [comparisonResults, setComparisonResults] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Add Item form state
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("10");
  const [newBenefit, setNewBenefit] = useState("15");
  const [newCategory, setNewCategory] = useState("Safety");

  // Inline editing state: editingId -> { name, cost, benefit, category }
  const [editingId, setEditingId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  const loadPreset = (type) => {
    setError("");
    setResult(null);
    setComparisonResults(null);
    setEditingId(null);
    if (type === "municipal") {
      setProjects(PRESET_MUNICIPAL);
      setBudget(40);
    } else if (type === "greedy_fail") {
      setProjects(PRESET_GREEDY_COUNTEREXAMPLE);
      setBudget(50);
    } else if (type === "balanced") {
      setProjects(PRESET_BALANCED);
      setBudget(45);
    }
  };

  const resetProjects = () => {
    loadPreset("municipal");
  };

  const handleAddProject = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError("Please provide a valid project name.");
      return;
    }
    const c = parseInt(newCost, 10);
    const b = parseInt(newBenefit, 10);
    if (isNaN(c) || isNaN(b) || c < 0 || b < 0) {
      setError("Project cost/weight and value/benefit must be non-negative integers.");
      return;
    }
    if (projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setError(`A project with the name "${name}" already exists.`);
      return;
    }

    const newProject = {
      id: String(Date.now()),
      name,
      cost: c,
      benefit: b,
      category: newCategory.trim() || "Infrastructure",
    };
    setProjects([...projects, newProject]);
    setNewName("");
    setNewCost("10");
    setNewBenefit("15");
    setError("");
    setResult(null);
    setComparisonResults(null);
  };

  const removeProject = (id) => {
    setProjects(projects.filter((p) => p.id !== id));
    setResult(null);
    setComparisonResults(null);
  };

  const startEditRow = (project) => {
    setEditingId(project.id);
    setEditRowData({
      name: project.name,
      cost: String(project.cost),
      benefit: String(project.benefit),
      category: project.category || "General",
    });
  };

  const saveEditRow = () => {
    const name = editRowData.name?.trim();
    const c = parseInt(editRowData.cost, 10);
    const b = parseInt(editRowData.benefit, 10);

    if (!name) {
      setError("Project name cannot be empty.");
      return;
    }
    if (isNaN(c) || isNaN(b) || c < 0 || b < 0) {
      setError("Cost and benefit must be non-negative integers.");
      return;
    }

    setProjects(
      projects.map((p) =>
        p.id === editingId
          ? {
              ...p,
              name,
              cost: c,
              benefit: b,
              category: editRowData.category?.trim() || "General",
            }
          : p
      )
    );
    setEditingId(null);
    setEditRowData({});
    setError("");
    setResult(null);
    setComparisonResults(null);
  };

  const cancelEditRow = () => {
    setEditingId(null);
    setEditRowData({});
  };

  const runOptimization = async () => {
    const b = parseInt(budget, 10);
    if (isNaN(b) || b < 0) {
      setError("Budget capacity must be a non-negative integer.");
      return;
    }
    if (projects.length === 0) {
      setError("Please add at least one candidate project before optimizing.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setComparisonResults(null);

    const payloadProjects = projects.map((p) => ({
      name: p.name,
      cost: p.cost,
      benefit: p.benefit,
      category: p.category,
    }));

    try {
      if (method === "all") {
        const [resDp, resBnB, resGreedy] = await Promise.all([
          optimizeResources({ projects: payloadProjects, budget: b, method: "dp" }),
          optimizeResources({ projects: payloadProjects, budget: b, method: "branch_and_bound" }),
          optimizeResources({ projects: payloadProjects, budget: b, method: "greedy" }),
        ]);
        setComparisonResults({
          dp: resDp,
          bnb: resBnB,
          greedy: resGreedy,
        });
        setResult(resDp);
      } else {
        const res = await optimizeResources({ projects: payloadProjects, budget: b, method });
        setResult(res);
      }
    } catch (err) {
      setError(err.message || "Optimization failed.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to check if a project was selected in the active result
  const isSelectedInResult = (projectName) => {
    if (!result?.selected_projects) return false;
    return result.selected_projects.some((p) => p.name === projectName);
  };

  return (
    <div className="page-stack algorithm-page space-y-5">
      <PageHeader
        eyebrow="Resource & Budget Planning"
        title="Capital Budget Optimizer"
        description="Constrained resource-allocation solver solving the 0/1 Knapsack optimization problem using exact Dynamic Programming, Branch & Bound pruning, and Greedy heuristic ratio analysis."
      />

      {/* Control Configuration Panel */}
      <section className="panel bg-surface border border-line p-4 rounded-xl shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-line pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              Optimization Configuration
            </h3>
            <p className="text-xs text-ink-soft">
              Configure available capital limit and algorithm model.
            </p>
          </div>

          {/* Dataset Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-ink-faint mr-1">Presets:</span>
            <button
              type="button"
              id="preset-municipal-btn"
              className="btn btn-secondary btn-sm text-xs"
              onClick={() => loadPreset("municipal")}
              disabled={loading}
            >
              Municipal Safety (Cap 40)
            </button>
            <button
              type="button"
              id="preset-greedy-fail-btn"
              className="btn btn-secondary btn-sm text-xs"
              onClick={() => loadPreset("greedy_fail")}
              disabled={loading}
              title="Demonstrates greedy ratio picking suboptimal asset"
            >
              Greedy Heuristic Failure Case (Budget ₹50)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm text-xs"
              onClick={() => loadPreset("balanced")}
              disabled={loading}
            >
              Balanced Portfolio (Cap 45)
            </button>
            <button
              type="button"
              id="reset-projects-btn"
              className="btn btn-secondary btn-sm text-xs"
              onClick={resetProjects}
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="budget-capacity-input" className="text-xs font-semibold text-ink mb-1 block">
              Budget Capacity (W / Cost Limit):
            </label>
            <input
              id="budget-capacity-input"
              type="number"
              min="0"
              className="input w-full font-mono text-sm font-bold"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="optimization-method-select" className="text-xs font-semibold text-ink mb-1 block">
              Allocation Algorithm:
            </label>
            <select
              id="optimization-method-select"
              className="input w-full text-xs font-semibold"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={loading}
            >
              <option value="all">Compare All 3 (DP, Branch & Bound, Greedy)</option>
              <option value="dp">0/1 Knapsack Dynamic Programming (Exact Optimal)</option>
              <option value="branch_and_bound">Branch & Bound (Exact with Pruning)</option>
              <option value="greedy">Greedy Benefit/Cost Ratio (Heuristic)</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              id="execute-optimization-btn"
              className="btn btn-primary w-full"
              onClick={runOptimization}
              disabled={loading}
            >
              {loading ? "Computing Solution..." : "Run Budget Optimization"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="p-3 bg-danger-soft text-danger border border-danger/30 rounded-lg text-xs">
          {error}
        </div>
      )}

      {/* Candidate Items / Projects Table */}
      <section className="panel bg-surface border border-line p-4 rounded-xl shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-ink">
              Candidate Resource Portfolio ({projects.length} Items)
            </h3>
            <p className="text-xs text-ink-soft">
              Editable parameters. Each asset may be allocated either 0 or 1 time (no fractional splitting).
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table id="projects-table" className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-line text-ink-soft bg-surface-subtle">
                <th className="py-2.5 px-3 font-semibold">Item Name</th>
                <th className="py-2.5 px-3 font-semibold">Category</th>
                <th className="py-2.5 px-3 font-semibold text-right">Cost / Weight</th>
                <th className="py-2.5 px-3 font-semibold text-right">Benefit / Value</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ratio (Value/Cost)</th>
                <th className="py-2.5 px-3 font-semibold text-center">Status in Solution</th>
                <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {projects.map((p) => {
                const isEditing = editingId === p.id;
                const selected = result && isSelectedInResult(p.name);
                const ratio = p.cost > 0 ? (p.benefit / p.cost).toFixed(2) : "inf";

                if (isEditing) {
                  return (
                    <tr key={p.id} className="bg-brand-soft/20">
                      <td className="py-2 px-3">
                        <input
                          className="input input-sm text-xs w-full font-semibold"
                          value={editRowData.name}
                          onChange={(e) => setEditRowData({ ...editRowData, name: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          className="input input-sm text-xs w-28"
                          value={editRowData.category}
                          onChange={(e) => setEditRowData({ ...editRowData, category: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          className="input input-sm text-xs w-20 text-right font-mono"
                          value={editRowData.cost}
                          onChange={(e) => setEditRowData({ ...editRowData, cost: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          className="input input-sm text-xs w-20 text-right font-mono"
                          value={editRowData.benefit}
                          onChange={(e) => setEditRowData({ ...editRowData, benefit: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3 text-right text-ink-faint font-mono">—</td>
                      <td className="py-2 px-3 text-center text-ink-faint text-[11px]">Editing</td>
                      <td className="py-2 px-3 text-right space-x-1">
                        <button
                          type="button"
                          className="btn btn-primary btn-xs text-[10px]"
                          onClick={saveEditRow}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs text-[10px]"
                          onClick={cancelEditRow}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-surface-subtle transition-colors ${
                      selected ? "bg-safe-soft/30 font-medium" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 text-ink font-semibold">
                      {p.name}
                    </td>
                    <td className="py-2.5 px-3 text-ink-soft">
                      <span className="px-1.5 py-0.5 rounded bg-surface-subtle border border-line text-[10px]">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                      {p.cost}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-brand">
                      {p.benefit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-soft">
                      {ratio}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {result ? (
                        selected ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-safe bg-safe-soft px-2 py-0.5 rounded border border-safe/30">
                            ✓ Selected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint bg-surface-subtle px-2 py-0.5 rounded border border-line">
                            Rejected
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1">
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs text-[11px]"
                        onClick={() => startEditRow(p)}
                        disabled={loading}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs text-[11px] text-danger hover:bg-danger-soft"
                        onClick={() => removeProject(p.id)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add Project Inline Form */}
        <form
          onSubmit={handleAddProject}
          className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-line text-xs bg-surface-subtle p-3 rounded-lg"
        >
          <strong className="text-ink mr-1">Add Candidate:</strong>
          <input
            id="new-project-name"
            className="input input-sm flex-1 min-w-[140px]"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            id="new-project-cost"
            type="number"
            min="0"
            className="input input-sm w-20 font-mono"
            placeholder="Cost"
            value={newCost}
            onChange={(e) => setNewCost(e.target.value)}
          />
          <input
            id="new-project-benefit"
            type="number"
            min="0"
            className="input input-sm w-20 font-mono"
            placeholder="Benefit"
            value={newBenefit}
            onChange={(e) => setNewBenefit(e.target.value)}
          />
          <input
            id="new-project-category"
            className="input input-sm w-28"
            placeholder="Category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button type="submit" id="add-project-btn" className="btn btn-secondary btn-sm font-semibold">
            Add
          </button>
        </form>
      </section>

      {/* Comparison Matrix when 'all' is run */}
      {comparisonResults && (
        <section className="panel bg-surface border border-line p-4 rounded-xl shadow-sm">
          <div className="border-b border-line pb-2 mb-3">
            <h3 className="text-sm font-bold text-ink">
              Comparative Algorithmic Benchmark (Budget Capacity: {budget})
            </h3>
            <p className="text-xs text-ink-soft">
              Direct comparison of exact combinatorial solvers versus the greedy heuristic approximation.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-line text-ink-soft bg-surface-subtle">
                  <th className="py-2.5 px-3">Algorithmic Method</th>
                  <th className="py-2.5 px-3">Optimality Proof</th>
                  <th className="py-2.5 px-3 text-right">Total Value / Benefit</th>
                  <th className="py-2.5 px-3 text-right">Budget Utilized</th>
                  <th className="py-2.5 px-3 text-right">Remaining Capacity</th>
                  <th className="py-2.5 px-3">Selected Assets</th>
                  <th className="py-2.5 px-3 text-right">Execution Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr className="border-b border-line">
                  <td className="py-2.5 px-3 font-bold text-ink">0/1 Knapsack DP</td>
                  <td className="py-2.5 px-3 text-safe font-semibold">Guaranteed Optimal</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-base text-brand">
                    {comparisonResults.dp.total_benefit}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                    {comparisonResults.dp.total_cost} / {budget}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink-soft">
                    {budget - comparisonResults.dp.total_cost}
                  </td>
                  <td className="py-2.5 px-3 text-ink-soft">
                    {comparisonResults.dp.selected_projects.map((p) => p.name).join(", ")}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink-soft">
                    {comparisonResults.dp.execution_ms} ms
                  </td>
                </tr>

                <tr className="border-b border-line">
                  <td className="py-2.5 px-3 font-bold text-ink">Branch & Bound</td>
                  <td className="py-2.5 px-3 text-safe font-semibold">Guaranteed Optimal</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-base text-brand">
                    {comparisonResults.bnb.total_benefit}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                    {comparisonResults.bnb.total_cost} / {budget}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink-soft">
                    {budget - comparisonResults.bnb.total_cost}
                  </td>
                  <td className="py-2.5 px-3 text-ink-soft">
                    {comparisonResults.bnb.selected_projects.map((p) => p.name).join(", ")}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink-soft">
                    {comparisonResults.bnb.execution_ms} ms
                  </td>
                </tr>

                <tr>
                  <td className="py-2.5 px-3 font-bold text-ink">Greedy Ratio Heuristic</td>
                  <td className="py-2.5 px-3 font-semibold">
                    {comparisonResults.greedy.total_benefit < comparisonResults.dp.total_benefit ? (
                      <span className="text-danger">Suboptimal Heuristic Trap</span>
                    ) : (
                      <span className="text-safe">Matched Optimal</span>
                    )}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono font-bold text-base ${
                      comparisonResults.greedy.total_benefit < comparisonResults.dp.total_benefit
                        ? "text-danger"
                        : "text-brand"
                    }`}
                  >
                    {comparisonResults.greedy.total_benefit}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                    {comparisonResults.greedy.total_cost} / {budget}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink-soft">
                    {budget - comparisonResults.greedy.total_cost}
                  </td>
                  <td className="py-2.5 px-3 text-ink-soft">
                    {comparisonResults.greedy.selected_projects.map((p) => p.name).join(", ")}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink-soft">
                    {comparisonResults.greedy.execution_ms} ms
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {comparisonResults.greedy.total_benefit < comparisonResults.dp.total_benefit && (
            <div className="mt-3 p-3 bg-danger-soft text-danger text-xs rounded-lg border border-danger/30 leading-relaxed">
              <strong>Educational Theoretical Note:</strong> The greedy benefit/cost ratio heuristic achieved an objective value of{" "}
              <strong>{comparisonResults.greedy.total_benefit}</strong>, whereas Dynamic Programming and Branch & Bound proved the true mathematical optimum is{" "}
              <strong>{comparisonResults.dp.total_benefit}</strong>. Greedy prioritizes the single largest ratio element first, creating stranded unfillable capacity.
            </div>
          )}
        </section>
      )}

      {/* Main Single Solution Details */}
      {result && (
        <section className="algorithm-results">
          <div className="metric-grid">
            <Metric
              label="Total Maximized Benefit"
              value={result.total_benefit}
              detail="Total portfolio utility score"
              tone="safe"
            />
            <Metric
              label="Budget Allocated"
              value={`${result.total_cost} / ${budget}`}
              detail={`Remaining Capacity: ${budget - result.total_cost} units`}
            />
            <Metric
              label="Allocated Assets"
              value={`${result.selected_projects.length} of ${projects.length}`}
              detail={`${Math.round((result.selected_projects.length / Math.max(1, projects.length)) * 100)}% project acceptance`}
            />
            <Metric
              label="Algorithm Solver"
              value={result.method.toUpperCase()}
              detail={`${result.execution_ms} ms computation time`}
            />
          </div>

          {/* Detailed Selected vs Rejected Breakdown */}
          <div className="panel bg-surface border border-line p-4 rounded-xl shadow-sm mt-3">
            <h3 className="text-sm font-bold text-ink mb-1">
              Final Resource Allocation Portfolio
            </h3>
            <p className="text-xs text-ink-soft mb-3">
              Detailed breakdown of items accepted into the optimal capacity envelope versus items rejected due to budget constraints.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Selected List */}
              <div className="p-3 bg-surface-subtle border border-safe/30 rounded-lg">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                  <span className="text-xs font-bold text-safe uppercase">
                    Accepted Into Solution ({result.selected_projects.length})
                  </span>
                  <span className="text-xs font-mono font-bold text-safe">
                    Cost: {result.total_cost} | Value: {result.total_benefit}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {result.selected_projects.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-surface rounded border border-line flex justify-between items-center text-xs"
                    >
                      <div>
                        <strong className="text-ink block">{p.name}</strong>
                        <span className="text-[10px] text-ink-faint">{p.category}</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-ink block">Cost: {p.cost}</span>
                        <span className="text-brand font-bold">Benefit: {p.benefit}</span>
                      </div>
                    </div>
                  ))}
                  {result.selected_projects.length === 0 && (
                    <p className="text-xs text-ink-faint italic py-2">No projects could fit within budget.</p>
                  )}
                </div>
              </div>

              {/* Rejected List */}
              <div className="p-3 bg-surface-subtle border border-line rounded-lg">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                  <span className="text-xs font-bold text-ink-soft uppercase">
                    Rejected Due to Capacity ({projects.length - result.selected_projects.length})
                  </span>
                  <span className="text-xs font-mono text-ink-faint">
                    Capacity Slack: {budget - result.total_cost}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {projects
                    .filter((p) => !isSelectedInResult(p.name))
                    .map((p, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-surface/60 rounded border border-line flex justify-between items-center text-xs opacity-75"
                      >
                        <div>
                          <span className="text-ink-soft block">{p.name}</span>
                          <span className="text-[10px] text-ink-faint">{p.category}</span>
                        </div>
                        <div className="text-right font-mono text-ink-faint">
                          <span className="block">Cost: {p.cost}</span>
                          <span>Benefit: {p.benefit}</span>
                        </div>
                      </div>
                    ))}
                  {projects.length === result.selected_projects.length && (
                    <p className="text-xs text-safe font-semibold py-2">All candidate projects were allocated!</p>
                  )}
                </div>
              </div>
            </div>

            {/* Complexity & Subproblem Execution Notes */}
            <div className="mt-4 pt-3 border-t border-line text-xs text-ink-soft">
              {result.table_cells !== undefined && (
                <p>
                  <strong>DP Table Dimension:</strong> Evaluated exactly {result.table_cells.toLocaleString()}{" "}
                  subproblem cells (size (N+1) × (W+1)) in pseudo-polynomial O(N × W) time.
                </p>
              )}
              {result.nodes_explored !== undefined && (
                <p>
                  <strong>State-Space Tree:</strong> Explored {result.nodes_explored} decision nodes; pruned{" "}
                  {result.branches_pruned} suboptimal branches via linear relaxation upper bounding.
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
