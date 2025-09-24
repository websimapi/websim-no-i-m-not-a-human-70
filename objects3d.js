import * as THREE from 'three';

export function createGround(textureLoader) {
    const groundTexture = textureLoader.load('ground_texture.png');
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(25, 25);
    groundTexture.anisotropy = 16;

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.8, metalness: 0.2 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;

    return ground;
}

export function createMoveIndicator() {
    const ringGeo = new THREE.RingGeometry(0.25, 0.5, 48);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.6, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });
    const moveIndicator = new THREE.Mesh(ringGeo, ringMat);
    moveIndicator.rotation.x = -Math.PI / 2;
    moveIndicator.position.y = 0.02;
    moveIndicator.visible = false;

    return moveIndicator;
}

export function createBarn(textureLoader) {
    const barnWallTexture = textureLoader.load('barn_wall.png');
    const barnRoofTexture = textureLoader.load('barn_roof.png');
    const interiorTex = textureLoader.load('barn_interior.png');

    const wallMaterial = new THREE.MeshStandardMaterial({ map: barnWallTexture });
    const roofMaterial = new THREE.MeshStandardMaterial({ map: barnRoofTexture });
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x050505 });

    const barnGroup = new THREE.Group();
    const BARN_WIDTH = 12;
    const BARN_DEPTH = 18;
    const WALL_HEIGHT = 6;
    const ROOF_HEIGHT = 4;

    // Build walls as planes so we can leave a real opening for the door
    const sideMat = wallMaterial;
    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(BARN_DEPTH, WALL_HEIGHT), sideMat);
    leftWall.position.set(-BARN_WIDTH/2, WALL_HEIGHT/2, 0); leftWall.rotation.y = Math.PI/2; barnGroup.add(leftWall);
    // Right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(BARN_DEPTH, WALL_HEIGHT), sideMat);
    rightWall.position.set(BARN_WIDTH/2, WALL_HEIGHT/2, 0); rightWall.rotation.y = -Math.PI/2; barnGroup.add(rightWall);
    // Back wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(BARN_WIDTH, WALL_HEIGHT), sideMat);
    backWall.position.set(0, WALL_HEIGHT/2, -BARN_DEPTH/2); backWall.rotation.y = Math.PI; barnGroup.add(backWall);

    // Main roof
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-BARN_WIDTH / 2 - 0.5, WALL_HEIGHT);
    roofShape.lineTo(0, WALL_HEIGHT + ROOF_HEIGHT);
    roofShape.lineTo(BARN_WIDTH / 2 + 0.5, WALL_HEIGHT);
    roofShape.lineTo(-BARN_WIDTH / 2 - 0.5, WALL_HEIGHT);
    const extrudeSettings = { depth: BARN_DEPTH + 1, bevelEnabled: false };
    const roofGeometry = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
    const mainRoof = new THREE.Mesh(roofGeometry, roofMaterial);
    mainRoof.position.z = -(BARN_DEPTH + 1) / 2;
    mainRoof.castShadow = true;
    barnGroup.add(mainRoof);

    // Gables (triangular parts of the wall)
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-BARN_WIDTH / 2, WALL_HEIGHT);
    gableShape.lineTo(0, WALL_HEIGHT + ROOF_HEIGHT);
    gableShape.lineTo(BARN_WIDTH / 2, WALL_HEIGHT);
    gableShape.lineTo(-BARN_WIDTH / 2, WALL_HEIGHT);
    const gableGeometry = new THREE.ShapeGeometry(gableShape);
    const frontGable = new THREE.Mesh(gableGeometry, wallMaterial);
    frontGable.position.z = BARN_DEPTH / 2;
    barnGroup.add(frontGable);
    const backGable = new THREE.Mesh(gableGeometry, wallMaterial);
    backGable.position.z = -BARN_DEPTH / 2;
    backGable.rotation.y = Math.PI;
    barnGroup.add(backGable);

    // Windows
    const window1 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), windowMaterial);
    window1.position.set(-2.5, 7.5, BARN_DEPTH / 2 + 0.01);
    barnGroup.add(window1);

    const window2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), windowMaterial);
    window2.position.set(2.5, 7.5, BARN_DEPTH / 2 + 0.01);
    barnGroup.add(window2);

    const sideWindow1 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), windowMaterial);
    sideWindow1.position.set(BARN_WIDTH/2 + 0.01, 3, 2);
    sideWindow1.rotation.y = Math.PI/2;
    barnGroup.add(sideWindow1);

    const sideWindow2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), windowMaterial);
    sideWindow2.position.set(BARN_WIDTH/2 + 0.01, 3, -2);
    sideWindow2.rotation.y = Math.PI/2;
    barnGroup.add(sideWindow2);

    // Chimneys
    const chimney1 = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, 1), roofMaterial);
    chimney1.position.set(-2, WALL_HEIGHT + ROOF_HEIGHT - 0.5, -2);
    barnGroup.add(chimney1);

    const chimney2 = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, 1), roofMaterial);
    chimney2.position.set(2.5, WALL_HEIGHT + ROOF_HEIGHT - 1.2, 4);
    barnGroup.add(chimney2);

    // Left side extension
    const EXT_WIDTH = 5;
    const EXT_DEPTH = 8;
    const EXT_HEIGHT = 4;
    const extension = new THREE.Mesh(new THREE.BoxGeometry(EXT_WIDTH, EXT_HEIGHT, EXT_DEPTH), wallMaterial);
    extension.position.set(-(BARN_WIDTH / 2 + EXT_WIDTH / 2), EXT_HEIGHT / 2, -2);
    extension.castShadow = true;
    extension.receiveShadow = true;
    barnGroup.add(extension);

    const extRoof = new THREE.Mesh(new THREE.PlaneGeometry(EXT_WIDTH + 0.5, EXT_DEPTH + 0.5), roofMaterial);
    extRoof.position.set(-(BARN_WIDTH / 2 + EXT_WIDTH / 2), EXT_HEIGHT + 0.05, -2);
    extRoof.rotation.x = -Math.PI / 2;
    extRoof.rotation.z = 0.2;
    extRoof.castShadow = true;
    barnGroup.add(extRoof);

    const chimney3 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), roofMaterial);
    chimney3.position.set(-BARN_WIDTH/2 - EXT_WIDTH/2 + 1, EXT_HEIGHT + 1, -4);
    barnGroup.add(chimney3);

    // Door (front face, slightly left) with small awning, real opening, and interior plane inside
    {
        const doorPivot = new THREE.Group();
        const doorX = -2.5, doorY = 1.1, doorZ = BARN_DEPTH / 2 + 0.02;
        const doorW = 1.25, doorH = 2.2;
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.92, metalness: 0.06 });
        const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), doorMat);
        doorPivot.position.set(doorX - doorW/2, doorY, doorZ); // hinge at left side
        door.position.set(doorW/2, 0, 0); // offset relative to hinge
        door.castShadow = true; door.receiveShadow = false;
        doorPivot.add(door);

        const frameMat = new THREE.MeshBasicMaterial({ 
            color: 0x1e1a18, transparent: true, opacity: 0.0, depthWrite: false 
        });
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 2.28), frameMat);
        frame.position.set(doorX, doorY, doorZ + 0.001); barnGroup.add(frame);

        const windowGlass = new THREE.Mesh(
            new THREE.PlaneGeometry(0.65, 0.42),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false })
        );
        windowGlass.position.set(doorX, doorY + 0.55, doorZ + 0.002);
        barnGroup.add(windowGlass);

        // Real opening in front wall: segment the facade around the door
        const facadeZ = BARN_DEPTH / 2 + 0.001;
        const leftW = (doorX - doorW/2) - (-BARN_WIDTH/2);
        if (leftW > 0.01) {
            const leftSeg = new THREE.Mesh(new THREE.PlaneGeometry(leftW, WALL_HEIGHT), sideMat);
            leftSeg.position.set(-BARN_WIDTH/2 + leftW/2, WALL_HEIGHT/2, facadeZ); barnGroup.add(leftSeg);
        }
        const rightW = (BARN_WIDTH/2) - (doorX + doorW/2);
        if (rightW > 0.01) {
            const rightSeg = new THREE.Mesh(new THREE.PlaneGeometry(rightW, WALL_HEIGHT), sideMat);
            rightSeg.position.set(doorX + doorW/2 + rightW/2, WALL_HEIGHT/2, facadeZ); barnGroup.add(rightSeg);
        }
        const topH = Math.max(0.01, WALL_HEIGHT - (doorY + doorH/2));
        const topSeg = new THREE.Mesh(new THREE.PlaneGeometry(doorW, topH), sideMat);
        topSeg.position.set(doorX, doorY + doorH/2 + topH/2, facadeZ); barnGroup.add(topSeg);
        const bottomH = Math.max(0.01, (doorY - doorH/2));
        const botSeg = new THREE.Mesh(new THREE.PlaneGeometry(doorW, bottomH), sideMat);
        botSeg.position.set(doorX, bottomH/2, facadeZ); barnGroup.add(botSeg);

        // Panoramic 180° interior wrap (inward-facing half cylinder)
        interiorTex.wrapS = THREE.RepeatWrapping; interiorTex.wrapT = THREE.ClampToEdgeWrapping; interiorTex.needsUpdate = true;
        const radius = 5.5, thetaLen = Math.PI;
        const interiorWrap = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, BARN_WIDTH - 0.4, 64, 1, true, -Math.PI/2, thetaLen),
            new THREE.MeshBasicMaterial({ map: interiorTex, side: THREE.BackSide })
        );
        interiorWrap.position.set(0, WALL_HEIGHT/2, BARN_DEPTH/2 - radius - 0.2);
        interiorWrap.rotation.y = Math.PI; // Face the wrap toward the door (+Z)
        barnGroup.add(interiorWrap);

        // Small angled awning above door
        const awning = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), roofMaterial);
        awning.position.set(doorX, doorY + 1.35, doorZ + 0.001);
        awning.rotation.x = -Math.PI * 0.18; awning.castShadow = true;
        barnGroup.add(awning);

        barnGroup.add(doorPivot);
        barnGroup.userData.doorPivot = doorPivot;
        barnGroup.userData.doorMesh = door;
        // store reference if needed later
        barnGroup.userData.interiorSurface = interiorWrap;
    }

    barnGroup.position.z = -15;
    return barnGroup;
}

export function createFoliage() {
    const foliageGroup = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a2b0f })
    );
    trunk.position.y = 4;
    const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(4, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x1a3a1a, roughness: 0.8 })
    );
    leaves.position.y = 9;
    trunk.castShadow = true;
    leaves.castShadow = true;
    foliageGroup.add(trunk, leaves);

    // bushes
    for(let i=0; i<5; i++){
        const bush = new THREE.Mesh(
            new THREE.SphereGeometry(1 + Math.random() * 0.8, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0x1a3a1a, roughness: 0.8 })
        );
        bush.position.set(
            (Math.random() - 0.5) * 6,
            0.5 + Math.random() * 0.5,
            (Math.random() - 0.5) * 4
        );
        bush.scale.y = 0.7 + Math.random() * 0.3;
        bush.castShadow = true;
        foliageGroup.add(bush);
    }
    foliageGroup.position.set(-10, 0, 3);
    return foliageGroup;
}

export function createLighting() {
    const lights = [];

    const hemiLight = new THREE.HemisphereLight(0x444455, 0x111122, 0.5);
    lights.push(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.1);
    dirLight.position.set(-15, 20, -5);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    lights.push(dirLight);

    return lights;
}