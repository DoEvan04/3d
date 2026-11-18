import * as THREE from 'three';
import {
  createChamferedBox,
  createClosedLoft,
  createSweptProfile,
  ensureOutwardNormals,
} from './manifoldHelpers';
import { CadParameters } from './specs';
import { createInternalThreadBoreInsert } from './threadGeometry';

export interface PartBBuildResult {
  group: THREE.Group;
  boreCenterX: number;
  lowerJawThickness: number;
  upperJawTopY: number;
  cradleLeftX: number;
  cradleRightX: number;
  cradlePeakY: number;
  controllerCenterPos: THREE.Vector3;
}

/**
 * Builds the complete Part B (Clamp Base + 240mm Tower + 115mm R60mm Cradle + DualSense Mount)
 * in millimeter coordinates (Y-up, y=0 at clamp bottom).
 */
export function buildPartBAssembly(
  params: CadParameters,
  material: THREE.Material
): PartBBuildResult {
  const group = new THREE.Group();
  group.name = 'PartB_ClampStand';

  const lowerJawT = 12.0;
  const upperJawT = 12.0;
  const jawOpen = params.jawOpening; // 40.0 mm default
  const upperJawBotY = lowerJawT + jawOpen; // 52.0 mm
  const upperJawTopY = upperJawBotY + upperJawT; // 64.0 mm

  const jawDepthZ = 32.0;
  const spineLeftX = -24.0;
  const spineInnerX = -9.0; // 15mm thick spine
  const jawFrontCenterX = 12.0; // M10 bore center X
  const jawFrontRadius = 16.0; // Front nose reaches x = +28.0 mm

  // ---------------------------------------------------------------------------
  // 1. Lower Jaw Plate with True Circular Hole for Internal M10 Helical Bore
  // ---------------------------------------------------------------------------
  const bevel = 0.8;
  const boreOuterR = 7.6; // Matches outerRadius of internal thread insert

  // Shape in (X, Y_shape) where after rotateX(-PI/2): shape.X -> +X, shape.Y -> -Z
  const lowerShape = new THREE.Shape();
  const rNose = jawFrontRadius - bevel;
  const xLeft = spineLeftX + bevel;
  const halfZ = jawDepthZ / 2 - bevel;

  lowerShape.moveTo(xLeft, -halfZ);
  lowerShape.lineTo(jawFrontCenterX, -halfZ);
  lowerShape.absarc(jawFrontCenterX, 0, rNose, -Math.PI / 2, Math.PI / 2, false);
  lowerShape.lineTo(xLeft, halfZ);
  lowerShape.closePath();

  // Subtract circular hole for the M10 threaded collar (compensating for bevel inward shrink)
  const holePath = new THREE.Path();
  holePath.absarc(jawFrontCenterX, 0, boreOuterR + bevel - 0.12, 0, Math.PI * 2, true);
  lowerShape.holes.push(holePath);

  const lowerGeo = new THREE.ExtrudeGeometry(lowerShape, {
    depth: lowerJawT - 2 * bevel,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 32,
  });
  lowerGeo.rotateX(-Math.PI / 2);
  lowerGeo.computeBoundingBox();
  if (lowerGeo.boundingBox) {
    lowerGeo.translate(0, -lowerGeo.boundingBox.min.y, 0);
  }
  ensureOutwardNormals(lowerGeo);

  const lowerJawMesh = new THREE.Mesh(lowerGeo, material);
  lowerJawMesh.name = 'LowerJawPlate';
  lowerJawMesh.castShadow = true;
  lowerJawMesh.receiveShadow = true;
  group.add(lowerJawMesh);

  // Internal M10 x 1.5 Helical Thread Collar seated cleanly inside the hole
  const threadInsertGeo = createInternalThreadBoreInsert({
    majorDiameter: params.threadMajorDiameter,
    pitch: params.threadPitch,
    clearanceGap: params.clearanceGap,
    outerRadius: boreOuterR,
    height: lowerJawT,
  });
  const threadInsertMesh = new THREE.Mesh(threadInsertGeo, material);
  threadInsertMesh.name = 'InternalM10ThreadBore';
  threadInsertMesh.position.set(jawFrontCenterX, 0, 0);
  threadInsertMesh.castShadow = true;
  threadInsertMesh.receiveShadow = true;
  group.add(threadInsertMesh);

  // ---------------------------------------------------------------------------
  // 2. C-Clamp Spine & Upper Jaw (Exact 40mm Clear Jaw Opening)
  // ---------------------------------------------------------------------------
  // Construct spine + upper jaw in XY with bevel compensation so y_inner = [12.0, 52.0]
  const cBevel = 1.0;
  const cShape = new THREE.Shape();
  const sL = spineLeftX + cBevel;
  const sR = spineInnerX - cBevel;
  const yBot = 0 + cBevel;
  const yInnerBot = lowerJawT - cBevel; // After +1mm bevel -> 12.0 mm!
  const yInnerTop = upperJawBotY + cBevel; // After -1mm bevel -> 52.0 mm!
  const yTop = upperJawTopY - cBevel; // After -1mm bevel -> 64.0 mm!
  const uFrontX = jawFrontCenterX + jawFrontRadius - cBevel; // +27.0 + 1 = +28.0 mm

  const rOuter = 7.0;
  const rInner = 3.5;

  cShape.moveTo(sL + rOuter, yBot);
  cShape.lineTo(sR, yBot);
  cShape.lineTo(sR, yInnerBot); // overlaps seamlessly into lower jaw
  cShape.lineTo(sR, yInnerTop - rInner);
  cShape.quadraticCurveTo(sR, yInnerTop, sR + rInner, yInnerTop);
  cShape.lineTo(uFrontX - 4.0, yInnerTop);
  cShape.quadraticCurveTo(uFrontX, yInnerTop, uFrontX, yInnerTop + 4.0);
  cShape.lineTo(uFrontX, yTop - 4.0);
  cShape.quadraticCurveTo(uFrontX, yTop, uFrontX - 4.0, yTop);
  cShape.lineTo(sL + rOuter, yTop);
  cShape.quadraticCurveTo(sL, yTop, sL, yTop - rOuter);
  cShape.lineTo(sL, yBot + rOuter);
  cShape.quadraticCurveTo(sL, yBot, sL + rOuter, yBot);

  const clampDepthCore = jawDepthZ - 2 * cBevel;
  const spineUpperGeo = new THREE.ExtrudeGeometry(cShape, {
    depth: clampDepthCore,
    bevelEnabled: true,
    bevelSize: cBevel,
    bevelThickness: cBevel,
    bevelSegments: 2,
    curveSegments: 16,
  });
  spineUpperGeo.translate(0, 0, -clampDepthCore / 2);
  ensureOutwardNormals(spineUpperGeo);

  const spineUpperMesh = new THREE.Mesh(spineUpperGeo, material);
  spineUpperMesh.name = 'ClampSpineAndUpperJaw';
  spineUpperMesh.castShadow = true;
  spineUpperMesh.receiveShadow = true;
  group.add(spineUpperMesh);

  // Subtle ribbed rubber-grip pad texture bar on underside of upper jaw
  const upperPadGeo = createChamferedBox(24.0, 2.0, 24.0, 0.7, true);
  const upperPadMesh = new THREE.Mesh(upperPadGeo, material);
  upperPadMesh.position.set(12.0, upperJawBotY - 1.2, 0);
  upperPadMesh.castShadow = true;
  upperPadMesh.receiveShadow = true;
  group.add(upperPadMesh);

  // ---------------------------------------------------------------------------
  // 3. Main Vertical Tower (Rises from Upper Jaw to Headphone Cradle)
  // ---------------------------------------------------------------------------
  const towerCenterX = -15.5;
  const towerBaseY = upperJawTopY - 1.0; // slight overlap into upper jaw
  const cradleRootY = params.overallHeight - 17.5; // ~222.5 mm for 240mm overall

  const towerGeo = createChamferedBox(
    16.5,
    cradleRootY - towerBaseY + 2.0,
    21.0,
    2.2,
    true
  );
  const towerMesh = new THREE.Mesh(towerGeo, material);
  towerMesh.name = 'MainVerticalTower';
  towerMesh.position.set(towerCenterX, towerBaseY, 0);
  towerMesh.castShadow = true;
  towerMesh.receiveShadow = true;
  group.add(towerMesh);

  // Reinforced chamfered transition foot where tower meets upper jaw
  const towerFootGeo = createChamferedBox(22.0, 9.0, 26.0, 2.8, true);
  const towerFootMesh = new THREE.Mesh(towerFootGeo, material);
  towerFootMesh.position.set(towerCenterX + 1.5, upperJawTopY - 2.0, 0);
  towerFootMesh.castShadow = true;
  towerFootMesh.receiveShadow = true;
  group.add(towerFootMesh);

  // ---------------------------------------------------------------------------
  // 4. Sculpted Headphone Cradle (115mm Width, R60mm Ergonomic Curve, 240mm Peak)
  // ---------------------------------------------------------------------------
  // Spans x from cradleLeftX (-38.0) to cradleRightX (+77.0) => exact 115.0 mm width!
  const cradleLeftX = towerCenterX - 22.5; // -38.0 mm
  const cradleRightX = cradleLeftX + params.cradleWidth; // +77.0 mm
  const cradlePeakY = params.overallHeight; // 240.0 mm

  const cradleGeo = buildErgonomicHeadphoneCradle({
    leftX: cradleLeftX,
    rightX: cradleRightX,
    towerX: towerCenterX,
    peakY: cradlePeakY,
    baseY: cradleRootY,
    radius: params.cradleRadius, // R60mm
  });
  const cradleMesh = new THREE.Mesh(cradleGeo, material);
  cradleMesh.name = 'HeadphoneCradle';
  cradleMesh.castShadow = true;
  cradleMesh.receiveShadow = true;
  group.add(cradleMesh);

  // Underside support gusset connecting vertical tower smoothly to cradle bridge
  const gussetGeo = createSweptProfile(
    [
      { pos: new THREE.Vector3(towerCenterX + 2, cradleRootY - 12, 0), width: 14, height: 12, chamfer: 2 },
      { pos: new THREE.Vector3(towerCenterX + 12, cradleRootY - 2, 0), width: 13, height: 10, chamfer: 2 },
      { pos: new THREE.Vector3(towerCenterX + 28, cradleRootY + 2, 0), width: 11, height: 8, chamfer: 1.8 },
    ],
    new THREE.Vector3(0, 0, 1)
  );
  const gussetMesh = new THREE.Mesh(gussetGeo, material);
  gussetMesh.castShadow = true;
  gussetMesh.receiveShadow = true;
  group.add(gussetMesh);

  // ---------------------------------------------------------------------------
  // 5. Horizontal Cantilever Arm & PS5 DualSense Controller Mount
  // ---------------------------------------------------------------------------
  const armEndX = params.armReach; // 84.0 mm
  const armStartX = 20.0; // Overlaps upper jaw
  const armLength = armEndX - armStartX;
  const armGeo = createChamferedBox(armLength, 12.0, 16.0, 1.8, true);
  const armMesh = new THREE.Mesh(armGeo, material);
  armMesh.name = 'ControllerCantileverArm';
  armMesh.position.set(armStartX + armLength / 2, upperJawBotY, 0);
  armMesh.castShadow = true;
  armMesh.receiveShadow = true;
  group.add(armMesh);

  // Stalk & DualSense cradle assembly positioned near end of horizontal arm
  const stalkX = armEndX - 8.0; // +76.0 mm
  const stalkBaseY = upperJawTopY - 1.5;
  const stalkTopY = stalkBaseY + 46.0; // ~108.5 mm

  const stalkGeo = createChamferedBox(15.0, stalkTopY - stalkBaseY + 2.0, 16.0, 2.2, true);
  const stalkMesh = new THREE.Mesh(stalkGeo, material);
  stalkMesh.name = 'ControllerMountStalk';
  stalkMesh.position.set(stalkX, stalkBaseY, 0);
  stalkMesh.castShadow = true;
  stalkMesh.receiveShadow = true;
  group.add(stalkMesh);

  // Upper Y-Fork Arms (angled backward ~14 deg in -X, flaring +/-48 deg in Z to cradle
  // the DualSense upper shoulders between L1/R1 & grip roots without pressing triggers)
  const yForkRoot = new THREE.Vector3(stalkX, stalkTopY - 2.0, 0);
  for (const side of [-1, 1]) {
    const armStations = [
      { pos: yForkRoot.clone().add(new THREE.Vector3(0, -1, side * 1.5)), width: 13.5, height: 13.5, chamfer: 2.2 },
      { pos: yForkRoot.clone().add(new THREE.Vector3(-2.5, 11, side * 12)), width: 12.5, height: 12.5, chamfer: 2.2 },
      { pos: yForkRoot.clone().add(new THREE.Vector3(-5.5, 25, side * 26)), width: 11.5, height: 11.5, chamfer: 2.2 },
    ];
    const yArmGeo = createSweptProfile(armStations, new THREE.Vector3(1, 0, 0));
    const yArmMesh = new THREE.Mesh(yArmGeo, material);
    yArmMesh.name = side < 0 ? 'ControllerYForkLeft' : 'ControllerYForkRight';
    yArmMesh.castShadow = true;
    yArmMesh.receiveShadow = true;
    group.add(yArmMesh);
  }

  // Diagonal Lower Gusset Strut + Horizontal Side Stabilizer Tabs + Dual Angled Grip Prongs
  // This supports the DualSense by the inside curve of its two grips at an ergonomic tilt,
  // leaving analog sticks, D-pad, and face buttons completely clear.
  const braceStations = [
    { pos: new THREE.Vector3(stalkX + 2, stalkBaseY + 3, 0), width: 13.0, height: 11.0, chamfer: 1.8 },
    { pos: new THREE.Vector3(stalkX + 15, stalkBaseY + 14, 0), width: 13.0, height: 10.5, chamfer: 1.8 },
    { pos: new THREE.Vector3(stalkX + 26, stalkBaseY + 24, 0), width: 15.0, height: 10.0, chamfer: 1.8 },
  ];
  const braceGeo = createSweptProfile(braceStations, new THREE.Vector3(0, 0, 1));
  const braceMesh = new THREE.Mesh(braceGeo, material);
  braceMesh.name = 'ControllerLowerBrace';
  braceMesh.castShadow = true;
  braceMesh.receiveShadow = true;
  group.add(braceMesh);

  // Horizontal mid-bridge crossbar (matches reference image's twin horizontal shelf tabs)
  const midShelfGeo = createChamferedBox(18.0, 6.5, 36.0, 1.4, false);
  const midShelfMesh = new THREE.Mesh(midShelfGeo, material);
  midShelfMesh.position.set(stalkX + 11.0, stalkBaseY + 26.0, 0);
  midShelfMesh.castShadow = true;
  midShelfMesh.receiveShadow = true;
  group.add(midShelfMesh);

  // Twin angled lower grip cradle prongs (left & right grips)
  for (const side of [-1, 1]) {
    const prongStations = [
      {
        pos: new THREE.Vector3(stalkX + 20, stalkBaseY + 22, side * 7.5),
        width: 10.5,
        height: 9.5,
        chamfer: 1.8,
      },
      {
        pos: new THREE.Vector3(stalkX + 30, stalkBaseY + 30, side * 14.5),
        width: 9.5,
        height: 8.8,
        chamfer: 1.8,
      },
      {
        pos: new THREE.Vector3(stalkX + 39, stalkBaseY + 38, side * 19.5),
        width: 8.5,
        height: 8.0,
        chamfer: 1.8,
      },
    ];
    const prongGeo = createSweptProfile(prongStations, new THREE.Vector3(0, 1, 0));
    const prongMesh = new THREE.Mesh(prongGeo, material);
    prongMesh.name = side < 0 ? 'ControllerGripProngLeft' : 'ControllerGripProngRight';
    prongMesh.castShadow = true;
    prongMesh.receiveShadow = true;
    group.add(prongMesh);
  }

  return {
    group,
    boreCenterX: jawFrontCenterX,
    lowerJawThickness: lowerJawT,
    upperJawTopY,
    cradleLeftX,
    cradleRightX,
    cradlePeakY,
    controllerCenterPos: new THREE.Vector3(stalkX + 18, stalkBaseY + 48, 0),
  };
}

/**
 * Sculpts the 115mm-wide ergonomic headphone cradle with R60mm curvature,
 * peaking exactly at peakY (240.0 mm), with upturned retention lips at both ends.
 */
function buildErgonomicHeadphoneCradle(opts: {
  leftX: number;
  rightX: number;
  towerX: number;
  peakY: number;
  baseY: number;
  radius: number;
}): THREE.BufferGeometry {
  const { leftX, rightX, peakY, baseY, radius } = opts;
  const span = rightX - leftX; // 115.0 mm
  const numStations = 36;
  const profSegs = 20;

  // R60mm circular arch centered over the primary headband seating zone (x ~ +34 mm)
  const archCenterX = leftX + span * 0.62;
  const R = Math.max(40, radius);

  const rings: THREE.Vector3[][] = [];

  for (let i = 0; i <= numStations; i++) {
    const u = i / numStations; // 0 (left tip) .. 1 (right tip)
    const x = leftX + u * span;

    // Top surface Y follows a sculpted ergonomic curve:
    // - Left horn (u in 0..0.22): upturned retention horn peaking near peakY - 1.5 mm
    // - Bridge dip (u in 0.22..0.38): smooth saddle dip down ~13mm
    // - Main R60mm convex headband arch (u in 0.38..0.92): circular R=60mm arc peaking at exact peakY (240mm)
    // - Right tip (u in 0.92..1.0): subtle upturned lip
    const dx = x - archCenterX;
    const clampedDx = Math.min(Math.abs(dx), R * 0.92);
    const r60Y = peakY - (R - Math.sqrt(R * R - clampedDx * clampedDx));

    const leftHorn = Math.exp(-Math.pow((u - 0.08) / 0.11, 2)) * 15.5;
    const bridgeDip = -Math.exp(-Math.pow((u - 0.30) / 0.14, 2)) * 13.0;
    const rightTip = Math.exp(-Math.pow((u - 0.96) / 0.06, 2)) * 3.5;

    let topY: number;
    if (u < 0.38) {
      const blend = THREE.MathUtils.smoothstep(u, 0.18, 0.42);
      const leftProfileY = baseY + 3.0 + leftHorn + bridgeDip;
      topY = THREE.MathUtils.lerp(leftProfileY, r60Y, blend);
    } else {
      topY = r60Y + rightTip;
    }

    // Clamp strictly so highest point never exceeds peakY (240.0 mm)
    topY = Math.min(peakY, topY);

    // Thickness tapers cleanly toward tips while staying sturdy over the tower
    const endTaper = Math.sin(u * Math.PI);
    const thicknessY = 7.0 + 7.0 * Math.pow(endTaper, 0.55);
    const botY = topY - thicknessY;

    // Z-width: 34mm across headband contact saddle, wider flared wings (38mm) at horns
    const wingFlare =
      Math.exp(-Math.pow((u - 0.12) / 0.14, 2)) * 4.5 +
      Math.exp(-Math.pow((u - 0.72) / 0.18, 2)) * 5.0;
    const halfWidthZ = 14.5 + wingFlare * Math.pow(endTaper, 0.35);

    // Cross-section in (Z, Y) at station X with convex R60mm transverse crown on top
    const ring: THREE.Vector3[] = [];
    for (let s = 0; s < profSegs; s++) {
      const a = (s / profSegs) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      // Squircle/chamfered oval cross-section
      const signC = Math.sign(cosA);
      const signS = Math.sign(sinA);
      const nz = signC * Math.pow(Math.abs(cosA), 0.72);
      const ny = signS * Math.pow(Math.abs(sinA), 0.72);

      const z = nz * halfWidthZ;
      // Add gentle R60mm transverse crown across the top surface for headband comfort
      const crownDrop = ny > 0 ? (z * z) / (2 * R) : 0;
      const yMid = (topY + botY) * 0.5;
      const yHalf = (topY - botY) * 0.5;
      const y = yMid + ny * yHalf - crownDrop;

      ring.push(new THREE.Vector3(x, y, z));
    }
    rings.push(ring);
  }

  // Ensure exact peakY (240.0 mm) is reached at the crown
  let maxObservedY = -Infinity;
  for (const r of rings) {
    for (const p of r) {
      if (p.y > maxObservedY) maxObservedY = p.y;
    }
  }
  const shiftY = peakY - maxObservedY;
  if (Math.abs(shiftY) > 0.01) {
    // Smoothly align peak without lifting the bottom below tower join
    for (let i = 0; i < rings.length; i++) {
      const u = i / numStations;
      const weight = THREE.MathUtils.smoothstep(u, 0.3, 0.65);
      for (const p of rings[i]) {
        p.y += shiftY * weight;
      }
    }
  }

  // Inset end caps for smooth rounded tips
  const capRing = (ring: THREE.Vector3[], dx: number) => {
    const center = new THREE.Vector3();
    for (const p of ring) center.add(p);
    center.divideScalar(ring.length);
    return ring.map((p) =>
      p.clone().sub(center).multiplyScalar(0.58).add(center).add(new THREE.Vector3(dx, 0, 0))
    );
  };

  // Shift rings slightly so exact outer X span remains [leftX, rightX] (115.0 mm)
  const capOffset = 1.4;
  const startCap = capRing(rings[0], 0);
  const endCap = capRing(rings[rings.length - 1], 0);
  for (let i = 0; i < rings.length; i++) {
    const u = i / numStations;
    const xAdjust = THREE.MathUtils.lerp(capOffset, -capOffset, u);
    for (const p of rings[i]) p.x += xAdjust;
  }

  return createClosedLoft([startCap, ...rings, endCap], true);
}
