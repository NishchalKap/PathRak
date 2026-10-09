import { useState } from "react";
import { runBenchmark } from "../api";
import { Metric, Notice, PageHeader } from "../components/UI";

export default function AlgorithmAnalyzerPage() {
  const [algorithm, setAlgorithm] = useState("dijkstra"), [size, setSize] = useState(80), [density, setDensity] = useState(.15), [trials, setTrials] = useState(7), [result, setResult] = useState(null), [error, setError] = useState("");
  const run = async () => { setError(""); try { setResult(await runBenchmark({ algorithm, size: Number(size), density: Number(density), trials: Number(trials), seed: 42 })); } catch (err) { setError(err.message); } };
  return <div className="page-stack algorithm-page"><PageHeader eyebrow="Measured performance" title="Algorithm analyzer" description="Repeatable synthetic graphs use seed 42. Generation and rendering time are excluded; the median measures PathRak algorithm execution only." />
    <section className="panel algorithm-controls analyzer-controls"><div className="field"><label>Algorithm</label><select className="input" value={algorithm} onChange={e => setAlgorithm(e.target.value)}>{["bfs", "dfs", "dijkstra", "prim", "kruskal"].map(name => <option key={name}>{name}</option>)}</select></div><div className="field"><label>Vertices</label><input className="input" type="number" min="1" max="500" value={size} onChange={e => setSize(e.target.value)} /></div><div className="field"><label>Density</label><input className="input" type="number" min="0" max="1" step=".05" value={density} onChange={e => setDensity(e.target.value)} /></div><div className="field"><label>Trials</label><input className="input" type="number" min="1" max="50" value={trials} onChange={e => setTrials(e.target.value)} /></div><button className="btn btn-primary" onClick={run}>Measure</button></section>
    {error && <Notice tone="warning" title="Benchmark failed">{error}</Notice>}
    {result && <section className="algorithm-results"><div className="metric-grid"><Metric label="Median execution" value={`${result.median_execution_ms} ms`} /><Metric label="Vertices" value={result.dataset.nodes.length} /><Metric label="Edges" value={result.dataset.edges} /><Metric label="Trials" value={result.trials} /></div><section className="panel data-panel"><h2>Interpretation</h2><p>Theoretical complexity: <strong>{result.theoretical_complexity}</strong>. Observed time depends on this machine and graph shape; it is not a universal performance claim.</p><pre>{JSON.stringify(result.metrics, null, 2)}</pre></section></section>}
  </div>;
}
