import React, { useState, useEffect, useRef } from "react";
import { getSearchTrace } from "../api";
import Icon from "./Icon";

const PRESET_SEARCH_ARRAYS = {
  sorted_standard: [2, 7, 12, 19, 23, 31, 45, 56, 68, 77, 89, 99],
  sorted_dense: [-20, -10, 0, 5, 12, 18, 24, 30, 36, 42, 50, 65, 78, 85, 92, 100],
  unsorted_sample: [45, 12, 89, -3, 23, 7, 0, 56, 99, 34],
};

export default function SearchVisualizer() {
  const [algorithm, setAlgorithm] = useState("binary_search");
  const [arrayInput, setArrayInput] = useState(PRESET_SEARCH_ARRAYS.sorted_standard.join(", "));
  const [targetInput, setTargetInput] = useState("23");
  const [currentArray, setCurrentArray] = useState(PRESET_SEARCH_ARRAYS.sorted_standard);
  const [traceData, setTraceData] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(350);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const playTimerRef = useRef(null);

  const parseInputArray = (raw) => {
    return raw
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
  };

  const isArraySorted = (arr) => {
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] > arr[i + 1]) return false;
    }
    return true;
  };

  const loadTrace = async (customItems = null, customTarget = null, customAlgo = null) => {
    const rawItems = customItems || parseInputArray(arrayInput);
    if (!rawItems || rawItems.length === 0) {
      setError("Please provide at least one valid number in the array.");
      return;
    }

    const tVal = parseFloat(customTarget !== null ? customTarget : targetInput);
    if (isNaN(tVal)) {
      setError("Please enter a valid numeric target to search for.");
      return;
    }

    const algo = customAlgo || algorithm;

    // Client-side validation check
    if (algo === "binary_search" && !isArraySorted(rawItems)) {
      setError("Binary Search requires the array to be pre-sorted in ascending order. You can click 'Sort Array Ascending' below.");
      return;
    }

    setLoading(true);
    setError("");
    setIsPlaying(false);
    setCurrentStepIndex(0);

    try {
      const data = await getSearchTrace({
        items: rawItems,
        value: tVal,
        algorithm: algo,
      });
      setTraceData(data);
      setCurrentArray(rawItems);
    } catch (err) {
      setError(err.message || "Failed to generate search trace.");
      setTraceData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrace(null, null, algorithm);
  }, [algorithm]);

  // Playback loop
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

  const handleSortArray = () => {
    const raw = parseInputArray(arrayInput);
    const sorted = [...raw].sort((a, b) => a - b);
    const str = sorted.join(", ");
    setArrayInput(str);
    setError("");
    loadTrace(sorted, targetInput, algorithm);
  };

  const handleGenerateSorted = (size = 12) => {
    const arr = [];
    let cur = Math.floor(Math.random() * 5);
    for (let i = 0; i < size; i++) {
      cur += Math.floor(Math.random() * 10) + 1;
      arr.push(cur);
    }
    const target = arr[Math.floor(Math.random() * arr.length)];
    setArrayInput(arr.join(", "));
    setTargetInput(String(target));
    loadTrace(arr, target, algorithm);
  };

  const currentEvent = traceData?.events?.[currentStepIndex] || null;
  const totalSteps = traceData?.events?.length || 0;
  const displayArray = currentArray;

  return (
    <div className="search-visualizer space-y-4">
      {/* Top Configuration */}
      <div className="panel bg-surface border border-line p-4 rounded-xl shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-line pb-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              Interactive Searching Visualizer
            </h2>
            <p className="text-xs text-ink-soft">
              Step-by-step search execution demonstrating interval halving (Binary Search) and sequential scanning (Linear Search).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink-soft">Search Algorithm:</span>
            <select
              id="search-algorithm-select"
              className="input input-sm font-semibold"
              value={algorithm}
              onChange={(e) => {
                const newAlgo = e.target.value;
                setAlgorithm(newAlgo);
              }}
              disabled={loading}
            >
              <option value="binary_search">Binary Search (O(log N))</option>
              <option value="linear_search">Linear Search (O(N))</option>
            </select>
          </div>
        </div>

        {/* Algorithm details card */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-surface-subtle p-3 rounded-lg border border-line mb-4">
          <div>
            <span className="text-ink-faint block">Time Complexity:</span>
            <strong className="text-ink font-mono">
              {algorithm === "binary_search" ? "O(log N)" : "O(N)"}
            </strong>
          </div>
          <div>
            <span className="text-ink-faint block">Precondition:</span>
            <strong className={algorithm === "binary_search" ? "text-brand" : "text-ink"}>
              {algorithm === "binary_search" ? "Array MUST be sorted" : "None (arbitrary order)"}
            </strong>
          </div>
          <div>
            <span className="text-ink-faint block">Comparison Strategy:</span>
            <span className="text-ink-soft">
              {algorithm === "binary_search" ? "Divide & conquer interval halving" : "Sequential 1-by-1 inspection"}
            </span>
          </div>
          <div>
            <span className="text-ink-faint block">Space Complexity:</span>
            <strong className="text-ink font-mono">O(1) Auxiliary</strong>
          </div>
        </div>

        {/* Input Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-ink mb-1 block">
              Search Array:
            </label>
            <div className="flex gap-2">
              <input
                id="search-array-input"
                className="input flex-1 font-mono text-xs"
                value={arrayInput}
                onChange={(e) => setArrayInput(e.target.value)}
                placeholder="e.g. 2, 7, 12, 19, 23, 31, 45, 56, 68, 77"
              />
              <button
                type="button"
                id="search-apply-btn"
                className="btn btn-secondary btn-sm"
                onClick={() => loadTrace()}
                disabled={loading}
              >
                Apply
              </button>
              {algorithm === "binary_search" && (
                <button
                  type="button"
                  id="sort-array-asc-btn"
                  className="btn btn-secondary btn-sm text-xs"
                  onClick={handleSortArray}
                  disabled={loading}
                  title="Sort the array elements in ascending order"
                >
                  Sort Ascending
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink mb-1 block">
              Target Value:
            </label>
            <div className="flex gap-2">
              <input
                id="search-target-input"
                type="number"
                className="input w-28 font-mono text-xs font-bold"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
              />
              <button
                type="button"
                id="search-run-target-btn"
                className="btn btn-primary btn-sm flex-1"
                onClick={() => loadTrace()}
                disabled={loading}
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Presets */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line text-xs">
          <span className="text-ink-faint">Presets:</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm text-xs"
            onClick={() => handleGenerateSorted(12)}
            disabled={loading}
          >
            Generate Random Sorted
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm text-xs"
            onClick={() => {
              setArrayInput(PRESET_SEARCH_ARRAYS.sorted_standard.join(", "));
              setTargetInput("23");
              loadTrace(PRESET_SEARCH_ARRAYS.sorted_standard, "23", algorithm);
            }}
            disabled={loading}
          >
            Target Present (23)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm text-xs"
            onClick={() => {
              setArrayInput(PRESET_SEARCH_ARRAYS.sorted_standard.join(", "));
              setTargetInput("35");
              loadTrace(PRESET_SEARCH_ARRAYS.sorted_standard, "35", algorithm);
            }}
            disabled={loading}
          >
            Target Absent (35)
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger-soft text-danger border border-danger/30 rounded-lg text-xs flex items-center justify-between">
          <span>{error}</span>
          {algorithm === "binary_search" && (
            <button
              type="button"
              className="btn btn-secondary btn-sm text-xs ml-3"
              onClick={handleSortArray}
            >
              Sort Array Now
            </button>
          )}
        </div>
      )}

      {/* Interactive Visualization Display */}
      <div className="panel bg-surface border border-line p-4 rounded-xl shadow-sm">
        {/* Playback Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 mb-4">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="search-play-pause-btn"
              className={`btn btn-sm ${isPlaying ? "btn-secondary" : "btn-primary"}`}
              onClick={handlePlayPause}
              disabled={loading || totalSteps === 0}
            >
              {isPlaying ? "Pause" : currentStepIndex >= totalSteps - 1 ? "Replay" : "Play"}
            </button>
            <button
              type="button"
              id="search-step-back-btn"
              className="btn btn-secondary btn-sm"
              onClick={handleStepBackward}
              disabled={loading || currentStepIndex === 0}
              title="Step Backward"
            >
              Step Prev
            </button>
            <button
              type="button"
              id="search-step-fwd-btn"
              className="btn btn-secondary btn-sm"
              onClick={handleStepForward}
              disabled={loading || currentStepIndex >= totalSteps - 1}
              title="Step Forward"
            >
              Step Next
            </button>
            <button
              type="button"
              id="search-reset-btn"
              className="btn btn-secondary btn-sm"
              onClick={handleReset}
              disabled={loading || currentStepIndex === 0}
            >
              Reset
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-ink-soft">Speed:</span>
              <select
                className="input input-sm text-xs py-0.5 px-2"
                value={speedMs}
                onChange={(e) => setSpeedMs(Number(e.target.value))}
              >
                <option value={900}>0.5x (Slow)</option>
                <option value={500}>0.75x</option>
                <option value={350}>1.0x (Normal)</option>
                <option value={150}>2.0x (Fast)</option>
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

        {/* Active Search Range and Pointer Legend */}
        {algorithm === "binary_search" && (
          <div className="flex items-center gap-4 text-xs mb-3 bg-surface-subtle p-2.5 rounded-lg border border-line flex-wrap">
            <span className="text-ink-soft">Active Pointers:</span>
            <span className="flex items-center gap-1 font-mono font-bold text-sky-600">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Low:{" "}
              {currentEvent?.low !== null && currentEvent?.low !== undefined ? currentEvent.low : "—"}
            </span>
            <span className="flex items-center gap-1 font-mono font-bold text-purple-600">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Mid:{" "}
              {currentEvent?.mid !== null && currentEvent?.mid !== undefined ? currentEvent.mid : "—"}
            </span>
            <span className="flex items-center gap-1 font-mono font-bold text-orange-600">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> High:{" "}
              {currentEvent?.high !== null && currentEvent?.high !== undefined ? currentEvent.high : "—"}
            </span>
            <span className="text-ink-faint ml-auto">
              Target: <strong className="text-ink">{targetInput}</strong>
            </span>
          </div>
        )}

        {/* Array Visualization Tiles */}
        <div
          id="search-tiles-container"
          className="relative min-h-[140px] bg-surface-subtle border border-line rounded-xl p-4 flex items-center justify-start gap-2 overflow-x-auto"
        >
          {displayArray.map((val, idx) => {
            const isMid = algorithm === "binary_search" && currentEvent?.mid === idx;
            const isLow = algorithm === "binary_search" && currentEvent?.low === idx;
            const isHigh = algorithm === "binary_search" && currentEvent?.high === idx;
            const isInspectingLinear = algorithm === "linear_search" && currentEvent?.current_index === idx;
            const isFound = currentEvent?.found_index === idx;

            // In binary search: element is out of range if idx < low or idx > high
            const isOutOfRange =
              algorithm === "binary_search" &&
              currentEvent?.low !== undefined &&
              currentEvent?.high !== undefined &&
              (idx < currentEvent.low || idx > currentEvent.high);

            let tileBorder = "border-line";
            let tileBg = "bg-surface";
            let textColor = "text-ink";

            if (isFound) {
              tileBg = "bg-green-600 text-white shadow-md ring-2 ring-green-400";
              tileBorder = "border-green-700";
              textColor = "text-white";
            } else if (isMid) {
              tileBg = "bg-purple-500 text-white ring-2 ring-purple-400 shadow-md";
              tileBorder = "border-purple-600";
              textColor = "text-white";
            } else if (isInspectingLinear) {
              tileBg = "bg-amber-500 text-white ring-2 ring-amber-400 shadow-md";
              tileBorder = "border-amber-600";
              textColor = "text-white";
            } else if (isOutOfRange) {
              tileBg = "bg-surface-subtle opacity-40";
              textColor = "text-ink-faint line-through";
            }

            return (
              <div
                key={idx}
                className="flex flex-col items-center min-w-[56px] transition-all duration-150"
              >
                {/* Pointers above tile */}
                <div className="h-6 flex items-center justify-center gap-0.5 mb-1 text-[10px] font-mono font-bold">
                  {isLow && <span className="bg-sky-500 text-white px-1 rounded shadow-sm">L</span>}
                  {isMid && <span className="bg-purple-600 text-white px-1 rounded shadow-sm">M</span>}
                  {isHigh && <span className="bg-orange-500 text-white px-1 rounded shadow-sm">H</span>}
                  {isInspectingLinear && (
                    <span className="bg-amber-500 text-white px-1 rounded shadow-sm animate-bounce">
                      CHK
                    </span>
                  )}
                </div>

                {/* Main Tile */}
                <div
                  className={`w-14 h-14 rounded-xl border flex flex-col items-center justify-center font-mono font-bold text-sm ${tileBg} ${tileBorder} ${textColor} transition-all duration-150 shadow-sm`}
                >
                  <span>{val}</span>
                </div>

                {/* Index label below tile */}
                <span className="text-[10px] font-mono text-ink-faint mt-1.5">
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
              Comparisons: <strong>{currentEvent?.comparisons || 0}</strong>
            </span>
          </div>
          <p className="text-xs text-ink">
            {currentEvent?.explanation || "Ready to execute. Click Search or Step Next to animate."}
          </p>
        </div>

        {/* Real Measured Execution Results */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
          <div className="p-3 bg-surface-subtle rounded-lg border border-line">
            <span className="text-ink-faint block">Measured Comparisons:</span>
            <span className="text-lg font-bold font-mono text-ink">
              {traceData?.comparisons ?? 0}
            </span>
          </div>
          <div className="p-3 bg-surface-subtle rounded-lg border border-line">
            <span className="text-ink-faint block">Search Outcome:</span>
            <span
              className={`text-lg font-bold font-mono ${
                traceData?.found ? "text-safe" : traceData ? "text-danger" : "text-ink"
              }`}
            >
              {traceData?.found ? `Found at index ${traceData.index}` : traceData ? "Not Found (-1)" : "Awaiting Run"}
            </span>
          </div>
          <div className="p-3 bg-surface-subtle rounded-lg border border-line">
            <span className="text-ink-faint block">Target Value:</span>
            <span className="text-lg font-bold font-mono text-ink">
              {targetInput}
            </span>
          </div>
          <div className="p-3 bg-surface-subtle rounded-lg border border-line">
            <span className="text-ink-faint block">Theoretical Bound:</span>
            <span className="text-lg font-bold font-mono text-brand">
              {algorithm === "binary_search"
                ? `≤ ⌈log₂(${displayArray.length})⌉ = ${Math.ceil(Math.log2(Math.max(1, displayArray.length)))}`
                : `≤ N = ${displayArray.length}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
