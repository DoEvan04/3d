import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Layers,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import {
  AssemblyStats,
  CadParameters,
  CameraPresetId,
  DEFAULT_CAD_PARAMS,
  MATERIAL_FINISHES,
  MaterialFinishId,
  ViewLayoutMode,
} from '../cad/specs';
import { StlExportTarget } from '../cad/stlExporter';

type DockTab = 'view' | 'dimensions' | 'finish' | 'export';

interface ControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  layoutMode: ViewLayoutMode;
  onLayoutModeChange: (mode: ViewLayoutMode) => void;
  params: CadParameters;
  onParamsChange: (next: CadParameters) => void;
  finishId: MaterialFinishId;
  onFinishChange: (id: MaterialFinishId) => void;
  cameraPreset: CameraPresetId;
  onCameraPreset: (id: CameraPresetId) => void;
  showDimensions: boolean;
  onToggleDimensions: () => void;
  showFitCheck: boolean;
  onToggleFitCheck: () => void;
  showCadEdges: boolean;
  onToggleCadEdges: () => void;
  stats: AssemblyStats | null;
  onExportStl: (target: StlExportTarget) => void;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  collapsed,
  onToggleCollapse,
  layoutMode,
  onLayoutModeChange,
  params,
  onParamsChange,
  finishId,
  onFinishChange,
  cameraPreset,
  onCameraPreset,
  showDimensions,
  onToggleDimensions,
  showFitCheck,
  onToggleFitCheck,
  showCadEdges,
  onToggleCadEdges,
  stats,
  onExportStl,
}) => {
  const [activeTab, setActiveTab] = useState<DockTab>('view');

  const updateParam = <K extends keyof CadParameters>(
    key: K,
    value: CadParameters[K]
  ) => {
    onParamsChange({ ...params, [key]: value });
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(900px,94vw)] pointer-events-none transition-transform duration-300 ease-out"
      style={{
        transform: collapsed
          ? 'translate(-50%, calc(100% - 34px))'
          : 'translate(-50%, 0)',
      }}
    >
      {/* Top-edge collapse / expand handle */}
      <div className="flex justify-center mb-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-t-lg bg-white/95 border border-slate-300 text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-white shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          aria-expanded={!collapsed}
          title="Toggle Controls (H)"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Container — Solid surface (no backdrop-blur over WebGL) */}
      <div className="pointer-events-auto bg-white/96 border border-slate-300/90 rounded-xl shadow-[0_14px_38px_-12px_rgba(15,23,42,0.22)] overflow-hidden">
        {/* Dock Tab Bar */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-slate-200 bg-slate-50/90 overflow-x-auto">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'view', label: 'Assembly & Camera', icon: Eye },
                { id: 'dimensions', label: 'CAD Dimensions', icon: Sliders },
                { id: 'finish', label: 'Material & Fit Check', icon: Layers },
                { id: 'export', label: 'Export STL', icon: Download },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap shrink-0">
            <span>{params.jawOpening.toFixed(0)}mm Jaw</span>
            <span aria-hidden="true">·</span>
            <span>{params.overallHeight.toFixed(0)}mm Tall</span>
            <span aria-hidden="true">·</span>
            <span>
              {params.cradleWidth.toFixed(0)}mm / R{params.cradleRadius.toFixed(0)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{params.clearanceGap.toFixed(2)}mm Gap</span>
          </div>
        </div>

        {/* Dock Body */}
        <div className="px-4 py-3">
          {activeTab === 'view' && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Layout Mode */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                  Layout
                </span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'assembled', label: 'Assembled' },
                      { id: 'exploded', label: 'Exploded Screw' },
                      { id: 'print-bed', label: 'Print Bed' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onLayoutModeChange(m.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        layoutMode === m.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Screw Travel Slider */}
              <div className="flex items-center gap-3 flex-1 max-w-xs">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                  M10 Travel
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={params.screwTravel}
                  disabled={layoutMode !== 'assembled'}
                  onChange={(e) =>
                    updateParam('screwTravel', parseFloat(e.target.value))
                  }
                  className="cad-range w-full disabled:opacity-40"
                  aria-label="M10 screw travel position"
                />
                <span className="text-xs font-mono tabular-nums text-slate-700 w-12 text-right shrink-0">
                  {Math.round(params.screwTravel * 100)}%
                </span>
              </div>

              {/* Camera Presets */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {(
                  [
                    { id: 'isometric', label: 'Iso' },
                    { id: 'front', label: 'Front' },
                    { id: 'clamp', label: 'M10 Clamp' },
                    { id: 'cradle', label: 'Cradle' },
                    { id: 'controller', label: 'DualSense' },
                  ] as const
                ).map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onCameraPreset(cam.id)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      cameraPreset === cam.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'dimensions' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Jaw Capacity</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {params.jawOpening.toFixed(1)}mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={28}
                    max={55}
                    step={0.5}
                    value={params.jawOpening}
                    onChange={(e) =>
                      updateParam('jawOpening', parseFloat(e.target.value))
                    }
                    className="cad-range w-full"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Total Height</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {params.overallHeight.toFixed(0)}mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={190}
                    max={280}
                    step={1}
                    value={params.overallHeight}
                    onChange={(e) =>
                      updateParam('overallHeight', parseFloat(e.target.value))
                    }
                    className="cad-range w-full"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Cradle Width</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {params.cradleWidth.toFixed(0)}mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={95}
                    max={140}
                    step={1}
                    value={params.cradleWidth}
                    onChange={(e) =>
                      updateParam('cradleWidth', parseFloat(e.target.value))
                    }
                    className="cad-range w-full"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Cradle Curve</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      R{params.cradleRadius.toFixed(0)}mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={45}
                    max={85}
                    step={1}
                    value={params.cradleRadius}
                    onChange={(e) =>
                      updateParam('cradleRadius', parseFloat(e.target.value))
                    }
                    className="cad-range w-full"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Thread Gap</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {params.clearanceGap.toFixed(2)}mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.35}
                    step={0.05}
                    value={params.clearanceGap}
                    onChange={(e) =>
                      updateParam('clearanceGap', parseFloat(e.target.value))
                    }
                    className="cad-range w-full"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500">
                <span>
                  ISO M10 × 1.5mm helical profile with {params.clearanceGap.toFixed(2)}mm
                  radial clearance for PLA/PETG mating
                </span>
                <button
                  type="button"
                  onClick={() => onParamsChange({ ...DEFAULT_CAD_PARAMS })}
                  className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-950 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Spec Defaults</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'finish' && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Filament Finish Swatches */}
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0 mr-1">
                  Material
                </span>
                {(Object.keys(MATERIAL_FINISHES) as MaterialFinishId[]).map(
                  (id) => {
                    const f = MATERIAL_FINISHES[id];
                    const active = finishId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onFinishChange(id)}
                        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                          style={{ backgroundColor: f.swatchHex }}
                        />
                        <span>{f.label}</span>
                      </button>
                    );
                  }
                )}
              </div>

              {/* Inspection Overlays */}
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={onToggleDimensions}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showDimensions
                      ? 'border-blue-700 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Dimension Callouts
                </button>
                <button
                  type="button"
                  onClick={onToggleFitCheck}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showFitCheck
                      ? 'border-blue-700 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Fit Check (DualSense + BlackShark)
                </button>
                <button
                  type="button"
                  onClick={onToggleCadEdges}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showCadEdges
                      ? 'border-slate-900 bg-slate-100 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  CAD Creases
                </button>
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => onExportStl('part-a')}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 text-left transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    Part A · M10 Clamp Screw
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                    {stats
                      ? `${stats.partA.boundsMm.x}×${stats.partA.boundsMm.z}×${stats.partA.boundsMm.y}mm · ~${stats.partA.estimatedGramsPla}g`
                      : 'Upright Z-up STL'}
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-700 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => onExportStl('part-b')}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 text-left transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    Part B · Clamp Stand
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                    {stats
                      ? `${stats.partB.boundsMm.x}×${stats.partB.boundsMm.y}×${stats.partB.boundsMm.z}mm · ~${stats.partB.estimatedGramsPla}g`
                      : 'Flat-side Z-up STL'}
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-700 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => onExportStl('print-plate')}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-left transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    Complete Print Plate
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-300 mt-0.5">
                    {stats
                      ? `${(stats.partA.triangles + stats.partB.triangles).toLocaleString()} tris · ~${(
                          stats.partA.estimatedGramsPla +
                          stats.partB.estimatedGramsPla
                        ).toFixed(1)}g`
                      : 'Both parts on Z=0 bed'}
                  </div>
                </div>
                <Box className="w-4 h-4 text-slate-200 shrink-0" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
