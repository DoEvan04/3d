import * as THREE from 'three';
import { MeshStats } from './specs';

/**
 * Ensures outward winding on closed BufferGeometry using signed tetrahedron volume,
 * then computes clean vertex normals.
 */
export function ensureOutwardNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!pos) return geometry;

  let signedVol = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();

  if (index) {
    const arr = index.array;
    for (let i = 0; i < arr.length; i += 3) {
      a.fromBufferAttribute(pos, arr[i]);
      b.fromBufferAttribute(pos, arr[i + 1]);
      c.fromBufferAttribute(pos, arr[i + 2]);
      cross.crossVectors(b, c);
      signedVol += a.dot(cross) / 6;
    }
    if (signedVol < 0) {
      for (let i = 0; i < arr.length; i += 3) {
        const tmp = arr[i + 1];
        (arr as Uint16Array | Uint32Array)[i + 1] = arr[i + 2];
        (arr as Uint16Array | Uint32Array)[i + 2] = tmp;
      }
      index.needsUpdate = true;
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      cross.crossVectors(b, c);
      signedVol += a.dot(cross) / 6;
    }
    if (signedVol < 0) {
      for (let i = 0; i < pos.count; i += 3) {
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        pos.setXYZ(i + 1, c.x, c.y, c.z);
        pos.setXYZ(i + 2, b.x, b.y, b.z);
      }
      pos.needsUpdate = true;
    }
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Builds a watertight closed BufferGeometry by lofting a sequence of equal-length 3D vertex rings.
 * Automatically verifies outward winding via signed volume.
 */
export function createClosedLoft(
  rings: THREE.Vector3[][],
  capEnds = true
): THREE.BufferGeometry {
  const numRings = rings.length;
  const segs = rings[0].length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < numRings; r++) {
    const ring = rings[r];
    for (let s = 0; s < segs; s++) {
      positions.push(ring[s].x, ring[s].y, ring[s].z);
    }
  }

  for (let r = 0; r < numRings - 1; r++) {
    const rowA = r * segs;
    const rowB = (r + 1) * segs;
    for (let s = 0; s < segs; s++) {
      const sNext = (s + 1) % segs;
      const a0 = rowA + s;
      const a1 = rowA + sNext;
      const b0 = rowB + s;
      const b1 = rowB + sNext;
      indices.push(a0, b0, b1);
      indices.push(a0, b1, a1);
    }
  }

  if (capEnds) {
    // Start cap centroid
    const startCenter = new THREE.Vector3();
    for (const p of rings[0]) startCenter.add(p);
    startCenter.divideScalar(segs);
    const startIdx = positions.length / 3;
    positions.push(startCenter.x, startCenter.y, startCenter.z);

    for (let s = 0; s < segs; s++) {
      const sNext = (s + 1) % segs;
      indices.push(startIdx, sNext, s);
    }

    // End cap centroid
    const endRing = rings[numRings - 1];
    const endCenter = new THREE.Vector3();
    for (const p of endRing) endCenter.add(p);
    endCenter.divideScalar(segs);
    const endIdx = positions.length / 3;
    positions.push(endCenter.x, endCenter.y, endCenter.z);
    const lastRow = (numRings - 1) * segs;

    for (let s = 0; s < segs; s++) {
      const sNext = (s + 1) % segs;
      indices.push(endIdx, lastRow + s, lastRow + sNext);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return ensureOutwardNormals(geo);
}

/**
 * Generates an octagonal/chamfered rectangle 2D ring in the local (u, v) plane
 * with exact outer dimensions w x h and corner chamfer c.
 */
export function makeChamferedRectProfile(
  w: number,
  h: number,
  c: number
): THREE.Vector2[] {
  const hw = w / 2;
  const hh = h / 2;
  const cc = Math.min(c, hw * 0.45, hh * 0.45);
  return [
    new THREE.Vector2(-hw + cc, -hh),
    new THREE.Vector2(hw - cc, -hh),
    new THREE.Vector2(hw, -hh + cc),
    new THREE.Vector2(hw, hh - cc),
    new THREE.Vector2(hw - cc, hh),
    new THREE.Vector2(-hw + cc, hh),
    new THREE.Vector2(-hw, hh - cc),
    new THREE.Vector2(-hw, -hh + cc),
  ];
}

/**
 * Creates a rounded-corner 2D cross section with exact dimensions w x h and corner radius r.
 */
export function makeRoundedRectProfile(
  w: number,
  h: number,
  r: number,
  cornerSegs = 3
): THREE.Vector2[] {
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw * 0.48, hh * 0.48);
  const pts: THREE.Vector2[] = [];
  const corners = [
    { cx: hw - rr, cy: -hh + rr, a0: -Math.PI / 2, a1: 0 },
    { cx: hw - rr, cy: hh - rr, a0: 0, a1: Math.PI / 2 },
    { cx: -hw + rr, cy: hh - rr, a0: Math.PI / 2, a1: Math.PI },
    { cx: -hw + rr, cy: -hh + rr, a0: Math.PI, a1: (3 * Math.PI) / 2 },
  ];
  for (const corner of corners) {
    for (let i = 0; i <= cornerSegs; i++) {
      const a = corner.a0 + ((corner.a1 - corner.a0) * i) / cornerSegs;
      pts.push(
        new THREE.Vector2(
          corner.cx + Math.cos(a) * rr,
          corner.cy + Math.sin(a) * rr
        )
      );
    }
  }
  return pts;
}

/**
 * Creates a solid chamfered box with exact outer dimensions (widthX, heightY, depthZ).
 * If baseAtZeroY is true, Y spans [0, heightY]; otherwise centered at 0.
 */
export function createChamferedBox(
  widthX: number,
  heightY: number,
  depthZ: number,
  chamfer = 1.2,
  baseAtZeroY = false
): THREE.BufferGeometry {
  const c = Math.min(chamfer, widthX * 0.25, heightY * 0.25, depthZ * 0.25);
  const yMin = baseAtZeroY ? 0 : -heightY / 2;
  const yMax = baseAtZeroY ? heightY : heightY / 2;

  const profileFull = makeChamferedRectProfile(widthX, depthZ, c);
  const profileBevel = makeChamferedRectProfile(
    widthX - 2 * c,
    depthZ - 2 * c,
    c * 0.35
  );

  const toRing = (prof: THREE.Vector2[], y: number) =>
    prof.map((p) => new THREE.Vector3(p.x, y, p.y));

  return createClosedLoft([
    toRing(profileBevel, yMin),
    toRing(profileFull, yMin + c),
    toRing(profileFull, yMax - c),
    toRing(profileBevel, yMax),
  ]);
}

/**
 * Sweeps a variable-scale 2D profile along a 3D spine curve using stable parallel transport.
 * Produces a watertight closed BufferGeometry with chamfered end caps.
 */
export function createSweptProfile(
  stations: Array<{
    pos: THREE.Vector3;
    width: number;
    height: number;
    chamfer: number;
    roll?: number;
  }>,
  baseUp = new THREE.Vector3(0, 0, 1)
): THREE.BufferGeometry {
  const rings: THREE.Vector3[][] = [];
  const n = stations.length;
  const prevTangent = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const st = stations[i];
    if (i === 0) {
      tangent.subVectors(stations[1].pos, st.pos).normalize();
    } else if (i === n - 1) {
      tangent.subVectors(st.pos, stations[i - 1].pos).normalize();
    } else {
      tangent.subVectors(stations[i + 1].pos, stations[i - 1].pos).normalize();
    }

    if (i === 0) {
      // Pick initial binormal orthogonal to tangent and aligned closely with baseUp
      normal.crossVectors(baseUp, tangent);
      if (normal.lengthSq() < 1e-6) {
        normal.crossVectors(new THREE.Vector3(1, 0, 0), tangent);
      }
      normal.normalize();
      binormal.crossVectors(tangent, normal).normalize();
    } else {
      // Parallel transport binormal from previous frame
      const q = new THREE.Quaternion().setFromUnitVectors(prevTangent, tangent);
      binormal.applyQuaternion(q).normalize();
      normal.crossVectors(binormal, tangent).normalize();
    }
    prevTangent.copy(tangent);

    const prof = makeRoundedRectProfile(st.width, st.height, st.chamfer, 2);
    const ring: THREE.Vector3[] = [];
    for (const p of prof) {
      const worldPt = st.pos
        .clone()
        .addScaledVector(normal, p.x)
        .addScaledVector(binormal, p.y);
      ring.push(worldPt);
    }
    rings.push(ring);
  }

  // Add chamfered end caps at both ends for clean CAD bevels
  const first = stations[0];
  const last = stations[n - 1];
  const tStart = new THREE.Vector3().subVectors(stations[1].pos, first.pos).normalize();
  const tEnd = new THREE.Vector3().subVectors(last.pos, stations[n - 2].pos).normalize();

  const insetRing = (ring: THREE.Vector3[], center: THREE.Vector3, scale: number, shift: THREE.Vector3) =>
    ring.map((p) =>
      p
        .clone()
        .sub(center)
        .multiplyScalar(scale)
        .add(center)
        .add(shift)
    );

  const startCap = insetRing(rings[0], first.pos, 0.72, tStart.clone().multiplyScalar(-1.0));
  const endCap = insetRing(rings[rings.length - 1], last.pos, 0.72, tEnd.clone().multiplyScalar(1.0));

  return createClosedLoft([startCap, ...rings, endCap], true);
}

/**
 * Computes exact triangle count, signed volume (cm3), filament mass (PLA 1.24g/cm3),
 * and bounding dimensions (mm) for an Object3D hierarchy.
 */
export function computeObjectStats(root: THREE.Object3D): MeshStats {
  root.updateMatrixWorld(true);
  let triangles = 0;
  let totalVolMm3 = 0;
  const box = new THREE.Box3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();

  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geo = child.geometry as THREE.BufferGeometry;
      const pos = geo.getAttribute('position');
      if (!pos) return;
      const mat = child.matrixWorld;
      const index = geo.getIndex();

      if (index) {
        const arr = index.array;
        triangles += arr.length / 3;
        for (let i = 0; i < arr.length; i += 3) {
          a.fromBufferAttribute(pos, arr[i]).applyMatrix4(mat);
          b.fromBufferAttribute(pos, arr[i + 1]).applyMatrix4(mat);
          c.fromBufferAttribute(pos, arr[i + 2]).applyMatrix4(mat);
          box.expandByPoint(a);
          box.expandByPoint(b);
          box.expandByPoint(c);
          cross.crossVectors(b, c);
          totalVolMm3 += a.dot(cross) / 6;
        }
      } else {
        triangles += pos.count / 3;
        for (let i = 0; i < pos.count; i += 3) {
          a.fromBufferAttribute(pos, i).applyMatrix4(mat);
          b.fromBufferAttribute(pos, i + 1).applyMatrix4(mat);
          c.fromBufferAttribute(pos, i + 2).applyMatrix4(mat);
          box.expandByPoint(a);
          box.expandByPoint(b);
          box.expandByPoint(c);
          cross.crossVectors(b, c);
          totalVolMm3 += a.dot(cross) / 6;
        }
      }
    }
  });

  const size = new THREE.Vector3();
  if (!box.isEmpty()) {
    box.getSize(size);
  }
  const volumeCm3 = Math.abs(totalVolMm3) / 1000;
  // Typical 3D print (4 walls + 25% infill) uses ~55% of solid volume
  const estimatedGramsPla = volumeCm3 * 1.24 * 0.58;

  return {
    triangles: Math.round(triangles),
    volumeCm3: Number(volumeCm3.toFixed(1)),
    estimatedGramsPla: Number(estimatedGramsPla.toFixed(1)),
    boundsMm: {
      x: Number(size.x.toFixed(1)),
      y: Number(size.y.toFixed(1)),
      z: Number(size.z.toFixed(1)),
    },
  };
}
