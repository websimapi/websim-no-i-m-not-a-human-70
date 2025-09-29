import * as THREE from 'three';
import { createControls, setupControlEventListeners, getMovementState, isMobile } from '../controls3d.js';
import { createGround, createMoveIndicator, createBarn, createFoliage, createLighting } from '../objects3d.js';
import { initializeColliders, resolveCollision, initializeBarnInteriorCollider } from '../collision3d.js';

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

const DOOR_CENTER_X = -2.5;

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

function openDoor(isExiting = false) {
    if (doorOpening || doorOpened || !barnDoorMesh || !barnGroupRef || !controls) return;
    if (exitState !== 'IDLE' && !isExiting) return;

    if (!isExiting && isInsideBarnView) return;
    if (isExiting && !isInsideBarnView) return;

    if (isExiting) {
        exitState = 'OPENING_DOOR';
    }

    doorOpening = true;

    const playerObj = controls.getObject();
    const playerStartPos = playerObj.position.clone();
    const doorWorldPos = new THREE.Vector3();
    barnGroupRef.userData.doorPivot.getWorldPosition(doorWorldPos);
    const BARN_WIDTH = 12, BARN_DEPTH = 18;
    const frontWallZ = barnGroupRef.position.z + BARN_DEPTH / 2;
    let p1Position;

    if (isExiting) {
        const doorCenterX = barnGroupRef.position.x + DOOR_CENTER_X;
        p1Position = new THREE.Vector3(doorCenterX, 1.7, frontWallZ + 1.5); 
        const endPos = dollyStart[0].clone();
        dollyStart = [playerStartPos, p1Position];
        dollyEnd = endPos; 
        lookTarget = null;
    } else {
        const hingeX = doorWorldPos.x;
        const retreatZ = playerStartPos.z + 1.5; 
        const safeRetreatZ = Math.min(retreatZ, frontWallZ + 2.5);
        p1Position = new THREE.Vector3(hingeX - 0.5, 1.7, safeRetreatZ);
        dollyEnd = new THREE.Vector3(barnGroupRef.position.x, 1.7, frontWallZ - 3.0);
        const entryStartPos = playerStartPos.clone();
        dollyStart = [entryStartPos, p1Position];
        lookTarget = dollyEnd.clone(); lookTarget.z -= 10;
        dollyActive = true;
    }
    dollyT = 0;
}

function startDoorClose() {
    if (doorOpened && !dollyActive && isInsideBarnView && exitState === 'IDLE') {
        exitState = 'CLOSING_DOOR';
    }
}

function exitBarn() {
    if (exitState !== 'IDLE' || dollyActive || !isInsideBarnView) return;
    if (!dollyStart || !Array.isArray(dollyStart) || dollyStart.length === 0 || dollyStart.length === 1) {
        const doorWorldPos = new THREE.Vector3();
        if (barnGroupRef && barnGroupRef.userData.doorPivot) barnGroupRef.userData.doorPivot.getWorldPosition(doorWorldPos);
        else doorWorldPos.set(0, 1.7, -15);
        const safeExitPos = new THREE.Vector3(doorWorldPos.x, 1.7, doorWorldPos.z + 5);
        dollyStart = [safeExitPos];
        const BARN_DEPTH = 18;
        controls.getObject().position.set(barnGroupRef.position.x, 1.7, barnGroupRef.position.z + BARN_DEPTH / 2 - 2.5);
    }
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
        if (!isMobile && document.pointerLockElement === canvas) {
            document.exitPointerLock();
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
            isMovingToTarget = false;
            targetPosition = null;
            if (moveIndicator) moveIndicator.visible = false;
        } else {
            const direction = targetPosition.clone().sub(player.position).normalize();
            const moveSpeed = Math.min(distance * 3, 5);
            const moveVector = direction.multiplyScalar(moveSpeed * delta);
            const newPosition = resolveCollision(player.position, moveVector, isInsideBarnView);
            if (newPosition.equals(player.position)) {
                isMovingToTarget = false; targetPosition = null; if (moveIndicator) moveIndicator.visible = false;
            } else {
                player.position.copy(newPosition);
            }
        }
    } else if (!isMobile && !isInsideBarnView) {
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

    if (controls) {
        player.position.y = 1.7;
    }

    // Door opening animation
    if (doorOpening && !doorOpened) {
        const target = -Math.PI * 0.65;
        doorAngle = THREE.MathUtils.damp(doorAngle, target, 8, delta);
        const pivot = interactiveTargets[0];
        if (pivot) pivot.rotation.y = doorAngle;
        if (Math.abs(doorAngle - target) < 0.02) { 
            doorOpened = true; 
            doorOpening = false; 
            initializeColliders(barnGroupRef, true);
            if (barnGroupRef.userData.interiorSurface) initializeBarnInteriorCollider(barnGroupRef.userData.interiorSurface);

            if (exitState === 'OPENING_DOOR') {
                 dollyActive = true;
                 exitState = 'DOLLY_OUT';
            }
        }
    }

    // Door closing animation
    if (exitState === 'CLOSING_DOOR') {
        const targetAngle = 0;
        doorAngle = THREE.MathUtils.damp(doorAngle, targetAngle, 6, delta);
        const pivot = interactiveTargets[0];
        if (pivot) pivot.rotation.y = doorAngle;
        if (Math.abs(doorAngle - targetAngle) < 0.02) {
            doorOpened = false;
            initializeColliders(barnGroupRef, false);
            if (barnGroupRef.userData.interiorSurface) initializeBarnInteriorCollider(barnGroupRef.userData.interiorSurface);
            exitState = 'IDLE';
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
        } else if (!isInsideBarnView) {
            container.style.cursor = '';
            container.dataset.interact = '';
        }
    }

    prevTime = time;

    // Dolly logic
    if (dollyActive && controls) {
        dollyT = Math.min(1, dollyT + delta * 1.0);
        const playerObj = controls.getObject();
        const easedT = THREE.MathUtils.smoothstep(dollyT, 0, 1);

        if (Array.isArray(dollyStart) && dollyStart.length === 2) { 
            const p0 = dollyStart[0], p1 = dollyStart[1], p2 = dollyEnd;
            const path = new THREE.QuadraticBezierCurve3(p0, p1, p2);
            playerObj.position.copy(path.getPoint(easedT));
        } else {
             playerObj.position.lerpVectors(playerObj.position, dollyEnd, easedT); 
        }

        if (lookTarget && exitState !== 'DOLLY_OUT') { 
            const targetQuaternion = new THREE.Quaternion();
            const tempMatrix = new THREE.Matrix4().lookAt(playerObj.position, lookTarget, playerObj.up);
            targetQuaternion.setFromRotationMatrix(tempMatrix);
            playerObj.quaternion.slerp(targetQuaternion, delta * 2.5);
        }

        if (dollyT >= 1) {
            dollyActive = false;
            dollyT = 0;

            if (exitState === 'DOLLY_OUT') {
                exitState = 'CLOSING_DOOR';
                isInsideBarnView = false;
                if (!isMobile) {
                    if (document.pointerLockElement) document.exitPointerLock();
                    setTimeout(() => controls.lock(), 100);
                }
            } else { 
                isInsideBarnView = true;
                if (!isMobile && controls.isLocked) {
                    controls.unlock();
                }
                exitState = 'IDLE';
                setTimeout(() => { startDoorClose(); }, 1500);
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

export function initScene3D() {
    container.style.display = 'block';

    walkableObjects = [];

    doorOpening = false; doorOpened = false; doorAngle = 0;
    isInsideBarnView = false; 
    exitState = 'IDLE';

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.Fog(0x111111, 0, 75);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    const controlsResult = createControls(camera, container, instructions);
    controls = controlsResult.controls;
    raycaster = controlsResult.raycaster;
    scene.add(controls.getObject());

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    const textureLoader = new THREE.TextureLoader();

    const lights = createLighting();
    lights.forEach(light => scene.add(light));

    const ground = createGround(textureLoader);
    scene.add(ground);
    walkableObjects.push(ground);

    moveIndicator = createMoveIndicator();
    scene.add(moveIndicator);

    const barnGroup = createBarn(textureLoader);
    scene.add(barnGroup);
    barnGroupRef = barnGroup;
    if (barnGroup.userData?.doorPivot) {
        interactiveTargets = [barnGroup.userData.doorPivot];
        barnDoorMesh = barnGroup.userData.doorMesh;
        if (barnDoorMesh) barnDoorMesh.visible = true;
    }

    initializeColliders(barnGroup, false);
    if (barnGroup.userData.interiorSurface) {
        initializeBarnInteriorCollider(barnGroup.userData.interiorSurface);
    }

    const foliageGroup = createFoliage();
    barnGroup.add(foliageGroup);

    if (barnDoorMesh && barnGroup.userData?.doorPivot) {
        const geom = new THREE.EdgesGeometry(barnDoorMesh.geometry);
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
        doorHighlight = new THREE.LineSegments(geom, mat);
        doorHighlight.position.copy(barnDoorMesh.position).add(new THREE.Vector3(0, 0, 0.002));
        barnGroup.userData.doorPivot.add(doorHighlight);
        doorHighlight.visible = false;
    }

    const handleInteraction = (target) => {
        let parent = target;
        let isDoorPart = false;
        while(parent) {
            if (parent === barnGroupRef.userData.doorPivot) {
                isDoorPart = true;
                break;
            }
            parent = parent.parent;
        }

        if (isDoorPart) {
             const doorPos = new THREE.Vector3();
             barnGroupRef.userData.doorPivot.getWorldPosition(doorPos);
             if (controls.getObject().position.distanceTo(doorPos) > 3.5) {
                return;
             }
            if (isInsideBarnView) {
                exitBarn();
            } else {
                openDoor(false);
            }
        }
    };

    removeEventListeners = setupControlEventListeners(
        container, controls, raycaster, camera, walkableObjects, onTargetSet, instructions, interactiveTargets, handleInteraction
    );

    interactRaycaster = new THREE.Raycaster();
    const onMouseDown = () => { /* removed center-screen raycast, interaction handled via click */ };
    container.addEventListener('mousedown', onMouseDown);

    removeEventListeners = ((origRemove) => {
        return () => { if (origRemove) origRemove(); container.removeEventListener('mousedown', onMouseDown); };
    })(removeEventListeners);

    prevTime = performance.now();
    animate();
    window.addEventListener('resize', onWindowResize);
}

export function stopScene3D() {
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    if (removeEventListeners) { removeEventListeners(); removeEventListeners = null; }
    window.removeEventListener('resize', onWindowResize);
    if(controls) { controls.dispose(); controls = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; camera = null;
    if (container) { container.style.display = 'none'; container.style.cursor = ''; }
}