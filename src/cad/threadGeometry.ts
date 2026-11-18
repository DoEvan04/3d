import * as THREE from 'three';
import { createClosedLoft, ensureOutwardNormals } from './manifoldHelpers';

/**
 * ISO Metric 60-degree trapezoidal thread profile normalized on phase in [0, 1).
 * Returns factor in [0, 1] where 0 = root (minor radius), 1 = crest (major radius).
 */
function isoThreadProfile(phase: number, isInternal: boolean): number {
  const p = ((phase % 1) + 1) % 1;
  if (!isInternal) {
    // External thread: narrow flat crest (0.125 P), wider flat root (0.25 P), 60° flanks
    // Shift so crest is centered around p = 0.5
    if (p < 0.125) return 0.0;
    if (p < 0.4375) return (p - 0.125) / 0.3125;
    if (p < 0.5625) return 1.0;
    if (p < 0.875) return 1.0 - (p - 0.5625) / 0.3125;
    return 0.0;
  } else {
    // Internal thread mate: crest (smallest radius, f=0) is flat 0.25 P, root (largest radius, f=1) is 0.125 P
    if (p < 0.125) return 0.0;
    if (p < 0.4375) return (p - 0.125) / 0.3125;
    if (p < 0.5625) return 1.0;
    if (p < 0.875) return 1.0 - (p - 0.5625) / 0.3125;
    return 0.0;
  }
}

export interface ScrewBuildOptions {
  majorDiameter: number; // 10.0 mm
  pitch: number; // 1.5 mm
  clearanceGap: number; // 0.2 mm
  shaftLength: number; // e.g., 52 mm
}

/**
 * Builds Part A (M10 Clamp Screw with 5-lobed thumb knob and chamfered flat bolt tip)
 * as a single continuous watertight BufferGeometry.
 * Local Y=0 sits at the flat bottom of the knob.
 */
export function createPartAClampScrewGeometry(
  opts: ScrewBuildOptions
): { geometry: THREE.BufferGeometry; padTopY: number; threadStartY: number } {
  const { majorDiameter, pitch, clearanceGap, shaftLength } = opts;

  // Apply slight external allowance so mating gap with internal bore equals clearanceGap
  const extMajorR = majorDiameter / 2 - clearanceGap * 0.25;
  const threadDepth = 0.54127 * pitch;
  const extMinorR = extMajorR - threadDepth;

  const angularSegs = 60; // Divisible by 5 (for 5-lobe knob) and smooth for helix
  const knobHeight = 14.0;
  const bossHeight = 2.0;
  const threadStartY = knobHeight + bossHeight;
  const threadEndY = threadStartY + shaftLength;
  const tipChamferHeight = 1.2;
  const padTopY = threadEndY + tipChamferHeight;

  const rings: THREE.Vector3[][] = [];

  const pushPolarRing = (
    y: number,
    radiusFn: (theta: number) => number
  ) => {
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < angularSegs; i++) {
      const theta = (i / angularSegs) * Math.PI * 2;
      const r = radiusFn(theta);
      // Right-hand coordinate frame: x = r cos(theta), z = -r sin(theta)
      ring.push(new THREE.Vector3(r * Math.cos(theta), y, -r * Math.sin(theta)));
    }
    rings.push(ring);
  };

  // 1. 5-Lobed ergonomic thumb knob (flat base at y=0, 1.5mm bottom & top chamfers)
  const knobRadius = (theta: number, scale = 1, offset = 0) =>
    (14.8 + 3.2 * Math.cos(5 * theta)) * scale + offset;

  pushPolarRing(0.0, (t) => knobRadius(t, 1, -1.4));
  pushPolarRing(1.4, (t) => knobRadius(t, 1, 0));
  pushPolarRing(knobHeight - 1.4, (t) => knobRadius(t, 1, 0));
  pushPolarRing(knobHeight, (t) => knobRadius(t, 1, -1.4));

  // 2. Central stepped boss transitioning into M10 shaft
  pushPolarRing(knobHeight + 0.3, () => 8.2);
  pushPolarRing(knobHeight + bossHeight - 0.5, () => 8.0);
  pushPolarRing(threadStartY, () => extMinorR + 0.15);

  // 3. Continuous M10 x 1.5 helical shaft
  const leadLen = 2.2;
  const stepsPerPitch = 10;
  const numAxialSteps = Math.round((shaftLength / pitch) * stepsPerPitch);

  for (let s = 1; s <= numAxialSteps; s++) {
    const u = s / numAxialSteps;
    const y = threadStartY + u * shaftLength;
    const distFromStart = y - threadStartY;
    const distFromEnd = threadEndY - y;

    let envelope = 1.0;
    if (distFromStart < leadLen) {
      envelope = Math.max(0, distFromStart / leadLen);
    } else if (distFromEnd < leadLen) {
      envelope = Math.max(0, distFromEnd / leadLen);
    }

    pushPolarRing(y, (theta) => {
      const phase = y / pitch - theta / (Math.PI * 2);
      const prof = isoThreadProfile(phase, false);
      return extMinorR + envelope * prof * (extMajorR - extMinorR);
    });
  }

  // 4. Clean chamfered flat M10 bolt tip for smooth thread entry
  pushPolarRing(threadEndY + 0.3, () => extMinorR);
  pushPolarRing(padTopY, () => Math.max(2.6, extMinorR - 0.7));

  const geometry = createClosedLoft(rings, true);
  return { geometry, padTopY, threadStartY };
}

/**
 * Builds a watertight hollow cylindrical nut insert with an internal M10 x 1.5 helical bore
 * expanded by clearanceGap (0.20mm radial clearance) for smooth PLA/PETG printing.
 */
export function createInternalThreadBoreInsert(opts: {
  majorDiameter: number;
  pitch: number;
  clearanceGap: number;
  outerRadius: number;
  height: number;
}): THREE.BufferGeometry {
  const { majorDiameter, pitch, clearanceGap, outerRadius, height } = opts;

  const intMajorR = majorDiameter / 2 + clearanceGap * 0.75;
  const threadDepth = 0.54127 * pitch;
  const intMinorR = intMajorR - threadDepth;

  const angularSegs = 48;
  const stepsPerPitch = 10;
  const axialSteps = Math.max(16, Math.round((height / pitch) * stepsPerPitch));
  const chamferH = 1.2;

  const positions: number[] = [];
  const indices: number[] = [];

  // Inner bore rings (0 .. axialSteps)
  for (let s = 0; s <= axialSteps; s++) {
    const y = (s / axialSteps) * height;
    const distBot = y;
    const distTop = height - y;

    // 45-degree lead-in chamfer at bottom and top of the tapped hole
    let chamferExpand = 0;
    let envelope = 1.0;
    if (distBot < chamferH) {
      chamferExpand = (chamferH - distBot) * 0.85;
      envelope = distBot / chamferH;
    } else if (distTop < chamferH) {
      chamferExpand = (chamferH - distTop) * 0.85;
      envelope = distTop / chamferH;
    }

    for (let i = 0; i < angularSegs; i++) {
      const theta = (i / angularSegs) * Math.PI * 2;
      const phase = y / pitch - theta / (Math.PI * 2);
      const prof = isoThreadProfile(phase, true);
      const r = Math.min(
        outerRadius - 0.25,
        intMinorR + envelope * prof * (intMajorR - intMinorR) + chamferExpand
      );
      positions.push(r * Math.cos(theta), y, -r * Math.sin(theta));
    }
  }

  // Outer wall rings (only bottom and top rings needed since outer wall is straight cylinder)
  const outerBotStart = (axialSteps + 1) * angularSegs;
  const outerTopStart = outerBotStart + angularSegs;

  for (const y of [0, height]) {
    for (let i = 0; i < angularSegs; i++) {
      const theta = (i / angularSegs) * Math.PI * 2;
      positions.push(
        outerRadius * Math.cos(theta),
        y,
        -outerRadius * Math.sin(theta)
      );
    }
  }

  // Stitch inner helical bore wall (normals pointing INWARD toward bore center)
  for (let s = 0; s < axialSteps; s++) {
    const rowA = s * angularSegs;
    const rowB = (s + 1) * angularSegs;
    for (let i = 0; i < angularSegs; i++) {
      const iNext = (i + 1) % angularSegs;
      const a0 = rowA + i;
      const a1 = rowA + iNext;
      const b0 = rowB + i;
      const b1 = rowB + iNext;
      indices.push(a0, a1, b1);
      indices.push(a0, b1, b0);
    }
  }

  // Stitch outer cylindrical wall (normals pointing OUTWARD)
  for (let i = 0; i < angularSegs; i++) {
    const iNext = (i + 1) % angularSegs;
    const a0 = outerBotStart + i;
    const a1 = outerBotStart + iNext;
    const b0 = outerTopStart + i;
    const b1 = outerTopStart + iNext;
    indices.push(a0, b1, a1);
    indices.push(a0, b0, b1);
  }

  // Stitch bottom annular cap (y = 0, normal pointing -Y)
  for (let i = 0; i < angularSegs; i++) {
    const iNext = (i + 1) % angularSegs;
    const inner0 = i;
    const inner1 = iNext;
    const outer0 = outerBotStart + i;
    const outer1 = outerBotStart + iNext;
    indices.push(inner0, outer0, outer1);
    indices.push(inner0, outer1, inner1);
  }

  // Stitch top annular cap (y = height, normal pointing +Y)
  const innerTopStart = axialSteps * angularSegs;
  for (let i = 0; i < angularSegs; i++) {
    const iNext = (i + 1) % angularSegs;
    const inner0 = innerTopStart + i;
    const inner1 = innerTopStart + iNext;
    const outer0 = outerTopStart + i;
    const outer1 = outerTopStart + iNext;
    indices.push(inner0, outer1, outer0);
    indices.push(inner0, inner1, outer1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return ensureOutwardNormals(geo);
}
