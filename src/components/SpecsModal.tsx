import React from 'react';
import { Download, X } from 'lucide-react';
import { AssemblyStats, CadParameters } from '../cad/specs';
import { StlExportTarget } from '../cad/stlExporter';

interface SpecsModalProps {
  open: boolean;
  onClose: () => void;
  params: CadParameters;
  stats: AssemblyStats | null;
  onExportStl: (target: StlExportTarget) => void;
}

export const SpecsModal: React.FC<SpecsModalProps> = ({
  open,
  onClose,
  params,
  stats,
  onExportStl,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="specs-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2
              id="specs-modal-title"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Print Specifications & Reference Blueprint
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              1:1 Millimeter STL Output · Z-Up Slicer Coordinate System
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close specifications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
              <img
                src="/assets/aistudio/image_fbb26a97.png"
                alt="Technical CAD reference blueprint showing Part A separate M10 clamp screw and Part B clamp base"
                className="w-full h-auto object-contain block"
              />
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Verified Geometry Parameters
                </h3>
                <dl className="divide-y divide-slate-100 text-xs border border-slate-200 rounded-lg">
                  <div className="flex justify-between px-3 py-2">
                    <dt className="text-slate-500">Clamp Jaw Capacity</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {params.jawOpening.toFixed(1)} mm
                    </dd>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <dt className="text-slate-500">Overall Vertical Height</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {params.overallHeight.toFixed(1)} mm
                    </dd>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <dt className="text-slate-500">Headphone Cradle</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {params.cradleWidth.toFixed(1)} mm · R{params.cradleRadius.toFixed(0)} mm
                    </dd>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <dt className="text-slate-500">Controller Mount</dt>
                    <dd className="font-medium text-slate-900">
                      PS5 DualSense Grip Cradle
                    </dd>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <dt className="text-slate-500">Thread Specification</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      ISO M{params.threadMajorDiameter.toFixed(0)} × {params.threadPitch.toFixed(1)} mm
                    </dd>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <dt className="text-slate-500">Mating Tolerance Gap</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {params.clearanceGap.toFixed(2)} mm radial
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Recommended Slicer Settings (PLA / PETG)
                </h3>
                <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
                  <li>
                    <strong className="text-slate-900">Layer Height:</strong> 0.20 mm
                    (0.16 mm adaptive on M10 threads for smoothest rotation)
                  </li>
                  <li>
                    <strong className="text-slate-900">Perimeters & Infill:</strong> 4
                    wall loops · 25% gyroid infill for C-clamp flex strength
                  </li>
                  <li>
                    <strong className="text-slate-900">Orientation:</strong> Part B
                    exports flat on its side so layer lines wrap continuously around
                    the C-clamp bend; Part A prints upright on its 5-lobe knob base
                    with zero supports needed.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Part A · M10 Clamp Screw
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 mt-1">
                    {stats.partA.volumeCm3} cm³ · ~{stats.partA.estimatedGramsPla} g PLA ·{' '}
                    {stats.partA.triangles.toLocaleString()} tris
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onExportStl('part-a')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>STL</span>
                </button>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Part B · Clamp Stand
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 mt-1">
                    {stats.partB.volumeCm3} cm³ · ~{stats.partB.estimatedGramsPla} g PLA ·{' '}
                    {stats.partB.triangles.toLocaleString()} tris
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onExportStl('part-b')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>STL</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
