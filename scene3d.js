import * as THREE from 'three';
import { createControls, setupControlEventListeners, getMovementState, isMobile } from './controls3d.js';
import { createGround, createMoveIndicator, createBarn, createFoliage, createLighting } from './objects3d.js';
import { initializeColliders, resolveCollision } from './collision3d.js';

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
let doorHighlight = null, barnDoorMesh = null;
let dollyActive = false, dollyT = 0, dollyStart = null, dollyEnd = null, lookTarget = null, barnGroupRef = null;

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
    targetPosition = target;
    isMovingToTarget = true;
    if (moveIndicator) {
        moveIndicator.position.set(hitPoint.x, 0.02, hitPoint.z);
        moveIndicator.visible = true;
        moveIndicator.scale.set(1,1,1);
    }
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    if (!renderer || !scene || !camera) { cancelAnimationFrame(animationFrameId); animationFrameId = null; return; }

    if (!controls || !controls.getObject) { cancelAnimationFrame(animationFrameId); animationFrameId = null; return; }

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    const player = controls.getObject();

    if (isMobile && isMovingToTarget && targetPosition) {
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
            const newPosition = (doorOpened && isInsideBarn(player.position)) ? player.position.clone().add(moveVector) : resolveCollision(player.position, moveVector);
            if (newPosition.equals(player.position)) {
                isMovingToTarget = false; targetPosition = null; if (moveIndicator) moveIndicator.visible = false;
            } else {
                player.position.copy(newPosition);
            }
        }
    } else if (!isMobile) {
        // Desktop controls
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
        const resolved = (doorOpened && isInsideBarn(player.position)) ? player.position.clone().add(desired) : resolveCollision(player.position, desired);
        player.position.copy(resolved);
    }

    // Keep player on ground
    if (controls) {
        player.position.y = 1.7;
    }

    // Door opening animation
    if (doorOpening && !doorOpened) {
        const target = -Math.PI * 0.65;
        doorAngle = THREE.MathUtils.damp(doorAngle, target, 6, delta);
        const pivot = interactiveTargets[0];
        if (pivot) pivot.rotation.y = doorAngle;
        // keep the physical door visible while it swings and after it opens
        if (Math.abs(doorAngle - target) < 0.02) { doorOpened = true; doorOpening = false; }
    }

    // Door proximity highlight + pointer cursor
    if (doorHighlight && barnDoorMesh && !doorOpening && !doorOpened) {
        const doorPos = new THREE.Vector3(); barnDoorMesh.getWorldPosition(doorPos);
        const dist = controls.getObject().position.distanceTo(doorPos);
        const active = dist < 3.0;
        doorHighlight.visible = active;
        if (active) {
            doorHighlight.material.opacity = 0.65 + Math.sin(time * 0.012) * 0.2;
            container.style.cursor = 'pointer';
            container.dataset.interact = '1';
            if (!isMobile && typeof controls.unlock === 'function') controls.unlock(); // show cursor immediately
        } else if (!isMobile) {
            container.style.cursor = '';
            container.dataset.interact = '';
        }
    }

    prevTime = time;
    // Dolly towards door and auto-look when opening
    if (dollyActive && controls) {
        dollyT = Math.min(1, dollyT + delta * 0.8);
        const playerObj = controls.getObject();
        playerObj.position.lerpVectors(dollyStart, dollyEnd, THREE.MathUtils.smoothstep(dollyT, 0, 1));
        // keep current facing; do not auto-rotate the camera
        if (dollyT >= 1) dollyActive = false;
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

    // Reset arrays
    walkableObjects = [];

    doorOpening = false; doorOpened = false; doorAngle = 0;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.Fog(0x111111, 0, 75);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Controls
    const controlsResult = createControls(camera, container, instructions);
    controls = controlsResult.controls;
    raycaster = controlsResult.raycaster;
    scene.add(controls.getObject());

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    // Textures
    const textureLoader = new THREE.TextureLoader();

    // Lighting
    const lights = createLighting();
    lights.forEach(light => scene.add(light));

    // Ground
    const ground = createGround(textureLoader);
    scene.add(ground);
    walkableObjects.push(ground);

    // Move indicator
    moveIndicator = createMoveIndicator();
    scene.add(moveIndicator);

    // Barn
    const barnGroup = createBarn(textureLoader);
    scene.add(barnGroup);
    barnGroupRef = barnGroup;
    if (barnGroup.userData?.doorPivot) {
        interactiveTargets = [barnGroup.userData.doorPivot];
        barnDoorMesh = barnGroup.userData.doorMesh;
        if (barnDoorMesh) barnDoorMesh.visible = true;
    }

    // Initialize collision system
    initializeColliders(barnGroup);

    // Foliage
    const foliageGroup = createFoliage();
    barnGroup.add(foliageGroup);

    // Door proximity highlight
    if (barnDoorMesh && barnGroup.userData?.doorPivot) {
        const geom = new THREE.EdgesGeometry(barnDoorMesh.geometry);
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
        doorHighlight = new THREE.LineSegments(geom, mat);
        doorHighlight.position.copy(barnDoorMesh.position).add(new THREE.Vector3(0, 0, 0.002));
        barnGroup.userData.doorPivot.add(doorHighlight);
        doorHighlight.visible = false;
    }

    // Event listeners
    removeEventListeners = setupControlEventListeners(
        container, controls, raycaster, camera, walkableObjects, onTargetSet, instructions
    );

    interactRaycaster = new THREE.Raycaster();
    const onMouseDown = () => {
        if (!interactiveTargets.length) return;
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        interactRaycaster.set(camera.position, dir);
        const hits = interactRaycaster.intersectObjects(interactiveTargets, true);
        if (hits.length && camera.position.distanceTo(hits[0].point) < 3.0 && !doorOpening && !doorOpened) {
            doorOpening = true;
            // Setup dolly to just outside the doorway and look at interior
            const playerObj = controls.getObject();
            const doorPos = new THREE.Vector3(); barnDoorMesh.getWorldPosition(doorPos);
            const frontDir = new THREE.Vector3().setFromMatrixColumn(barnGroupRef.matrixWorld, 2).normalize(); // +Z of barn (outwards)
            const inwardDir = frontDir.clone().negate(); // into the barn
            dollyStart = playerObj.position.clone();
            dollyEnd = doorPos.clone().add(inwardDir.multiplyScalar(3.5)); dollyEnd.y = 1.7;
            const ip = barnGroupRef.userData?.interiorPlane;
            lookTarget = ip ? ip.getWorldPosition(new THREE.Vector3()) : doorPos.clone();
            dollyT = 0; dollyActive = true;
        }
    };
    container.addEventListener('mousedown', onMouseDown);

    // Cleanup addition
    removeEventListeners = ((origRemove) => {
        return () => { if (origRemove) origRemove(); container.removeEventListener('mousedown', onMouseDown); };
    })(removeEventListeners);

    // Start
    prevTime = performance.now();
    animate();
    window.addEventListener('resize', onWindowResize);
}

export function stopScene3D() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (removeEventListeners) {
        removeEventListeners();
        removeEventListeners = null;
    }
    window.removeEventListener('resize', onWindowResize);
    if(controls) {
        controls.dispose();
        controls = null;
    }
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
    scene = null;
    camera = null;
    if (container) {
        container.style.display = 'none';
        container.style.cursor = '';
    }
}

// overlay view removed; door now reveals interior plane within the 3D scene