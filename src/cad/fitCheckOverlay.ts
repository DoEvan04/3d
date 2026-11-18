import * as THREE from 'three';
import { createClosedLoft, createSweptProfile } from './manifoldHelpers';
import { CadParameters } from './specs';

/**
 * Creates a crisp high-DPI CanvasTexture label sprite for CAD dimensions.
 */
function createDimensionSprite(
  text: string,
  subtext: string | null,
  maxAnisotropy: number
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const w = 360;
  const h = subtext ? 96 : 68;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, w, h);

  // Crisp drafting tag background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  const r = 10;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, r);
  ctx.fill();

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 28px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, subtext ? h * 0.37 : h * 0.52);

  if (subtext) {
    ctx.fillStyle = '#93c5fd';
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.fillText(subtext, w / 2, h * 0.72);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  const worldScale = 0.145;
  sprite.scale.set(w * worldScale, h * worldScale, 1);
  sprite.renderOrder = 20;
  return sprite;
}

/**
 * Helper to create a clean CAD dimension line with extension ticks.
 */
function addDimensionLine(
  parent: THREE.Group,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  extDir: THREE.Vector3,
  extLen: number,
  color = 0x1d4ed8
) {
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
  });

  const pts = [
    p1.clone().addScaledVector(extDir, -extLen * 0.4),
    p1.clone().addScaledVector(extDir, extLen * 0.6),
    p1,
    p2,
    p2.clone().addScaledVector(extDir, -extLen * 0.4),
    p2.clone().addScaledVector(extDir, extLen * 0.6),
  ];

  // Build disconnected segments so it renders crisp architectural ticks
  const segPts: THREE.Vector3[] = [
    p1,
    p2,
    p1.clone().addScaledVector(extDir, -extLen * 0.35),
    p1.clone().addScaledVector(extDir, extLen * 0.55),
    p2.clone().addScaledVector(extDir, -extLen * 0.35),
    p2.clone().addScaledVector(extDir, extLen * 0.55),
  ];
  void pts;

  const geo = new THREE.BufferGeometry().setFromPoints(segPts);
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 15;
  parent.add(lines);
}

/**
 * Builds 3D engineering dimension callout lines & labels around Part B.
 */
export function buildDimensionGuidesGroup(
  params: CadParameters,
  maxAnisotropy: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'DimensionGuides';

  const cradleLeftX = -38.0;
  const cradleRightX = cradleLeftX + params.cradleWidth;
  const upperJawTopY = 12.0 + params.jawOpening + 12.0;

  // 1. Overall Height: 240.0 mm
  const hX = -52.0;
  addDimensionLine(
    group,
    new THREE.Vector3(hX, 0, 0),
    new THREE.Vector3(hX, params.overallHeight, 0),
    new THREE.Vector3(1, 0, 0),
    12,
    0x0f172a
  );
  const hLabel = createDimensionSprite(
    `${params.overallHeight.toFixed(1)} mm`,
    'Overall Height',
    maxAnisotropy
  );
  hLabel.position.set(hX - 24, params.overallHeight * 0.52, 0);
  group.add(hLabel);

  // 2. Clamp Jaw Opening: 40.0 mm
  const jX = 36.0;
  addDimensionLine(
    group,
    new THREE.Vector3(jX, 12.0, 0),
    new THREE.Vector3(jX, 12.0 + params.jawOpening, 0),
    new THREE.Vector3(-1, 0, 0),
    10,
    0x1d4ed8
  );
  const jLabel = createDimensionSprite(
    `${params.jawOpening.toFixed(1)} mm`,
    'Desk Jaw Capacity',
    maxAnisotropy
  );
  jLabel.position.set(jX + 26, 12.0 + params.jawOpening * 0.5, 0);
  group.add(jLabel);

  // 3. Headphone Cradle Width: 115.0 mm
  const cY = params.overallHeight + 14.0;
  addDimensionLine(
    group,
    new THREE.Vector3(cradleLeftX, cY, 0),
    new THREE.Vector3(cradleRightX, cY, 0),
    new THREE.Vector3(0, -1, 0),
    10,
    0x1d4ed8
  );
  const cLabel = createDimensionSprite(
    `${params.cradleWidth.toFixed(1)} mm · R${params.cradleRadius.toFixed(0)}`,
    'Cradle Span & Curve',
    maxAnisotropy
  );
  cLabel.position.set((cradleLeftX + cradleRightX) * 0.5, cY + 13, 0);
  group.add(cLabel);

  // 4. M10 Thread + 0.20mm Clearance Callout
  const mLabel = createDimensionSprite(
    `M${params.threadMajorDiameter.toFixed(0)} × ${params.threadPitch.toFixed(1)}`,
    `${params.clearanceGap.toFixed(2)} mm PLA/PETG Clearance`,
    maxAnisotropy
  );
  mLabel.position.set(42, -16, 16);
  group.add(mLabel);

  // Leader line to M10 bore
  const leaderGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(12, 6, 0),
    new THREE.Vector3(26, -12, 10),
  ]);
  group.add(
    new THREE.Line(
      leaderGeo,
      new THREE.LineBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.75 })
    )
  );

  // Keep reference to avoid unused warning
  void upperJawTopY;

  return group;
}

/**
 * Builds translucent ghost reference models (40mm Desk Edge, Razer BlackShark V2 X headset,
 * and PS5 DualSense controller) to verify ergonomic fitment and zero button/stick strain.
 */
export function buildFitCheckOverlayGroup(params: CadParameters): THREE.Group {
  const group = new THREE.Group();
  group.name = 'FitCheckOverlay';

  const deskMat = new THREE.MeshPhysicalMaterial({
    color: 0x64748b,
    roughness: 0.5,
    metalness: 0.05,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const headsetMat = new THREE.MeshPhysicalMaterial({
    color: 0x059669, // Razer-inspired subtle emerald tint for fit check
    roughness: 0.45,
    metalness: 0.1,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  const dualSenseMat = new THREE.MeshPhysicalMaterial({
    color: 0x2563eb, // PlayStation cobalt tint for fit check
    roughness: 0.35,
    metalness: 0.12,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });

  // 1. 40mm Desk Slab inside Jaw Opening (y = 12 .. 52)
  const deskSlab = new THREE.Mesh(
    new THREE.BoxGeometry(85, params.jawOpening - 0.6, 110),
    deskMat
  );
  deskSlab.position.set(34, 12.0 + params.jawOpening / 2, 0);
  deskSlab.renderOrder = 5;
  group.add(deskSlab);

  // 2. Razer BlackShark V2 X Ghost Headset resting on the 115mm R60mm Cradle
  // Headband wraps across Z (earcups hang down on -Z and +Z sides of the cradle)
  const headsetGroup = new THREE.Group();
  const crownX = 33.0;
  const crownY = params.overallHeight + 2.5;

  // Padded headband arch along Z (R ~ 76mm arch)
  const bandStations: Array<{
    pos: THREE.Vector3;
    width: number;
    height: number;
    chamfer: number;
  }> = [];
  for (let i = 0; i <= 16; i++) {
    const a = ((i / 16) - 0.5) * Math.PI * 0.92;
    const z = Math.sin(a) * 76;
    const y = crownY - (1 - Math.cos(a)) * 68;
    bandStations.push({
      pos: new THREE.Vector3(crownX, y, z),
      width: 34,
      height: 11,
      chamfer: 4,
    });
  }
  const bandGeo = createSweptProfile(bandStations, new THREE.Vector3(1, 0, 0));
  const bandMesh = new THREE.Mesh(bandGeo, headsetMat);
  bandMesh.renderOrder = 6;
  headsetGroup.add(bandMesh);

  // Twin oval earcups (Razer BlackShark V2 X: ~98mm tall x 78mm wide x 40mm thick)
  for (const side of [-1, 1]) {
    const cupGeo = new THREE.CylinderGeometry(39, 39, 34, 24);
    cupGeo.rotateX(Math.PI / 2);
    cupGeo.scale(0.84, 1.15, 1.0);
    const cupMesh = new THREE.Mesh(cupGeo, headsetMat);
    cupMesh.position.set(crownX, crownY - 104, side * 66);
    cupMesh.renderOrder = 6;
    headsetGroup.add(cupMesh);

    // Wire sliders connecting headband to earcups
    const wireGeo = new THREE.CylinderGeometry(2.0, 2.0, 42, 8);
    const wireMesh = new THREE.Mesh(wireGeo, headsetMat);
    wireMesh.position.set(crownX, crownY - 66, side * 72);
    headsetGroup.add(wireMesh);
  }
  group.add(headsetGroup);

  // 3. PlayStation 5 DualSense Ghost Controller seated cleanly in the mount
  const controllerGroup = new THREE.Group();
  const upperJawTopY = 12.0 + params.jawOpening + 12.0;
  const stalkX = params.armReach - 8.0;

  // Position and tilt DualSense (~26 deg reclined) so rear shoulders rest in Y-fork
  // and grip undersides rest in the twin angled lower prongs
  controllerGroup.position.set(stalkX + 18, upperJawTopY + 46, 0);
  controllerGroup.rotation.z = THREE.MathUtils.degToRad(-26);
  controllerGroup.rotation.y = Math.PI / 2;

  // Center bridge / touchpad housing (~86mm wide x 54mm tall x 32mm thick)
  const centerBody = new THREE.Mesh(
    new THREE.BoxGeometry(88, 52, 32),
    dualSenseMat
  );
  centerBody.renderOrder = 7;
  controllerGroup.add(centerBody);

  // Left & Right ergonomic contoured grips flaring outward & downward
  for (const side of [-1, 1]) {
    const gripRings: THREE.Vector3[][] = [];
    const gripLen = 68;
    for (let s = 0; s <= 10; s++) {
      const u = s / 10;
      const gx = side * (40 + u * 22);
      const gy = 14 - u * gripLen;
      const gz = -4 - u * 10;
      const rad = 18 - u * 5.5;
      const ring: THREE.Vector3[] = [];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        ring.push(new THREE.Vector3(gx + Math.cos(a) * rad, gy, gz + Math.sin(a) * rad * 1.08));
      }
      gripRings.push(ring);
    }
    const gripGeo = createClosedLoft(gripRings, true);
    const gripMesh = new THREE.Mesh(gripGeo, dualSenseMat);
    gripMesh.renderOrder = 7;
    controllerGroup.add(gripMesh);

    // Thumbstick silhouette (showing clearance!)
    const stickGeo = new THREE.CylinderGeometry(8.5, 8.5, 11, 16);
    stickGeo.rotateX(Math.PI / 2);
    const stickMesh = new THREE.Mesh(stickGeo, dualSenseMat);
    stickMesh.position.set(side * 22, -6, 20);
    controllerGroup.add(stickMesh);
  }

  group.add(controllerGroup);
  return group;
}
