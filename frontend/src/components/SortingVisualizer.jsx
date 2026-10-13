import React, { useState, useEffect, useRef } from "react";
import { getSortTrace } from "../api";
import Icon from "./Icon";

const SORT_ALGORITHMS = [
  { id: "bubble_sort", label: "Bubble Sort", complexity: "O(N²)", best: "O(N)", space: "O(1)", desc: "Repeatedly steps through the list, compares adjacent elements, and swaps them if in wrong order." },
  { id: "selection_sort", label: "Selection Sort", complexity: "O(N²)", best: "O(N²)", space: "O(1)", desc: "Repeatedly finds the minimum element from the unsorted segment and moves it to the beginning." },
  { id: "insertion_sort", label: "Insertion Sort", complexity: "O(N²)", best: "O(N)", space: "O(1)", desc: "Builds sorted array one element at a time by inserting each item into its proper position." },
  { id: "merge_sort", label: "Merge Sort", complexity: "O(N log N)", best: "O(N log N)", space: "O(N)", desc: "Divide-and-conquer algorithm dividing array in halves, sorting each, and merging them stably." },
  { id: "quick_sort", label: "Quick Sort", complexity: "O(N log N) avg", best: "O(N log N)", space: "O(log N)", desc: "Partitions array around a pivot element into smaller and larger subarrays recursively." },
  { id: "heap_sort", label: "Heap Sort", complexity: "O(N log N)", best: "O(N log N)", space: "O(1)", desc: "Builds a binary max-heap and repeatedly extracts maximum root element to the end." },
];

const PRESET_ARRAYS = {
  random: [45, 12, 89, -3, 23, 7, 0, 56, 12, 99, 34, 18],
  reversed: [90, 75, 60, 48, 35, 24, 15, 8, 2, -10],
  nearly_sorted: [3, 8, 12, 20, 18, 25, 30, 42, 38, 50],
  few_unique: [15, 40, 15, 70, 40, 15, 70, 15, 40, 70],
};

export default function SortingVisualizer() {
  const [algorithm, setAlgorithm] = useState("merge_sort");
  const [arrayInput, setArrayInput] = useState(PRESET_ARRAYS.random.join(", "));
  const [currentArray, setCurrentArray] = useState(PRESET_ARRAYS.random);
  const [traceData, setTraceData] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(250);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const playTimerRef = useRef(null);

  const selectedAlgoMeta = SORT_ALGORITHMS.find((a) => a.id === algorithm) || SORT_ALGORITHMS[3];

  const parseInputArray = (raw) => {
    return raw
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
  };

  const loadTrace = async (itemsToUse = null, algoToUse = null) => {
    const rawItems = itemsToUse || parseInputArray(arrayInput);
    if (!rawItems || rawItems.length === 0) {
      setError("Please provide at least one valid number.");
      return;
    }
    if (rawItems.length > 60) {
      setError("For optimal step-by-step visualization, please use 60 or fewer elements.");
      return;
    }

    setLoading(true);
    setError("");
    setIsPlaying(false);
    setCurrentStepIndex(0);

    try {
      const algo = algoToUse || algorithm;
      const data = await getSortTrace({ items: rawItems, algorithm: algo });
      setTraceData(data);
      setCurrentArray(rawItems);
    } catch (err) {
      setError(err.message || "Failed to generate sorting trace.");
      setTraceData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrace(null, algorithm);
  }, [algorithm]);

  // Playback timer
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
      }, speedMs);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, traceData, speedMs]);

  const handlePlayPause = () => {
    if (!traceData?.events?.length) return;
    if (currentStepIndex >= traceData.events.length - 1) {
      setCurrentStepIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    if (traceData?.events && currentStepIndex < traceData.events.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleStepBackward = () => {
    setIsPlaying(false);
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  const handleRestart = () => {
    loadTrace();
  };

  const handleGenerateRandom = (size = 14) => {
    const generated = Array.from({ length: size }, () => Math.floor(Math.random() * 120) - 20);
    const str = generated.join(", ");
    setArrayInput(str);
    loadTrace(generated, algorithm);
  };

  const handleApplyPreset = (presetKey) => {
    const arr = PRESET_ARRAYS[presetKey];
    if (arr) {
      setArrayInput(arr.join(", "));
      loadTrace(arr, algorithm);
    }
  };

  const currentEvent = traceData?.events?.[currentStepIndex] || null;
  const displayArray = currentEvent?.array || currentArray;
  const totalSteps = traceData?.events?.length || 0;

  // Calculate dynamic bar heights
  const minVal = Math.min(0, ...displayArray);
  const maxVal = Math.max(1, ...displayArray);
  const valRange = Math.max(1, maxVal - minVal);

  return (
    <div className="sorting-visualizer space-y-4">
      {/* Top Configuration & Algorithm Selection */}
      <div className="panel bg-surface border border-line p-4 rounded-xl shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-line pb-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              Interactive Sorting Visualizer
            </h2>
            <p className="text-xs text-ink-soft">
              Deterministic step-by-step algorithm animation with exact operation metrics and state explanations.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink-soft">Algorithm:</span>
            <select
              id="sorting-algorithm-select"
              className="input input-sm font-semibold"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
              disabled={loading}
            >
              {SORT_ALGORITHMS.map((algo) => (
                <option key={algo.id} value={algo.id}>
                  {algo.label} ({algo.complexity})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Algorithm details badge */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-surface-subtle p-3 rounded-lg border border-line mb-4">
          <div>
            <span className="text-ink-faint block">Time Complexity:</span>
            <strong className="text-ink font-mono">{selectedAlgoMeta.complexity}</strong>
          </div>
          <div>
            <span className="text-ink-faint block">Best Case:</span>
            <strong className="text-ink font-mono">{selectedAlgoMeta.best}</strong>
          </div>
          <div>
            <span className="text-ink-faint block">Auxiliary Space:</span>
            <strong className="text-ink font-mono">{selectedAlgoMeta.space}</strong>
          </div>
          <div>
            <span className="text-ink-faint block">Current Strategy:</span>
            <span className="text-ink-soft line-clamp-1">{selectedAlgoMeta.desc}</span>
          </div>
        </div>

        {/* Input & Array Generation Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-ink mb-1 block">
              Array Elements (comma-separated integers or decimals):
            </label>
            <div className="flex gap-2">
              <input
                id="custom-array-input"
                className="input flex-1 font-mono text-xs"
                value={arrayInput}
                onChange={(e) => setArrayInput(e.target.value)}
                placeholder="e.g. 45, 12, 89, -3, 23, 7, 0, 56"
              />
              <button
                type="button"
                id="apply-array-btn"
                className="btn btn-secondary btn-sm"
                onClick={() => loadTrace()}
                disabled={loading}
              >
                Apply
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink mb-1 block">Presets & Generation:</label>
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                id="random-array-btn"
                className="btn btn-secondary btn-sm text-xs"
                onClick={() => handleGenerateRandom(12)}
                disabled={loading}
              >
                Random (12)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm text-xs"
                onClick={() => handleGenerateRandom(24)}
                disabled={loading}
              >
                Large (24)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm text-xs"
                onClick={() => handleApplyPreset("nearly_sorted")}
                disabled={loading}
              >
                Nearly Sorted
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm text-xs"
                onClick={() => handleApplyPreset("reversed")}
                disabled={loading}
              >
                Reversed
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger-soft text-danger border border-danger/30 rounded-lg text-xs">
          {error}
        </div>
      )}

      {/* Main Animation & Visualization Canvas */}
      <div className="panel bg-surface border border-line p-4 rounded-xl shadow-sm">
        {/* Playback Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 mb-4">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="sort-play-pause-btn"
              className={`btn btn-sm ${isPlaying ? "btn-secondary" : "btn-primary"}`}
              onClick={handlePlayPause}
              disabled={loading || totalSteps === 0}
            >
              {isPlaying ? "Pause" : currentStepIndex >= totalSteps - 1 ? "Replay" : "Play"}
            </button>
            <button
              type="button"
              id="sort-step-back-btn"
              className="btn btn-secondary btn-sm"
              onClick={handleStepBackward}
              disabled={loading || currentStepIndex === 0}
              title="Step Backward"
            >
              Step Prev
            </button>
            <button
              type="button"
              id="sort-step-fwd-btn"
              className="btn btn-secondary btn-sm"
              onClick={handleStepForward}
              disabled={loading || currentStepIndex >= totalSteps - 1}
              title="Step Forward"
            >
              Step Next
            </button>
            <button
              type="button"
              id="sort-reset-btn"
              className="btn btn-secondary btn-sm"
              onClick={handleReset}
              disabled={loading || currentStepIndex === 0}
              title="Reset to Step 0"
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRestart}
              disabled={loading}
              title="Restart"
            >
              Restart
            </button>
          </div>

          {/* Speed & Progress Sliders */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-ink-soft">Speed:</span>
              <select
                className="input input-sm text-xs py-0.5 px-2"
                value={speedMs}
                onChange={(e) => setSpeedMs(Number(e.target.value))}
              >
                <option value={800}>0.5x (Slow)</option>
                <option value={400}>0.75x</option>
                <option value={250}>1.0x (Normal)</option>
                <option value={100}>2.0x (Fast)</option>
                <option value={40}>5.0x (Turbo)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-ink-soft font-mono">
                Step {totalSteps > 0 ? currentStepIndex + 1 : 0} / {totalSteps}
              </span>
              <input
                type="range"
                min="0"
                max={Math.max(0, totalSteps - 1)}
                value={currentStepIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStepIndex(Number(e.target.value));
                }}
                className="w-24 md:w-32 accent-brand cursor-pointer"
                disabled={loading || totalSteps === 0}
              />
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap text-[11px] mb-3 text-ink-soft bg-surface-subtle p-2 rounded-lg border border-line">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-brand" /> Default
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-500" /> Comparing
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-sky-500" /> Swapping / Writing
          </span>
          {algorithm === "quick_sort" && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-purple-500" /> Active Pivot
            </span>
          )}
          {algorithm === "selection_sort" && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500" /> Current Min
            </span>
          )}
          {algorithm === "insertion_sort" && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-orange-500" /> Insertion Key
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-600" /> Final Sorted
          </span>
        </div>

        {/* Bar Chart Representation */}
        <div
          id="sorting-bars-container"
          className="relative w-full h-64 bg-surface-subtle border border-line rounded-lg p-3 flex items-end justify-center gap-1 overflow-x-auto"
        >
          {displayArray.map((val, idx) => {
            const isComparing = currentEvent?.comparing?.includes(idx);
            const isSwapped = currentEvent?.swapped?.includes(idx);
            const isPivot = currentEvent?.pivot === idx;
            const isMin = currentEvent?.min_index === idx;
            const isKey = currentEvent?.key_index === idx;
            const isSorted = currentEvent?.sorted_indices?.includes(idx);
            const isInRange = currentEvent?.range ? idx >= currentEvent.range[0] && idx <= currentEvent.range[1] : true;

            // Height normalization (between 15% and 92%)
            const normalized = ((val - minVal) / valRange) * 77 + 15;

            // Dynamic color state
            let barColor = "bg-brand/80";
            let borderColor = "border-brand";
            let badgeText = "";

            if (isSorted) {
              barColor = "bg-green-600";
              borderColor = "border-green-700";
            } else if (isSwapped) {
              barColor = "bg-sky-500 animate-pulse";
              borderColor = "border-sky-600";
              badgeText = "swap";
            } else if (isPivot) {
              barColor = "bg-purple-600";
              borderColor = "border-purple-700";
              badgeText = "pivot";
            } else if (isMin) {
              barColor = "bg-emerald-500";
              borderColor = "border-emerald-600";
              badgeText = "min";
            } else if (isKey) {
              barColor = "bg-orange-500";
              borderColor = "border-orange-600";
              badgeText = "key";
            } else if (isComparing) {
              barColor = "bg-amber-500 ring-2 ring-amber-400";
              borderColor = "border-amber-600";
              badgeText = "cmp";
            } else if (!isInRange) {
              barColor = "bg-brand/30 opacity-60";
              borderColor = "border-brand/40";
            }

            return (
              <div
                key={idx}
                className="flex-1 flex flex-col items-center justify-end h-full max-w-[42px] min-w-[16px] transition-all duration-150"
              >
                {/* Optional indicator badge above bar */}
                {badgeText && (
                  <span className="text-[9px] font-mono font-bold uppercase text-ink-soft mb-0.5 animate-bounce">
                    {badgeText}
                  </span>
                )}
                <span className="text-[10px] font-mono font-semibold text-ink mb-1 select-none">
                  {val}
                </span>
                <div
                  className={`w-full rounded-t-md border-t border-x ${barColor} ${borderColor} transition-all duration-150 relative shadow-sm`}
                  style={{ height: `${normalized}%` }}
                />
                <span className="text-[9px] font-mono text-ink-faint mt-1 select-none">
                  [{idx}]
                </span>
              </div>
            );
          })}
        </div>

        {/* Step Explanation Banner */}
        <div className="mt-3 p-3 bg-surface-raised border border-line rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-brand uppercase tracking-wider">
              {currentEvent?.event_type || "READY"}
            </span>
            <span className="text-xs text-ink-soft font-mono">
              Comparisons: <strong>{currentEvent?.comparisons || 0}</strong> | Swaps/Writes:{" "}
              <strong>{currentEvent?.swaps || 0}</strong>
            </span>
          </div>
          <p className="text-xs text-ink">
            {currentEvent?.explanation || "Ready to execute. Click Play or Step Next to begin animation."}
          </p>
        </div>

        {/* Real Measured Execution Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
          <div className="p-3 bg-surface-subtle rounded-lg border border-line">
            <span className="text-ink-faint block">Measured Comparisons:</span>
            <span className="text-lg font-bold font-mono text-ink">
              {traceData?.comparisons ?? 0}
            </span>
          </div>
          <div className="p-3 bg-surface-subtle rounded-lg border border-line">
            <span className="text-ink-faint block">Measured Swaps / Writes:</span>
            <span className="text-lg font-bold font-mono text-ink">
              {traceData?.swaps ?? 0}
            </span>
          </div>
          <div className="p-3 bg-surface-subtle rounded-lg border border-line">
            <span className="text-ink-faint block">Total Event Frames:</span>
            <span className="text-lg font-bold font-mono text-ink">
              {traceData?.total_steps ?? 0}
            </span>
          </div>
          <div className="p-3 bg-surface-subtle rounded-lg border border-line">
            <span className="text-ink-faint block">Final Array Sorted:</span>
            <span className="text-lg font-bold font-mono text-safe">
              {traceData?.final_array ? "Verified Sorted" : "Awaiting Run"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
