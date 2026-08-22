import React from "react";
import SafeWalkPage from "./SafeWalkPage";
import SmartCheckPage from "./SmartCheckPage";
import ShakeDetector from "../components/ShakeDetector";

export default function SafeMonitoringPage(props) {
  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Safe Monitoring</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A unified view of your active SafeWalk tracking and background Smart Check routines.
        </p>
      </div>

      {/* Shake Detection Module */}
      <ShakeDetector userInfo={props.userInfo} currentPos={props.monitor ? props.monitor.currentPos : null} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 flex-1 overflow-hidden">
        {/* SafeWalk Column */}
        <div className="bg-white/40 dark:bg-slate-900/50 rounded-3xl p-6 border border-black/5 dark:border-slate-800 shadow-xl overflow-y-auto">
          <SafeWalkPage {...props} isSubComponent={true} />
        </div>

        {/* Smart Check Column */}
        <div className="bg-white/40 dark:bg-slate-900/50 rounded-3xl p-6 border border-black/5 dark:border-slate-800 shadow-xl overflow-y-auto">
          <SmartCheckPage {...props} isSubComponent={true} />
        </div>
      </div>
    </div>
  );
}
