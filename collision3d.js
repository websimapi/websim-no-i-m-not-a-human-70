import * as THREE from 'three';

const barnColliders = [];
const PLAYER_RADIUS = 0.8;
let interiorCylinder = null;
let doorCollider = null;
let isDoorOpen = false;

export function initializeBarnInteriorCollider(cylinderMesh) {
    const worldPos = new THREE.Vector3();
    cylinderMesh.getWorldPosition(worldPos);
    interiorCylinder = {
        center: new THREE.Vector2(worldPos.x, worldPos.z),
        radius: cylinderMesh.geometry.parameters.radiusTop,
    };
}

export function setDoorState(isOpen) {
    isDoorOpen = isOpen;
}

export function initializeColliders(barnGroup) {
    barnColliders.length = 0; // Clear existing colliders
    interiorCylinder = null; // Clear interior collider too
    doorCollider = null;

    const BARN_WIDTH = 12;
    const BARN_DEPTH = 18;
    const EXT_WIDTH = 5;
    const EXT_DEPTH = 8;

    const t = 1.0, yMin = 0, yMax = 4; // Increased thickness and height
    const halfW = BARN_WIDTH/2, halfD = BARN_DEPTH/2;
    const gx = barnGroup.position.x, gz = barnGroup.position.z;

    const mk = (cx, cz, w, d) => {
        const min = new THREE.Vector3(cx - w/2, yMin, cz - d/2);
        const max = new THREE.Vector3(cx + w/2, yMax, cz + d/2);
        barnColliders.push(new THREE.Box3(min, max));
    };

    // Door parameters
    const doorX = -2.5, doorW = 1.25, doorH = 2.2;
    const doorLeft = doorX - doorW/2, doorRight = doorX + doorW/2;
    const frontWallZ = gz + halfD;

    // Front wall segments (split around door)
    const leftFrontW = halfW + doorLeft;
    const rightFrontW = halfW - doorRight;
    
    if (leftFrontW > 0.1) {
        mk(gx - (halfW - leftFrontW/2), frontWallZ, leftFrontW, t);
    }
    if (rightFrontW > 0.1) {
        mk(gx + (halfW - rightFrontW/2), frontWallZ, rightFrontW, t);
    }
    
    // Door area collider (when door is closed)
    doorCollider = new THREE.Box3(
        new THREE.Vector3(gx + doorLeft, yMin, frontWallZ - t/2),
        new THREE.Vector3(gx + doorRight, doorH, frontWallZ + t/2)
    );

    // Other walls
    mk(gx, gz - halfD, BARN_WIDTH, t);     // back wall
    mk(gx - halfW, gz, t, BARN_DEPTH);     // left wall  
    mk(gx + halfW, gz, t, BARN_DEPTH);     // right wall

    // Extension walls
    const extCx = gx - (BARN_WIDTH / 2 + EXT_WIDTH / 2);
    const extCz = gz - 2;
    mk(extCx, extCz + EXT_DEPTH/2, EXT_WIDTH, t);
    mk(extCx, extCz - EXT_DEPTH/2, EXT_WIDTH, t);
    mk(extCx - EXT_WIDTH/2, extCz, t, EXT_DEPTH);
    mk(extCx + EXT_WIDTH/2, extCz, t, EXT_DEPTH);
}

export function isValidPosition(position, isInsideBarn = false) {
    const expandedRadius = PLAYER_RADIUS + 0.1; // Add small buffer
    
    // Check main barn colliders
    for (const box of barnColliders) {
        const expandedBox = box.clone();
        expandedBox.expandByScalar(expandedRadius);
        if (expandedBox.containsPoint(position)) {
            return false;
        }
    }
    
    // Check door collider only if door is closed
    if (doorCollider && !isDoorOpen) {
        const expandedDoor = doorCollider.clone();
        expandedDoor.expandByScalar(expandedRadius);
        if (expandedDoor.containsPoint(position)) {
            return false;
        }
    }
    
    // Interior cylinder bounds check
    if (isInsideBarn && interiorCylinder) {
        const p2d = new THREE.Vector2(position.x, position.z);
        const distSq = p2d.distanceToSquared(interiorCylinder.center);
        const effectiveRadius = interiorCylinder.radius - expandedRadius;
        if (distSq > effectiveRadius * effectiveRadius) {
            return false;
        }
    }
    
    return true;
}

export function resolveCollision(oldPos, delta, isInsideBarn = false) {
    const newPos = oldPos.clone().add(delta);
    
    // If new position is valid, use it
    if (isValidPosition(newPos, isInsideBarn)) {
        return newPos;
    }
    
    // Try X movement only
    const xOnlyPos = oldPos.clone().add(new THREE.Vector3(delta.x, 0, 0));
    if (isValidPosition(xOnlyPos, isInsideBarn)) {
        return xOnlyPos;
    }
    
    // Try Z movement only  
    const zOnlyPos = oldPos.clone().add(new THREE.Vector3(0, 0, delta.z));
    if (isValidPosition(zOnlyPos, isInsideBarn)) {
        return zOnlyPos;
    }
    
    // If inside barn and hitting cylinder boundary, project back
    if (isInsideBarn && interiorCylinder) {
        const p2d = new THREE.Vector2(newPos.x, newPos.z);
        const centerToPos = p2d.clone().sub(interiorCylinder.center);
        const distance = centerToPos.length();
        const maxDistance = interiorCylinder.radius - PLAYER_RADIUS - 0.1;
        
        if (distance > maxDistance) {
            const corrected = interiorCylinder.center.clone().add(
                centerToPos.normalize().multiplyScalar(maxDistance)
            );
            return new THREE.Vector3(corrected.x, oldPos.y, corrected.y);
        }
    }
    
    // No valid movement, stay in place
    return oldPos;
}

// Helper function to check if a path between two points is clear
export function isPathClear(start, end, isInsideBarn = false) {
    const direction = end.clone().sub(start);
    const distance = direction.length();
    const steps = Math.ceil(distance / 0.2); // Check every 20cm
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const testPos = start.clone().lerp(end, t);
        if (!isValidPosition(testPos, isInsideBarn)) {
            return false;
        }
    }
    return true;
}