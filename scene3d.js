import * as THREE from 'three';
import { createControls, setupControlEventListeners, getMovementState, isMobile } from './controls3d.js';
import { createGround, createMoveIndicator, createBarn, createFoliage, createLighting } from './objects3d.js';
import { initializeColliders, resolveCollision, initializeBarnInteriorCollider } from './collision3d.js';

let scene, camera, renderer, controls, raycaster;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();
let animationFrameId = null;
let moveIndicator = null;
let isMovingToTarget = false;
let targetPosition = null;
let walkableObjects = [];
let removeEventListeners = null;
let interactRaycaster = null;
let interactiveTargets = [];
let doorOpening = false, doorOpened = false, doorAngle = 0;
let doorHighlight = null, barnDoorMesh = null, barnExitTrigger = null;
let dollyActive = false, dollyT = 0, dollyStart = null, dollyEnd = null, lookTarget = null, barnGroupRef = null;
let isInsideBarnView = false;
let exitState = 'IDLE'; // 'IDLE', 'OPENING_DOOR', 'DOLLY_OUT', 'CLOSING_DOOR'

// Hardcoded door center X from objects3d.js definition
const DOOR_CENTER_X = -2.5;

/* add helper to detect if player is inside barn bounds */
function isInsideBarn(pos) {
  if (!barnGroupRef) return false;
  const BARN_WIDTH = 12, BARN_DEPTH = 18;
  const cx = barnGroupRef.position.x, cz = barnGroupRef.position.z;
  return Math.abs(pos.x - cx) <= BARN_WIDTH/2 && Math.abs(pos.z - cz) <= BARN_DEPTH/2;
}

const container = document.getElementById('scene-3d-container');
const canvas = document.getElementById('scene-3d-canvas');
const instructions = document.getElementById('scene-3d-instructions');

function onTargetSet(target, hitPoint) {
    if (isInsideBarnView) {
        // When inside, clicking should set a move target. Exiting is handled by clicking the door.
        targetPosition = target;
        isMovingToTarget = true;
        if (moveIndicator) {
            moveIndicator.position.set(hitPoint.x, 0.02, hitPoint.z);
            moveIndicator.visible = true;
            moveIndicator.scale.set(1,1,1);
        }
        return;
    }
    targetPosition = target;
    isMovingToTarget = true;
    if (moveIndicator) {
        moveIndicator.position.set(hitPoint.x, 0.02, hitPoint.z);
        moveIndicator.visible = true;
        moveIndicator.scale.set(1,1,1);
    }
}

/* add reusable opener so desktop and mobile share it */
function openDoor(isExiting = false) {
    if (doorOpening || doorOpened || !barnDoorMesh || !barnGroupRef || !controls) return;
    if (exitState !== 'IDLE' && !isExiting) return; // Cannot interrupt exit/close sequence if trying to enter

    // If entering, ensure player is outside
    if (!isExiting && isInsideBarnView) return; 
    // If exiting, ensure player is inside
    if (isExiting && !isInsideBarnView) return;

    if (isExiting) {
        exitState = 'OPENING_DOOR';
    }
    
    doorOpening = true; // Initiate physical door open
    
    const playerObj = controls.getObject();
    const playerStartPos = playerObj.position.clone();
    
    // Get door's world position (hinge) to correctly align the path
    const doorWorldPos = new THREE.Vector3();
    barnGroupRef.userData.doorPivot.getWorldPosition(doorWorldPos);
    
    const BARN_WIDTH = 12;
    const BARN_DEPTH = 18;
    const frontWallZ = barnGroupRef.position.z + BARN_DEPTH / 2;
    
    let p1Position; // Control point for the Bezier curve
    
    if (isExiting) {
        // Exit Path: currentPos -> P1 (doorway) -> P2 (pre-entry position)
        
        // Determine the horizontal center of the door opening
        const doorCenterX = barnGroupRef.position.x + DOOR_CENTER_X; // Should be -2.5
        
        // P1: Use a point slightly outside the door, centered on the doorway.
        p1Position = new THREE.Vector3(doorCenterX, 1.7, frontWallZ + 1.5); 
        
        const endPos = dollyStart[0].clone(); // dollyStart[0] holds the pre-entry position from the last successful entry
        dollyStart = [playerStartPos, p1Position]; // P0, P1 control point
        dollyEnd = endPos; // Final destination
        lookTarget = null; // Player controls view on exit
    } else {
        // Entry Path: P0 (start) -> P1 (retreat/side, away from swing) -> P2 (inside barn)
        
        // Define P1: Move player towards the hinge side (X_hinge - 0.5) and pull them back (Z_start + 1.5)
        const hingeX = doorWorldPos.x; // approx -3.125
        const retreatZ = playerStartPos.z + 1.5; 

        // Cap retreat point to be outside the wall face (Z > frontWallZ)
        const safeRetreatZ = Math.min(retreatZ, frontWallZ + 2.5); // 2.5 units in front of wall Z = -6

        p1Position = new THREE.Vector3(
            hingeX - 0.5, // Ensure we are slightly beyond the hinge on the safe side
            1.7,
            safeRetreatZ 
        );

        dollyEnd = new THREE.Vector3(
            barnGroupRef.position.x, // Target the center X of the barn interior
            1.7,
            frontWallZ - 3.0 // Positioned closer to the entrance inside the barn
        );
        
        // Store entry point (P0) for later exit path planning.
        const entryStartPos = playerStartPos.clone();
        dollyStart = [entryStartPos, p1Position];
        
        // Player looks slightly further inside
        lookTarget = dollyEnd.clone();
        lookTarget.z -= 10;
        
        // START DOLLY IMMEDIATELY ON ENTRY
        dollyActive = true; 
    }
    
    dollyT = 0; 
}

function startDoorClose() {
    // Only close if the door is open, we are inside, and we aren't already closing/exiting.
    if (doorOpened && !dollyActive && isInsideBarnView && exitState === 'IDLE') {
        exitState = 'CLOSING_DOOR';
    }
}

function exitBarn() {
    if (exitState !== 'IDLE' || dollyActive || !isInsideBarnView) return;

    // IMPORTANT: If dollyStart is not populated (i.e., we somehow loaded directly into the barn), 
    // we need a safe exit point. We assume dollyStart[0] holds the external position near the door (5 units outside).
    if (!dollyStart || !Array.isArray(dollyStart) || dollyStart.length === 0 || dollyStart.length === 1) {
        const doorWorldPos = new THREE.Vector3();
        if (barnGroupRef && barnGroupRef.userData.doorPivot) barnGroupRef.userData.doorPivot.getWorldPosition(doorWorldPos);
        else doorWorldPos.set(0, 1.7, -15); // Fallback if barnRef is missing
        
        // Define a pseudo-start position for the exit path
        const safeExitPos = new THREE.Vector3(doorWorldPos.x, 1.7, doorWorldPos.z + 5);
        dollyStart = [safeExitPos]; 
        
        // Temporarily move player to a point slightly inside the door to ensure path works (fallback only)
        const BARN_DEPTH = 18;
        controls.getObject().position.set(barnGroupRef.position.x, 1.7, barnGroupRef.position.z + BARN_DEPTH / 2 - 2.5);
    }

    // Clear any movement target when exiting
    isMovingToTarget = false;
    if (moveIndicator) moveIndicator.visible = false;
    
    openDoor(true);
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    if (!renderer || !scene || !camera) { cancelAnimationFrame(animationFrameId); animationFrameId = null; return; }

    if (!controls || !controls.getObject) { cancelAnimationFrame(animationFrameId); animationFrameId = null; return; }

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    const player = controls.getObject();
    
    const canMoveToTarget = (isMobile || isInsideBarnView) && isMovingToTarget && targetPosition;

    if (isInsideBarnView) {
        container.dataset.insideBarn = 'true';
        if (isMobile) {
            // Mobile: keep looking around enabled
        } else {
            // Desktop: ensure cursor is free for tap-to-move
            if (document.pointerLockElement === canvas) {
                document.exitPointerLock();
            }
        }
    } else {
        container.dataset.insideBarn = 'false';
    }
    
    if (canMoveToTarget) {
        const distance = player.position.distanceTo(targetPosition);
        if (moveIndicator && moveIndicator.visible) {
            const t = time * 0.004;
            const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.15;
            moveIndicator.scale.setScalar(THREE.MathUtils.clamp(distance * 0.12, 0.6, 2.2) * pulse);
        }
        
        if (distance < 0.3) {
            // Reached target
            isMovingToTarget = false;
            targetPosition = null;
            if (moveIndicator) moveIndicator.visible = false;
        } else {
            // Move towards target
            const direction = targetPosition.clone().sub(player.position).normalize();
            const moveSpeed = Math.min(distance * 3, 5); // Speed based on distance
            const moveVector = direction.multiplyScalar(moveSpeed * delta);
            const newPosition = resolveCollision(player.position, moveVector, isInsideBarnView);
            if (newPosition.equals(player.position)) {
                isMovingToTarget = false; targetPosition = null; if (moveIndicator) moveIndicator.visible = false;
            } else {
                player.position.copy(newPosition);
            }
        }
    } else if (!isMobile && !isInsideBarnView) {
        // Desktop controls (only outside the barn)
        const movementState = getMovementState();
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(movementState.moveForward) - Number(movementState.moveBackward);
        direction.x = Number(movementState.moveRight) - Number(movementState.moveLeft);
        direction.normalize();

        if (movementState.moveForward || movementState.moveBackward) velocity.z -= direction.z * 40.0 * delta;
        if (movementState.moveLeft || movementState.moveRight) velocity.x -= direction.x * 40.0 * delta;

        const moveDeltaX = -velocity.x * delta, moveDeltaZ = -velocity.z * delta;
        const forward = new THREE.Vector3(); controls.getObject().getWorldDirection(forward); forward.y = 0; forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
        const desired = forward.multiplyScalar(moveDeltaZ).add(right.multiplyScalar(moveDeltaX));
        const resolved = resolveCollision(player.position, desired, isInsideBarnView);
        player.position.copy(resolved);
    }

    // Keep player on ground
    if (controls) {
        player.position.y = 1.7;
    }

    // Door opening animation
    if (doorOpening && !doorOpened) {
        const target = -Math.PI * 0.65;
        doorAngle = THREE.MathUtils.damp(doorAngle, target, 8, delta); // Increased damping factor for faster swing
        const pivot = interactiveTargets[0];
        if (pivot) pivot.rotation.y = doorAngle;
        // keep the physical door visible while it swings and after it opens
        if (Math.abs(doorAngle - target) < 0.02) { 
            doorOpened = true; 
            doorOpening = false; 
            initializeColliders(barnGroupRef, true); // Re-init colliders with door open
            if (barnGroupRef.userData.interiorSurface) initializeBarnInteriorCollider(barnGroupRef.userData.interiorSurface);

            if (exitState === 'OPENING_DOOR') {
                 // Exit Phase 1 -> Phase 2: Start dolly movement
                 dollyActive = true;
                 exitState = 'DOLLY_OUT';
            } else if (!isInsideBarnView && dollyActive) {
                // Entry Phase 1 (Door Open) complete. Dolly continues.
            }
        }
    }

    // Door closing animation (used for auto-close after entry or mandated exit close)
    if (exitState === 'CLOSING_DOOR') {
        const targetAngle = 0; // Closed
        doorAngle = THREE.MathUtils.damp(doorAngle, targetAngle, 6, delta); // Increased damping factor for faster close
        const pivot = interactiveTargets[0];
        if (pivot) pivot.rotation.y = doorAngle;
        if (Math.abs(doorAngle - targetAngle) < 0.02) {
            doorOpened = false;
            initializeColliders(barnGroupRef, false); // Re-init colliders with door closed
            if (barnGroupRef.userData.interiorSurface) initializeBarnInteriorCollider(barnGroupRef.userData.interiorSurface);
            exitState = 'IDLE'; // Done closing
        }
    }

    // Door proximity highlight + pointer cursor
    if (doorHighlight && barnDoorMesh && !doorOpening && !doorOpened) {
        const doorPos = new THREE.Vector3(); barnDoorMesh.getWorldPosition(doorPos);
        const dist = controls.getObject().position.distanceTo(doorPos);
        const active = dist < 3.5;
        doorHighlight.visible = active;
        if (active) {
            doorHighlight.material.opacity = 0.65 + Math.sin(time * 0.012) * 0.2;
            container.style.cursor = 'pointer';
            container.dataset.interact = '1';
        } else if (!isInsideBarnView) { // Don't clear cursor if inside barn (we need it for tap-to-move)
            container.style.cursor = '';
            container.dataset.interact = '';
        }
    }

    prevTime = time;
    // Dolly logic
    if (dollyActive && controls) {
        dollyT = Math.min(1, dollyT + delta * 1.0); // Increased dolly speed
        const playerObj = controls.getObject();
        const easedT = THREE.MathUtils.smoothstep(dollyT, 0, 1);

        if (Array.isArray(dollyStart) && dollyStart.length === 2) { 
            const p0 = dollyStart[0], p1 = dollyStart[1], p2 = dollyEnd;
            const path = new THREE.QuadraticBezierCurve3(p0, p1, p2);
            playerObj.position.copy(path.getPoint(easedT));
        } else { // Fallback/Single point
             playerObj.position.lerpVectors(playerObj.position, dollyEnd, easedT); 
        }

        // Handle look target for entry only
        if (lookTarget && exitState !== 'DOLLY_OUT') { 
            const targetQuaternion = new THREE.Quaternion();
            const tempMatrix = new THREE.Matrix4().lookAt(playerObj.position, lookTarget, playerObj.up);
            targetQuaternion.setFromRotationMatrix(tempMatrix);
            playerObj.quaternion.slerp(targetQuaternion, delta * 2.5);
        }

        if (dollyT >= 1) {
            dollyActive = false;
            dollyT = 0; // Reset for next use
            
            if (exitState === 'DOLLY_OUT') {
                // Exit finished: Phase 2 -> Phase 3: Start closing door
                exitState = 'CLOSING_DOOR';
                
                // Final destination is outside the barn
                isInsideBarnView = false;

                if (!isMobile) {
                    // Re-enable pointer lock for desktop after exiting the barn
                    if (document.pointerLockElement) document.exitPointerLock();
                    setTimeout(() => controls.lock(), 100);
                }
            } else { 
                // Entry sequence finished
                isInsideBarnView = true;

                if (!isMobile && controls.isLocked) {
                    controls.unlock();
                }
                
                // Transition to IDLE state (ready for exit or auto-close)
                exitState = 'IDLE';

                // Trigger automatic close after entry
                setTimeout(() => {
                    startDoorClose();
                }, 1500); // Reduced delay for faster closing
            }
        }
    }
    if (renderer && scene && camera) renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export { initScene3D, stopScene3D } from './scene3d/index.js';

// overlay view removed; door now reveals interior plane within the 3D scene