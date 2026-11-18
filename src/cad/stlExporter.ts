import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

export type StlExportTarget = 'part-a' | 'part-b' | 'print-plate';

/**
 * Rotates Y-up Three.js coordinates into Z-up millimeter slicer coordinates (x, -z, y)
 * and shifts the lowest Z vertex cleanly onto Z = 0 build plate.
 */
function prepareForSlicerZUp(root: THREE.Object3D): THREE.Group {
  const wrapper = new THREE.Group();
  const clone = root.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.set(1, 1, 1);

  wrapper.add(clone);
  // Rotate +90 deg around X converts Three.js +Y up into Slicer +Z up: (x, y, z) -> (x, -z, y)
  wrapper.rotation.x = Math.PI / 2;
  wrapper.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(wrapper);
  if (!box.isEmpty()) {
    wrapper.position.z -= box.min.z;
    // Center X/Y around build plate origin
    const center = new THREE.Vector3();
    box.getCenter(center);
    wrapper.position.x -= center.x;
    wrapper.position.y -= center.y;
  }
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

/**
 * Lays Part B flat on its side for maximum FDM C-clamp layer strength and zero tall overhangs,
 * converts to Z-up millimeters, and rests flush on Z = 0.
 */
function preparePartBPrintFlatZUp(partB: THREE.Object3D): THREE.Group {
  const wrapper = new THREE.Group();
  const clone = partB.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.set(1, 1, 1);

  wrapper.add(clone);
  // Part B's side profile is in the XY plane! Keeping Z as Z (Wait: Three.js Z is depth!).
  // So in Slicer Z-up, leaving Part B unrotated (so Three.js X->STL X, Y->STL Y, Z->STL Z)
  // lays the C-clamp & 240mm tower flat on the XY print bed!
  wrapper.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(wrapper);
  if (!box.isEmpty()) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    wrapper.position.x -= center.x;
    wrapper.position.y -= center.y;
    wrapper.position.z -= box.min.z;
  }
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

export function exportPartToBinarySTL(
  target: StlExportTarget,
  partA: THREE.Object3D,
  partB: THREE.Object3D,
  printFlatPartB = true
): { blob: Blob; filename: string } {
  const exporter = new STLExporter();
  const exportScene = new THREE.Group();

  let filename = 'clamp_stand.stl';

  if (target === 'part-a') {
    // Part A prints upright on its flat 5-lobed knob bottom at Z = 0
    const aReady = prepareForSlicerZUp(partA);
    exportScene.add(aReady);
    filename = 'part_a_m10_clamp_screw.stl';
  } else if (target === 'part-b') {
    const bReady = printFlatPartB
      ? preparePartBPrintFlatZUp(partB)
      : prepareForSlicerZUp(partB);
    exportScene.add(bReady);
    filename = 'part_b_clamp_stand.stl';
  } else {
    // Combined Print Plate: Part B flat on XY bed + Part A upright on knob next to it
    const bReady = preparePartBPrintFlatZUp(partB);
    const aReady = prepareForSlicerZUp(partA);

    bReady.updateMatrixWorld(true);
    const bBox = new THREE.Box3().setFromObject(bReady);
    aReady.position.x = (bBox.isEmpty() ? 0 : bBox.min.x) - 34;
    aReady.position.y = -40;

    exportScene.add(bReady);
    exportScene.add(aReady);
    filename = 'clamp_stand_complete_plate.stl';
  }

  exportScene.updateMatrixWorld(true);
  const buffer = exporter.parse(exportScene, { binary: true }) as DataView;
  const arrayCopy = new Uint8Array(buffer.byteLength);
  arrayCopy.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  const blob = new Blob([arrayCopy], { type: 'model/stl' });
  return { blob, filename };
}

export function triggerStlDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
