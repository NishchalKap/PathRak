import { useState } from "react";
import { runBenchmark, runSort, runBinarySearch } from "../api";
import { Metric, Notice, PageHeader } from "../components/UI";

const GRAPH_ALGORITHMS = [
  { id: "bfs", label: "Breadth-First Search (BFS)", category: "Traversal" },
  { id: "dfs", label: "Depth-First Search (DFS)", category: "Traversal" },
  { id: "dijkstra", label: "Dijkstra Shortest Path", category: "Shortest Path" },
  { id: "prim", label: "Prim's Algorithm", category: "Minimum Spanning Tree" },
  { id: "kruskal", label: "Kruskal's Algorithm (DSU)", category: "Minimum Spanning Tree" },
];

const SEQUENCE_ALGORITHMS = [
  { id: "merge_sort", label: "Merge Sort (Stable Divide & Conquer)", category: "Sorting" },
  { id: "quick_sort", label: "Quick Sort (Partitioning)", category: "Sorting" },
  { id: "heap_sort", label: "Heap Sort (Binary Heap)", category: "Sorting" },
  { id: "binary_search", label: "Binary Search (O(log N))", category: "Searching" },
];

export default function AlgorithmAnalyzerPage() {
  const [activeTab, setActiveTab] = useState("benchmark"); // "benchmark" | "sandbox"
  
  // Benchmark state
  const [selectedAlgo, setSelectedAlgo] = useState("dijkstra");
  const [size, setSize] = useState(80);
  const [density, setDensity] = useState(0.2);
  const [trials, setTrials] = useState(5);
  const [benchmarkResult, setBenchmarkResult] = useState(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState("");

  // Sandbox state (interactive sorting & binary search)
  const [sandboxInput, setSandboxInput] = useState("45, 12, 89, -3, 23, 7, 0, 56, 12, 99");
  const [sandboxSortAlgo, setSandboxSortAlgo] = useState("merge");
  const [sandboxSorted, setSandboxSorted] = useState(null);
  const [searchTarget, setSearchTarget] = useState("23");
  const [searchResult, setSearchResult] = useState(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxError, setSandboxError] = useState("");

  const isGraphAlgo = GRAPH_ALGORITHMS.some((a) => a.id === selectedAlgo);

  const runBenchmarkTest = async () => {
    setBenchmarkLoading(true);
    setBenchmarkError("");
    setBenchmarkResult(null);

    try {
      const payload = {
        algorithm: selectedAlgo,
        size: Number(size),
        density: Number(density),
        trials: Number(trials),
        seed: 42,
      };
      const data = await runBenchmark(payload);
      setBenchmarkResult(data);
    } catch (err) {
      setBenchmarkError(err.message || "Benchmark execution failed.");
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const handleSandboxSort = async () => {
    setSandboxError("");
    setSearchResult(null);
    setSandboxLoading(true);
    try {
      const numbers = sandboxInput
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
      if (numbers.length === 0) {
        throw new Error("Enter at least one valid number.");
      }
      const data = await runSort({ items: numbers, algorithm: sandboxSortAlgo });
      setSandboxSorted(data);
    } catch (err) {
      setSandboxError(err.message || "Sorting failed.");
    } finally {
      setSandboxLoading(false);
    }
  };

  const handleSandboxSearch = async () => {
    if (!sandboxSorted || !sandboxSorted.sorted_items) {
      setSandboxError("Sort the array first before executing binary search.");
      return;
    }
    const val = parseFloat(searchTarget);
    if (isNaN(val)) {
      setSandboxError("Enter a valid target number to search for.");
      return;
    }
    setSandboxLoading(true);
    setSandboxError("");
    try {
      const data = await runBinarySearch({
        items: sandboxSorted.sorted_items,
        value: val,
      });
      setSearchResult(data);
    } catch (err) {
      setSandboxError(err.message || "Binary search failed.");
    } finally {
      setSandboxLoading(false);
    }
  };

  return (
    <div className="page-stack algorithm-page">
      <PageHeader
        eyebrow="Empirical Analysis"
        title="Algorithm Analyzer & Benchmark"
        description="Empirical performance measurement and verification across graph traversal, shortest path, minimum spanning trees, sorting, and searching. Excludes network rendering latency."
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line pb-2 mb-4">
        <button
          type="button"
          className={`btn btn-sm ${activeTab === "benchmark" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("benchmark")}
        >
          Performance Benchmarks
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === "sandbox" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("sandbox")}
        >
          Sorting & Search Interactive Sandbox
        </button>
      </div>

      {activeTab === "benchmark" ? (
        <>
          <section className="panel algorithm-controls">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
              <div className="field">
                <label>Algorithm Selection</label>
                <select
                  className="input"
                  value={selectedAlgo}
                  onChange={(e) => {
                    const newAlgo = e.target.value;
                    setSelectedAlgo(newAlgo);
                    setBenchmarkResult(null);
                    if (newAlgo === "binary_search" || newAlgo.endsWith("_sort")) {
                      if (size < 100) setSize(1000);
                    } else {
                      if (size > 300) setSize(80);
                    }
                  }}
                >
                  <optgroup label="Graph Algorithms">
                    {GRAPH_ALGORITHMS.map((algo) => (
                      <option key={algo.id} value={algo.id}>
                        {algo.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Sorting & Searching">
                    {SEQUENCE_ALGORITHMS.map((algo) => (
                      <option key={algo.id} value={algo.id}>
                        {algo.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="field">
                <label>{isGraphAlgo ? "Vertex Count (V)" : "Array Size (N)"}</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max={isGraphAlgo ? 500 : 50000}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
              {isGraphAlgo ? (
                <div className="field">
                  <label>Graph Edge Density (0.0 to 1.0)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={density}
                    onChange={(e) => setDensity(e.target.value)}
                  />
                </div>
              ) : (
                <div className="field">
                  <label>Data Distribution</label>
                  <input className="input" disabled value="Random uniform integers (seed 42)" />
                </div>
              )}

              <div className="field">
                <label>Repetition Trials (for median timing)</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="50"
                  value={trials}
                  onChange={(e) => setTrials(e.target.value)}
                />
              </div>
            </div>

            <button
              className="btn btn-primary mt-2"
              onClick={runBenchmarkTest}
              disabled={benchmarkLoading}
            >
              {benchmarkLoading ? "Running Benchmark..." : "Execute Empirical Measurement"}
            </button>
          </section>

          {benchmarkError && <Notice tone="warning" title="Benchmark error">{benchmarkError}</Notice>}

          {benchmarkResult && (
            <section className="algorithm-results">
              <div className="metric-grid">
                <Metric
                  label="Median Execution"
                  value={`${benchmarkResult.median_execution_ms} ms`}
                  detail={`Over ${benchmarkResult.trials} trials`}
                  tone="safe"
                />
                <Metric
                  label={isGraphAlgo ? "Vertices (V)" : "Array Elements (N)"}
                  value={isGraphAlgo ? benchmarkResult.dataset.nodes.length : benchmarkResult.dataset.size}
                  detail={isGraphAlgo ? `${benchmarkResult.dataset.edges} edges generated` : "Seed 42 reproducible"}
                />
                <Metric
                  label="Theoretical Complexity"
                  value={benchmarkResult.theoretical_complexity}
                  detail="Asymptotic upper bound"
                />
                <Metric
                  label="Algorithm"
                  value={benchmarkResult.algorithm.toUpperCase()}
                  detail="PathRak engine"
                />
              </div>

              <section className="panel data-panel">
                <h2>Analysis & Metrics Summary</h2>
                <p className="text-xs text-ink-soft mb-3">
                  Measurements are taken using high-resolution monotonic timers directly within Python. Execution excludes JSON serialization and browser rendering.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                  {Object.entries(benchmarkResult.metrics || {}).map(([key, val]) => (
                    <div key={key} className="p-2 bg-surface-subtle rounded border border-line">
                      <span className="text-ink-soft block uppercase text-[10px]">{key.replace(/_/g, " ")}</span>
                      <strong className="text-sm">{typeof val === "number" ? val.toLocaleString() : String(val)}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          )}
        </>
      ) : (
        /* Sandbox Tab */
        <section className="panel data-panel">
          <h2>Interactive Sorting & Binary Search Sandbox</h2>
          <p className="text-xs text-ink-soft mb-3">
            Test PathRak's sorting engines on custom datasets and execute Binary Search on the verified sorted sequence.
          </p>

          <div className="field mb-3">
            <label>Input Array (comma-separated numbers)</label>
            <input
              className="input font-mono"
              value={sandboxInput}
              onChange={(e) => setSandboxInput(e.target.value)}
              placeholder="e.g. 5, -2, 10, 3, 8"
            />
          </div>

          <div className="flex gap-2 items-center mb-4 flex-wrap">
            <label className="text-xs font-semibold">Sorting Algorithm:</label>
            <select
              className="input w-40 text-xs py-1"
              value={sandboxSortAlgo}
              onChange={(e) => setSandboxSortAlgo(e.target.value)}
            >
              <option value="merge">Merge Sort (Stable)</option>
              <option value="quick">Quick Sort</option>
              <option value="heap">Heap Sort</option>
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSandboxSort}
              disabled={sandboxLoading}
            >
              Sort Array
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const rand = Array.from({ length: 15 }, () => Math.floor(Math.random() * 200) - 100);
                setSandboxInput(rand.join(", "));
              }}
            >
              Generate Random 15
            </button>
          </div>

          {sandboxError && <Notice tone="warning" title="Sandbox error">{sandboxError}</Notice>}

          {sandboxSorted && (
            <div className="p-3 bg-surface-subtle rounded border border-line mb-4">
              <div className="flex justify-between items-center mb-1 text-xs">
                <strong>Sorted Output ({sandboxSorted.algorithm.toUpperCase()}):</strong>
                <span className="text-safe font-semibold">{sandboxSorted.execution_ms} ms</span>
              </div>
              <p className="font-mono text-xs break-all bg-surface p-2 rounded border border-line">
                [{sandboxSorted.sorted_items.join(", ")}]
              </p>

              {/* Binary Search Section */}
              <div className="mt-4 pt-3 border-t border-line">
                <strong className="text-xs block mb-2">Binary Search Verification:</strong>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="input w-32 py-1 text-xs"
                    placeholder="Search value"
                    value={searchTarget}
                    onChange={(e) => setSearchTarget(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleSandboxSearch}
                    disabled={sandboxLoading}
                  >
                    Execute Binary Search
                  </button>
                </div>

                {searchResult && (
                  <div className="mt-2 text-xs">
                    {searchResult.found ? (
                      <p className="text-safe font-semibold">
                        ✓ Value {searchTarget} found at 0-based index {searchResult.index} in the sorted array!
                      </p>
                    ) : (
                      <p className="text-caution font-semibold">
                        ✗ Value {searchTarget} is not present in the array (binary search returned index -1).
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
