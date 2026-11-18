import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
  AssemblyStats,
  CadParameters,
  CameraPresetId,
  DEFAULT_CAD_PARAMS,
  MaterialFinishId,
  ViewLayoutMode,
} from './cad/specs';
import { StlExportTarget } from './cad/stlExporter';
import { CadViewport, CadViewportHandle } from './components/CadViewport';
import { ControlDock } from './components/ControlDock';
import { SpecsModal } from './components/SpecsModal';

export default function App() {
  const viewportRef = useRef<CadViewportHandle>(null);

  const [params, setParams] = useState<CadParameters>(DEFAULT_CAD_PARAMS);
  const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>('assembled');
  const [finishId, setFinishId] = useState<MaterialFinishId>('chalk-pla');
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('isometric');
  const [cameraTrigger, setCameraTrigger] = useState(0);

  const [showDimensions, setShowDimensions] = useState(true);
  const [showFitCheck, setShowFitCheck] = useState(false);
  const [showCadEdges, setShowCadEdges] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);

  const [stats, setStats] = useState<AssemblyStats | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'Escape' && specsOpen) {
        setSpecsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [specsOpen]);

  const handleCameraPreset = useCallback((id: CameraPresetId) => {
    setCameraPreset(id);
    setCameraTrigger((n) => n + 1);
  }, []);

  const handleExportStl = useCallback((target: StlExportTarget) => {
    viewportRef.current?.exportStl(target);
    const labelMap: Record<StlExportTarget, string> = {
      'part-a': 'part_a_m10_clamp_screw.stl',
      'part-b': 'part_b_clamp_stand.stl',
      'print-plate': 'clamp_stand_complete_plate.stl',
    };
    setExportNotice(`Downloaded ${labelMap[target]} (1:1 mm Z-up)`);
    window.setTimeout(() => {
      setExportNotice((prev) =>
        prev?.includes(labelMap[target]) ? null : prev
      );
    }, 3200);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#e9edf1]">
      {/* Top Bar — 3-Zone Single-Row Contract */}
      <header className="fixed top-0 inset-x-0 z-20 flex items-center justify-between gap-8 px-6 py-3 bg-white/92 border-b border-slate-300/80">
        <button
          type="button"
          onClick={() => viewportRef.current?.resetCamera()}
          className="font-display text-lg font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
        >
          ClampStand CAD
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setLayoutMode('assembled')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer hover:text-slate-950 ${
              layoutMode === 'assembled'
                ? 'text-slate-950 underline underline-offset-4'
                : ''
            }`}
          >
            Assembled
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('exploded')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer hover:text-slate-950 ${
              layoutMode === 'exploded'
                ? 'text-slate-950 underline underline-offset-4'
                : ''
            }`}
          >
            Exploded Screw
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('print-bed')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer hover:text-slate-950 ${
              layoutMode === 'print-bed'
                ? 'text-slate-950 underline underline-offset-4'
                : ''
            }`}
          >
            Print Bed
          </button>
          <button
            type="button"
            onClick={() => setSpecsOpen(true)}
            className="whitespace-nowrap shrink-0 transition-colors cursor-pointer hover:text-slate-950"
          >
            Print Specs
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleExportStl('print-plate')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export STL Plate</span>
          </button>
        </div>
      </header>

      {/* Export Confirmation Banner */}
      {exportNotice && (
        <div
          role="status"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-md whitespace-nowrap"
        >
          {exportNotice}
        </div>
      )}

      {/* Full-Viewport 3D WebGL CAD Canvas */}
      <main className="w-full h-full">
        <CadViewport
          ref={viewportRef}
          params={params}
          layoutMode={layoutMode}
          finishId={finishId}
          cameraPreset={cameraPreset}
          cameraTrigger={cameraTrigger}
          showDimensions={showDimensions}
          showFitCheck={showFitCheck}
          showCadEdges={showCadEdges}
          onStatsComputed={setStats}
        />
      </main>

      {/* Collapsible Bottom Control Dock */}
      <ControlDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        params={params}
        onParamsChange={setParams}
        finishId={finishId}
        onFinishChange={setFinishId}
        cameraPreset={cameraPreset}
        onCameraPreset={handleCameraPreset}
        showDimensions={showDimensions}
        onToggleDimensions={() => setShowDimensions((v) => !v)}
        showFitCheck={showFitCheck}
        onToggleFitCheck={() => {
          setShowFitCheck((v) => !v);
          if (layoutMode !== 'assembled') setLayoutMode('assembled');
        }}
        showCadEdges={showCadEdges}
        onToggleCadEdges={() => setShowCadEdges((v) => !v)}
        stats={stats}
        onExportStl={handleExportStl}
      />

      {/* Reference Blueprint & Print Specs Modal */}
      <SpecsModal
        open={specsOpen}
        onClose={() => setSpecsOpen(false)}
        params={params}
        stats={stats}
        onExportStl={handleExportStl}
      />
    </div>
  );
}
