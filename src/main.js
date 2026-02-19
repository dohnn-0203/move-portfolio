/* eslint-disable no-console */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/*
 * 3D 월드 초기화: GLB 바닥 타일링, WASD 이동, 카메라 추적, 8단계 시간대 순환, 별 스카이돔,
 * 자연스러운 그림자(부드럽게 + 경계 숨김 + 동적 bias + frustum 갱신 완화),
 * 접지(발밑) 그림자 트릭(컨택트 섀도우)
 */
function main() {
  const app = document.querySelector("#app");
  app.innerHTML =
    '<canvas id="c" style="display:block; width:100vw; height:100vh;"></canvas>';
  const canvas = document.querySelector("#c");

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2500
  );
  camera.position.set(6, 4, 8);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  const grid = new THREE.GridHelper(200, 200, 0x2b2b3a, 0x1a1a24);
  grid.material.transparent = true;
  grid.material.opacity = 0.12;
  grid.position.y = 0.01;
  scene.add(grid);

  const player = new THREE.Object3D();
  player.position.set(0, 0, 0);
  scene.add(player);

  const keys = new Set();
  window.addEventListener("keydown", (e) => keys.add(e.code));
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  const tmpDir = new THREE.Vector3();
  const camOffset = new THREE.Vector3(0, 4, 8);
  const camTarget = new THREE.Vector3();

  let velocityY = 0;
  let isGrounded = true;

  const gravity = -18;
  const jumpPower = 7;

  const walkSpeed = 4;
  const runSpeed = 7;

  const loader = new GLTFLoader();

  const SUN_RADIUS = 80;
  const SUN_HEIGHT = 55;

  const baseUrl = import.meta.env.BASE_URL;

  // 스카이돔 생성: 구 표면에 점을 배치하고 밤에 더 보이도록 투명도를 조절
  function createStarDome() {
    const starCount = 6000;
    const radius = 900;

    const positions = new Float32Array(starCount * 3);
    const tmp = new THREE.Vector3();

    for (let i = 0; i < starCount; i += 1) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);

      tmp.set(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(radius);

      positions[i * 3 + 0] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    stars.renderOrder = -10;
    scene.add(stars);

    return { stars, mat };
  }

  // 발밑 접지 그림자(컨택트 섀도우) 생성: 작은 원형 그라데이션 텍스처를 만들어 플레이어 아래에 붙임
  function createContactShadow() {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      10,
      size / 2,
      size / 2,
      size / 2
    );
    g.addColorStop(0.0, "rgba(0,0,0,0.35)");
    g.addColorStop(0.35, "rgba(0,0,0,0.18)");
    g.addColorStop(0.7, "rgba(0,0,0,0.06)");
    g.addColorStop(1.0, "rgba(0,0,0,0.0)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.renderOrder = 5;
    scene.add(mesh);

    return { mesh, mat };
  }

  const { stars, mat: starsMat } = createStarDome();
  const { mesh: contactShadow, mat: contactMat } = createContactShadow();

  // 모델 기준점 정리: XZ 중심을 원점으로, 최저점을 y=0으로 맞춤
  function normalizeModelToGround(model) {
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const min = box.min.clone();

    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= min.y;

    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        if (o.material) {
          o.material.roughness = 1;
          o.material.metalness = 0;
        }
      }
    });

    model.updateMatrixWorld(true);
    const normalizedBox = new THREE.Box3().setFromObject(model);
    const size = normalizedBox.getSize(new THREE.Vector3());
    return { size };
  }

  // 바닥 모델을 복제해서 N x N 형태로 타일처럼 배치
  function createTiledGround(baseModel, tileSize, tilesRadius) {
    const group = new THREE.Group();
    group.name = "TiledGround";

    for (let ix = -tilesRadius; ix <= tilesRadius; ix += 1) {
      for (let iz = -tilesRadius; iz <= tilesRadius; iz += 1) {
        const tile = baseModel.clone(true);
        tile.position.set(ix * tileSize.x, 0, iz * tileSize.z);
        group.add(tile);
      }
    }

    return group;
  }

  // ground 띄우는 loader. 잠시 지워둠.
  // loader.load(
  //   `${baseUrl}models/ground.glb`,
  //   (gltf) => {
  //     const base = gltf.scene;

  //     const { size } = normalizeModelToGround(base);

  //     const tileSize = new THREE.Vector3(
  //       Math.max(size.x, 0.001),
  //       Math.max(size.y, 0.001),
  //       Math.max(size.z, 0.001)
  //     );

  //     const tilesRadius = 4;
  //     const tiled = createTiledGround(base, tileSize, tilesRadius);
  //     scene.add(tiled);
  //   },
  //   undefined,
  //   (err) => {
  //     console.error(`Failed to load ${baseUrl}models/ground.glb:`, err);
  //   }
  // );

  loader.load(
    `${baseUrl}models/player.glb`,
    (gltf) => {
      const model = gltf.scene;

      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const minY = box.min.y;

      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= minY;

      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) {
            o.material.roughness = 0.9;
            o.material.metalness = 0.0;
          }
        }
      });

      const size = box.getSize(new THREE.Vector3());
      const scale = 1 / Math.max(size.x, size.z, 0.001);
      model.scale.setScalar(scale);

      model.rotation.y += Math.PI;

      player.add(model);
    },
    undefined,
    (err) => {
      console.error(`Failed to load ${baseUrl}models/player.glb:`, err);
    }
  );

  // 화면 리사이즈에 맞춰 카메라/렌더러 갱신
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
  window.addEventListener("resize", onResize);

  // 두 색상을 선형 보간
  function lerpColor(a, b, t) {
    return a.clone().lerp(b, t);
  }

  // 8단계 시간대 팔레트를 u(0~1)로 샘플링해서 연속적으로 보간
  function sampleCyclePalette(u) {
    const stages = [
      {
        name: "아침",
        sky: 0x9fb8ff,
        fog: 0xb8caff,
        sun: 0xfff1c2,
        sunIntensity: 1.8,
        ambientIntensity: 0.85,
        exposure: 1.25,
        fogNear: 12,
        fogFar: 150,
      },
      {
        name: "점심",
        sky: 0xcfe3ff,
        fog: 0xd9ebff,
        sun: 0xffffff,
        sunIntensity: 2.6,
        ambientIntensity: 1.0,
        exposure: 1.35,
        fogNear: 14,
        fogFar: 170,
      },
      {
        name: "오후",
        sky: 0xa8d0ff,
        fog: 0xb7dcff,
        sun: 0xfff2d6,
        sunIntensity: 2.3,
        ambientIntensity: 0.95,
        exposure: 1.3,
        fogNear: 14,
        fogFar: 165,
      },
      {
        name: "노을",
        sky: 0x6f4aa8,
        fog: 0x8b5aa8,
        sun: 0xffa36b,
        sunIntensity: 1.9,
        ambientIntensity: 0.75,
        exposure: 1.2,
        fogNear: 12,
        fogFar: 145,
      },
      {
        name: "저녁",
        sky: 0x1b1036,
        fog: 0x26124a,
        sun: 0xff7a6b,
        sunIntensity: 1.1,
        ambientIntensity: 0.55,
        exposure: 1.05,
        fogNear: 10,
        fogFar: 125,
      },
      {
        name: "밤",
        sky: 0x0b1024,
        fog: 0x0b1024,
        sun: 0x9db4ff,
        sunIntensity: 0.35,
        ambientIntensity: 0.38,
        exposure: 1.08,
        fogNear: 10,
        fogFar: 115,
      },
      {
        name: "늦은밤",
        sky: 0x070b18,
        fog: 0x070b18,
        sun: 0x7e96ff,
        sunIntensity: 0.28,
        ambientIntensity: 0.3,
        exposure: 1.02,
        fogNear: 10,
        fogFar: 105,
      },
      {
        name: "새벽",
        sky: 0x1a2350,
        fog: 0x263062,
        sun: 0xbcd3ff,
        sunIntensity: 0.9,
        ambientIntensity: 0.5,
        exposure: 1.05,
        fogNear: 12,
        fogFar: 140,
      },
    ];

    const n = stages.length;
    const x = u * n;
    const i0 = Math.floor(x) % n;
    const i1 = (i0 + 1) % n;
    const t = x - Math.floor(x);

    const a = stages[i0];
    const b = stages[i1];

    const sky = lerpColor(new THREE.Color(a.sky), new THREE.Color(b.sky), t);
    const fog = lerpColor(new THREE.Color(a.fog), new THREE.Color(b.fog), t);
    const sunCol = lerpColor(new THREE.Color(a.sun), new THREE.Color(b.sun), t);

    const sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    const ambientIntensity = THREE.MathUtils.lerp(
      a.ambientIntensity,
      b.ambientIntensity,
      t
    );
    const exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, t);
    const fogNear = THREE.MathUtils.lerp(a.fogNear, b.fogNear, t);
    const fogFar = THREE.MathUtils.lerp(a.fogFar, b.fogFar, t);

    return {
      sky,
      fog,
      sunCol,
      sunIntensity,
      ambientIntensity,
      exposure,
      fogNear,
      fogFar,
    };
  }

  // 시간대 업데이트: 태양 공전 + 팔레트 기반 하늘/안개/조명/노출 적용 + 별/접지 그림자 세기 조절 + 그림자 bias 동적 튜닝
  function updateTimeOfDay(elapsed) {
    const daySpeed = 0.02;
    const u = (elapsed * daySpeed) % 1;

    const angle = u * Math.PI * 2;

    sun.position.set(
      Math.cos(angle) * SUN_RADIUS,
      Math.sin(angle) * SUN_HEIGHT,
      Math.sin(angle) * SUN_RADIUS
    );

    const pal = sampleCyclePalette(u);

    sun.color.copy(pal.sunCol);
    sun.intensity = pal.sunIntensity;
    ambient.intensity = pal.ambientIntensity;

    scene.background = pal.sky;
    if (!scene.fog) scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);
    scene.fog.color.copy(pal.fog);
    scene.fog.near = pal.fogNear;
    scene.fog.far = pal.fogFar;

    renderer.toneMappingExposure = Math.max(pal.exposure, 1.0);

    const sunUp = Math.max(0, sun.position.y / SUN_HEIGHT);
    const night = 1 - sunUp;

    const starOpacity = THREE.MathUtils.clamp((night - 0.25) / 0.75, 0, 1);
    starsMat.opacity = 0.05 + starOpacity * 0.85;
    starsMat.size = 1.0 + starOpacity * 0.8;

    contactMat.opacity = 0.12 + starOpacity * 0.18;

    sun.shadow.normalBias = THREE.MathUtils.lerp(0.003, 0.008, sunUp);
    sun.shadow.bias = -THREE.MathUtils.lerp(0.00035, 0.0001, sunUp);
  }

  // 자연스러운 그림자: 그림자 중심을 카메라 방향 앞쪽으로 두고, frustum 갱신 빈도를 낮춰 튐을 완화
  function updateShadowFrustum() {
    const shadowSize = 85;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const center = player.position.clone().add(forward.multiplyScalar(12));

    sun.target.position.copy(center);
    sun.target.updateMatrixWorld();

    sun.shadow.camera.left = -shadowSize;
    sun.shadow.camera.right = shadowSize;
    sun.shadow.camera.top = shadowSize;
    sun.shadow.camera.bottom = -shadowSize;

    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 360;
    sun.shadow.camera.updateProjectionMatrix();
  }

  // 프레임 루프: 시간대 갱신, 이동, 카메라 추적, 그림자 갱신, 별 회전, 접지 그림자 위치 갱신, 렌더링
  const clock = new THREE.Clock();
  let shadowFrame = 0;

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.033);
    const elapsed = clock.getElapsedTime();

    updateTimeOfDay(elapsed);

    const speed =
      keys.has("ShiftLeft") || keys.has("ShiftRight") ? runSpeed : walkSpeed;

    if (keys.has("Space") && isGrounded) {
      velocityY = jumpPower;
      isGrounded = false;
    }

    tmpDir.set(0, 0, 0);
    if (keys.has("KeyW")) tmpDir.z -= 1;
    if (keys.has("KeyS")) tmpDir.z += 1;
    if (keys.has("KeyA")) tmpDir.x -= 1;
    if (keys.has("KeyD")) tmpDir.x += 1;

    if (tmpDir.lengthSq() > 0) {
      tmpDir.normalize().multiplyScalar(speed * dt);
      player.position.add(tmpDir);

      const ang = Math.atan2(tmpDir.x, tmpDir.z);
      player.rotation.y = ang;
    }

    velocityY += gravity * dt;
    player.position.y += velocityY * dt;

    if (player.position.y <= 0) {
      player.position.y = 0;
      velocityY = 0;
      isGrounded = true;
    }

    shadowFrame += 1;
    if (shadowFrame % 2 === 0) updateShadowFrustum();

    camTarget.copy(player.position);
    camTarget.y += 0.7;

    const desiredCamPos = player.position.clone().add(camOffset);
    camera.position.lerp(desiredCamPos, 0.1);
    camera.lookAt(camTarget);

    stars.rotation.y += dt * 0.01;

    contactShadow.position.x = player.position.x;
    contactShadow.position.z = player.position.z;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

main();
