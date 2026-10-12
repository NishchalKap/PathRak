import { useState } from "react";
import {
  runBenchmark,
  runSort,
  runBinarySearch,
  runMinMax,
  runFractionalKnapsack,
  runLcs,
  runLis,
  runMatrixChain,
  runGraphColoring,
  runNQueens,
} from "../api";
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
  const [activeTab, setActiveTab] = useState("benchmark"); // "benchmark" | "sandbox" | "syllabus"
  
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

  // Syllabus Lab state
  const [minMaxInput, setMinMaxInput] = useState("3, 9, -2, 14, 0, 8, 22, -10");
  const [minMaxResult, setMinMaxResult] = useState(null);
  const [knapsackCap, setKnapsackCap] = useState("50");
  const [knapsackResult, setKnapsackResult] = useState(null);
  const [lcsStr1, setLcsStr1] = useState("ABCBDAB");
  const [lcsStr2, setLcsStr2] = useState("BDCAB");
  const [lcsResult, setLcsResult] = useState(null);
  const [lisInput, setLisInput] = useState("10, 22, 9, 33, 21, 50, 41, 60, 80");
  const [lisResult, setLisResult] = useState(null);
  const [matrixDimInput, setMatrixDimInput] = useState("10, 20, 30, 40");
  const [matrixResult, setMatrixResult] = useState(null);
  const [nQueensVal, setNQueensVal] = useState("4");
  const [nQueensResult, setNQueensResult] = useState(null);
  const [coloringResult, setColoringResult] = useState(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);

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
        <button
          type="button"
          className={`btn btn-sm ${activeTab === "syllabus" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("syllabus")}
        >
          DAA Syllabus Laboratory (CLRS)
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
      ) : activeTab === "sandbox" ? (
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
      ) : (
        /* DAA Syllabus Laboratory Tab */
        <section className="panel syllabus-lab space-y-6">
          <div className="border-b border-line pb-3">
            <h2 className="text-base font-bold">DAA Syllabus Educational Laboratory</h2>
            <p className="text-xs text-ink-soft">
              Interactive demonstrations for Divide & Conquer, Greedy, Dynamic Programming, and Backtracking algorithms implemented in PathRak's core engine.
            </p>
          </div>

          {/* 1. Divide & Conquer Min-Max */}
          <div className="bg-surface-subtle p-4 rounded-lg border border-line">
            <h3 className="text-sm font-semibold mb-1">1. Divide & Conquer Min-Max Finding</h3>
            <p className="text-xs text-ink-soft mb-3">
              Computes both minimum and maximum simultaneously using ~ 3N/2 - 2 comparisons instead of 2N - 2.
            </p>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                className="input text-xs font-mono w-72"
                value={minMaxInput}
                onChange={(e) => setMinMaxInput(e.target.value)}
                placeholder="Comma separated numbers"
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  setSyllabusLoading(true);
                  try {
                    const nums = minMaxInput.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
                    const res = await runMinMax({ items: nums });
                    setMinMaxResult(res);
                  } catch (e) {
                    alert(e.message);
                  } finally {
                    setSyllabusLoading(false);
                  }
                }}
                disabled={syllabusLoading}
              >
                Run Min-Max D&C
              </button>
            </div>
            {minMaxResult && (
              <div className="mt-3 p-2 bg-surface rounded border border-line text-xs grid grid-cols-3 gap-2">
                <span>Minimum: <strong className="text-safe">{minMaxResult.minimum}</strong></span>
                <span>Maximum: <strong className="text-brand">{minMaxResult.maximum}</strong></span>
                <span>Comparisons: <strong>{minMaxResult.comparisons}</strong></span>
              </div>
            )}
          </div>

          {/* 2. Greedy Fractional Knapsack */}
          <div className="bg-surface-subtle p-4 rounded-lg border border-line">
            <h3 className="text-sm font-semibold mb-1">2. Greedy Fractional Knapsack</h3>
            <p className="text-xs text-ink-soft mb-3">
              Sorts items by value/weight ratio descending. Items can be taken fractionally to maximize total value.
            </p>
            <div className="flex gap-2 items-center mb-3">
              <label className="text-xs">Capacity:</label>
              <input
                type="number"
                className="input w-24 text-xs"
                value={knapsackCap}
                onChange={(e) => setKnapsackCap(e.target.value)}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  setSyllabusLoading(true);
                  try {
                    const sampleItems = [
                      { name: "Electronics", weight: 10, value: 60 },
                      { name: "Medical Kits", weight: 20, value: 100 },
                      { name: "Rations", weight: 30, value: 120 },
                    ];
                    const res = await runFractionalKnapsack({ items: sampleItems, capacity: parseFloat(knapsackCap) });
                    setKnapsackResult(res);
                  } catch (e) {
                    alert(e.message);
                  } finally {
                    setSyllabusLoading(false);
                  }
                }}
                disabled={syllabusLoading}
              >
                Run Fractional Knapsack
              </button>
            </div>
            {knapsackResult && (
              <div className="p-2 bg-surface rounded border border-line text-xs">
                <p className="font-semibold text-safe mb-2">Total Optimal Value: ₹{knapsackResult.total_value}</p>
                <div className="space-y-1">
                  {knapsackResult.items_taken.map((item, idx) => (
                    <div key={idx} className="flex justify-between border-b border-line py-1">
                      <span>{item.name}</span>
                      <span>Fraction taken: <strong>{(item.fraction * 100).toFixed(1)}%</strong> ({item.weight_taken} kg, ₹{item.value_taken})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. Dynamic Programming: LCS & LIS */}
          <div className="bg-surface-subtle p-4 rounded-lg border border-line">
            <h3 className="text-sm font-semibold mb-1">3. Dynamic Programming: LCS & LIS</h3>
            <p className="text-xs text-ink-soft mb-3">
              Longest Common Subsequence (CLRS Ch. 15) and Longest Increasing Subsequence table construction.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <strong className="text-xs block mb-1">Longest Common Subsequence (LCS):</strong>
                <div className="flex gap-2 mb-2">
                  <input className="input text-xs w-28" value={lcsStr1} onChange={(e) => setLcsStr1(e.target.value)} placeholder="String 1" />
                  <input className="input text-xs w-28" value={lcsStr2} onChange={(e) => setLcsStr2(e.target.value)} placeholder="String 2" />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      const res = await runLcs({ x: lcsStr1, y: lcsStr2 });
                      setLcsResult(res);
                    }}
                  >
                    Solve LCS
                  </button>
                </div>
                {lcsResult && (
                  <p className="text-xs bg-surface p-2 rounded border border-line">
                    LCS Length: <strong>{lcsResult.length}</strong> | Sequence: <strong className="text-safe">"{lcsResult.sequence}"</strong>
                  </p>
                )}
              </div>

              <div>
                <strong className="text-xs block mb-1">Longest Increasing Subsequence (LIS):</strong>
                <div className="flex gap-2 mb-2">
                  <input className="input text-xs font-mono w-44" value={lisInput} onChange={(e) => setLisInput(e.target.value)} />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      const nums = lisInput.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
                      const res = await runLis({ items: nums });
                      setLisResult(res);
                    }}
                  >
                    Solve LIS
                  </button>
                </div>
                {lisResult && (
                  <p className="text-xs bg-surface p-2 rounded border border-line">
                    LIS Length: <strong>{lisResult.length}</strong> | Sequence: <strong className="text-safe">[{lisResult.sequence.join(", ")}]</strong>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 4. Matrix Chain Multiplication */}
          <div className="bg-surface-subtle p-4 rounded-lg border border-line">
            <h3 className="text-sm font-semibold mb-1">4. Matrix Chain Multiplication (DP)</h3>
            <p className="text-xs text-ink-soft mb-3">
              Finds optimal parenthesization order to minimize scalar multiplications (CLRS Ch. 15.2).
            </p>
            <div className="flex gap-2 items-center mb-2">
              <label className="text-xs">Dimensions p:</label>
              <input className="input text-xs font-mono w-44" value={matrixDimInput} onChange={(e) => setMatrixDimInput(e.target.value)} />
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  const dims = matrixDimInput.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
                  const res = await runMatrixChain({ dimensions: dims });
                  setMatrixResult(res);
                }}
              >
                Compute Optimal Chain
              </button>
            </div>
            {matrixResult && (
              <div className="p-2 bg-surface rounded border border-line text-xs grid grid-cols-2 gap-2">
                <span>Minimum Multiplications: <strong className="text-safe">{matrixResult.min_multiplications}</strong></span>
                <span>Optimal Parenthesization: <strong className="font-mono text-brand">{matrixResult.optimal_parenthesization}</strong></span>
              </div>
            )}
          </div>

          {/* 5. Backtracking: Graph Coloring & N-Queens */}
          <div className="bg-surface-subtle p-4 rounded-lg border border-line">
            <h3 className="text-sm font-semibold mb-1">5. Backtracking: Graph Coloring & N-Queens</h3>
            <p className="text-xs text-ink-soft mb-3">
              State-space tree exploration with pruning and backtrack steps.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <strong className="text-xs block mb-1">N-Queens Solver:</strong>
                <div className="flex gap-2 mb-2 items-center">
                  <label className="text-xs">N:</label>
                  <input type="number" min="1" max="14" className="input text-xs w-16" value={nQueensVal} onChange={(e) => setNQueensVal(e.target.value)} />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      const res = await runNQueens({ n: parseInt(nQueensVal) });
                      setNQueensResult(res);
                    }}
                  >
                    Solve N-Queens
                  </button>
                </div>
                {nQueensResult && (
                  <div className="p-2 bg-surface rounded border border-line text-xs">
                    <p className="font-semibold text-safe mb-1">
                      {nQueensResult.solution_found ? `✓ Solution found in ${nQueensResult.steps_explored} search steps` : "✗ No solution"}
                    </p>
                    <p className="font-mono text-xs">
                      Column positions per row: [{nQueensResult.board_positions.join(", ")}]
                    </p>
                  </div>
                )}
              </div>

              <div>
                <strong className="text-xs block mb-1">3-Coloring on 4-Vertex Graph:</strong>
                <p className="text-xs text-ink-soft mb-2">Backtracking graph color assignment ensuring adjacent vertices have distinct colors.</p>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    const sampleGraph = {
                      nodes: ["A", "B", "C", "D"],
                      edges: [
                        { source: "A", target: "B" },
                        { source: "B", target: "C" },
                        { source: "C", target: "D" },
                        { source: "A", target: "C" },
                      ],
                      max_colors: 3,
                    };
                    const res = await runGraphColoring(sampleGraph);
                    setColoringResult(res);
                  }}
                >
                  Solve 3-Coloring
                </button>
                {coloringResult && (
                  <div className="mt-2 p-2 bg-surface rounded border border-line text-xs">
                    <p className="text-safe font-semibold">✓ Colorable with 3 colors!</p>
                    <p className="font-mono text-xs mt-1">
                      {JSON.stringify(coloringResult.assigned_colors)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
