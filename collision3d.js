import * as THREE from 'three';

const barnColliders = [];
const PLAYER_RADIUS = 0.8;
let interiorCylinder = null;

export function initializeBarnInteriorCollider(cylinderMesh) {
    const worldPos = new THREE.Vector3();
    cylinderMesh.getWorldPosition(worldPos);
    interiorCylinder = {
        center: new THREE.Vector2(worldPos.x, worldPos.z),
        radius: cylinderMesh.geometry.parameters.radiusTop,
    };
}

export function initializeColliders(barnGroup) {
    barnColliders.length = 0; // Clear existing colliders
    interiorCylinder = null; // Clear interior collider too

    const BARN_WIDTH = 12;
    const BARN_DEPTH = 18;
    const EXT_WIDTH = 5;
    const EXT_DEPTH = 8;

    const t = 0.8, yMin = 0, yMax = 3;
    const halfW = BARN_WIDTH/2, halfD = BARN_DEPTH/2;
    const gx = barnGroup.position.x, gz = barnGroup.position.z;

    const mk = (cx, cz, w, d) => {
        const min = new THREE.Vector3(gx + cx - w/2, yMin, gz + cz - d/2);
        const max = new THREE.Vector3(gx + cx + w/2, yMax, gz + cz + d/2);
        barnColliders.push(new THREE.Box3(min, max));
    };

    // Main barn perimeter walls
    // front wall split around real doorway opening
    const doorX = -2.5, doorW = 1.25;
    const leftFrontW  = (halfW + (doorX - doorW/2));
    const rightFrontW = (halfW - (doorX + doorW/2));
    const leftFrontX = -(halfW - leftFrontW/2);
    const rightFrontX = (halfW - rightFrontW/2);

    if (leftFrontW > 0.01)  mk(leftFrontX, halfD, leftFrontW, t);
    if (rightFrontW > 0.01) mk(rightFrontX, halfD, rightFrontW, t);

    mk(0, -halfD, BARN_WIDTH, t);     // back
    mk(-halfW, 0, t, BARN_DEPTH);     // left
    mk(halfW, 0, t, BARN_DEPTH);     // right

    // Left side extension perimeter
    const extCx = -(BARN_WIDTH / 2 + EXT_WIDTH / 2);
    const extCz = -2;
    mk(extCx, extCz + EXT_DEPTH/2, EXT_WIDTH, t);
    mk(extCx, extCz - EXT_DEPTH/2, EXT_WIDTH, t);
    mk(extCx - EXT_WIDTH/2, extCz, t, EXT_DEPTH);
    mk(extCx + EXT_WIDTH/2, extCz, t, EXT_DEPTH);
}

export function resolveCollision(oldPos, delta, isInsideBarn = false) {
    const tryMove = (dx, dz) => {
        const p = oldPos.clone().add(new THREE.Vector3(dx, 0, dz));
        
        if (isInsideBarn && interiorCylinder) {
            const p2d = new THREE.Vector2(p.x, p.z);
            const distSq = p2d.distanceToSquared(interiorCylinder.center);
            const effectiveRadius = interiorCylinder.radius - PLAYER_RADIUS;
            if (distSq > effectiveRadius * effectiveRadius) {
                // Project back onto the cylinder boundary
                const dir = p2d.sub(interiorCylinder.center).normalize();
                const correctedPos2D = interiorCylinder.center.clone().add(dir.multiplyScalar(effectiveRadius));
                p.x = correctedPos2D.x;
                p.z = correctedPos2D.y;
            }
        }

        for (const box of barnColliders) {
            const b = box.clone(); 
            b.expandByScalar(PLAYER_RADIUS);
            if (b.containsPoint(p)) return null;
        }
        return p;
    };

    let p = tryMove(delta.x, delta.z);
    if (p) return p;
    p = tryMove(delta.x, 0);
    if (p) return p;
    p = tryMove(0, delta.z);
    return p || oldPos;
}