export type ViewLayoutMode = 'assembled' | 'exploded' | 'print-bed';

export type MaterialFinishId =
  | 'chalk-pla'
  | 'charcoal-petg'
  | 'cobalt-pla'
  | 'brushed-alu';

export type CameraPresetId =
  | 'isometric'
  | 'front'
  | 'clamp'
  | 'cradle'
  | 'controller';

export interface CadParameters {
  jawOpening: number; // 40.0 mm default
  overallHeight: number; // 240.0 mm default
  cradleWidth: number; // 115.0 mm default
  cradleRadius: number; // 60.0 mm default (R60mm)
  threadMajorDiameter: number; // 10.0 mm (M10)
  threadPitch: number; // 1.5 mm (ISO M10 coarse)
  clearanceGap: number; // 0.20 mm radial clearance for PLA/PETG
  armReach: number; // 84.0 mm controller arm horizontal reach
  screwTravel: number; // 0.0 (open) to 1.0 (clamped to 40mm/20mm)
}

export const DEFAULT_CAD_PARAMS: CadParameters = {
  jawOpening: 40.0,
  overallHeight: 240.0,
  cradleWidth: 115.0,
  cradleRadius: 60.0,
  threadMajorDiameter: 10.0,
  threadPitch: 1.5,
  clearanceGap: 0.2,
  armReach: 84.0,
  screwTravel: 0.35,
};

export interface MaterialFinish {
  id: MaterialFinishId;
  label: string;
  materialNote: string;
  partBColor: number;
  partAColor: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  swatchHex: string;
}

export const MATERIAL_FINISHES: Record<MaterialFinishId, MaterialFinish> = {
  'chalk-pla': {
    id: 'chalk-pla',
    label: 'Matte PLA Clay',
    materialNote: 'Reference grey drafting finish',
    partBColor: 0xc2c6cc,
    partAColor: 0xb2b7be,
    roughness: 0.62,
    metalness: 0.04,
    clearcoat: 0.0,
    swatchHex: '#c2c6cc',
  },
  'charcoal-petg': {
    id: 'charcoal-petg',
    label: 'Charcoal PETG',
    materialNote: 'Satin carbon-filled functional print',
    partBColor: 0x333942,
    partAColor: 0x4b5563,
    roughness: 0.42,
    metalness: 0.12,
    clearcoat: 0.15,
    swatchHex: '#333942',
  },
  'cobalt-pla': {
    id: 'cobalt-pla',
    label: 'Anodized Slate',
    materialNote: 'Satin slate & brass-accent screw',
    partBColor: 0x475569,
    partAColor: 0xd97706,
    roughness: 0.38,
    metalness: 0.2,
    clearcoat: 0.25,
    swatchHex: '#475569',
  },
  'brushed-alu': {
    id: 'brushed-alu',
    label: 'Machined Alloy',
    materialNote: 'CNC inspection metallic shader',
    partBColor: 0xcbd5e1,
    partAColor: 0x94a3b8,
    roughness: 0.24,
    metalness: 0.88,
    clearcoat: 0.1,
    swatchHex: '#94a3b8',
  },
};

export interface MeshStats {
  triangles: number;
  volumeCm3: number;
  estimatedGramsPla: number;
  boundsMm: { x: number; y: number; z: number };
}

export interface AssemblyStats {
  partA: MeshStats;
  partB: MeshStats;
}
