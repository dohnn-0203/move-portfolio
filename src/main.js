import * as THREE from "three";

/**
 * Portfolio world bootstrap:
 * - Dark background + fog
 * - Ground + grid
 * - Basic lighting + shadows
 * - Player cube (placeholder)
 * - Simple environment blocks (placeholder buildings)
 */
function main() {
  // Mount point (Vite vanilla default)
  const app = document.querySelector("#app");
  app.innerHTML = `<canvas id="c" style="display:block; width:100vw; height:100vh;"></canvas>`;
  const canvas = document.querySelector("#c");

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050508);
  scene.fog = new THREE.Fog(0x050508, 10, 60);

  // Camera
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(6, 4, 8);
  camera.lookAt(0, 0, 0);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 5);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 50;
  dir.shadow.camera.left = -20;
  dir.shadow.camera.right = 20;
  dir.shadow.camera.top = 20;
  dir.shadow.camera.bottom = -20;
  scene.add(dir);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid (wireframe vibe)
  const grid = new THREE.GridHelper(80, 80, 0x2b2b3a, 0x1a1a24);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = 0.01;
  scene.add(grid);

  // Player cube (placeholder)
  const player = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff5555, roughness: 0.6 })
  );
  player.position.y = 0.5;
  player.castShadow = true;
  scene.add(player);

  const keys = new Set();
  window.addEventListener("keydown", (e) => keys.add(e.code));
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  const moveSpeed = 8;

  const tmpDir = new THREE.Vector3();
  const camOffset = new THREE.Vector3(0, 4, 8);
  const camTarget = new THREE.Vector3();

  // Environment blocks (placeholder buildings)
  const envMat = new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const w = 0.8 + Math.random() * 2.5;
    const h = 0.8 + Math.random() * 6.0;
    const d = 0.8 + Math.random() * 2.5;

    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), envMat);
    m.position.set((Math.random() - 0.5) * 40, h / 2, (Math.random() - 0.5) * 40);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  // Resize handler
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
  window.addEventListener("resize", onResize);

  // Render loop
  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.033);

    tmpDir.set(0, 0, 0);

    if (keys.has("KeyW")) tmpDir.z -= 1;
    if (keys.has("KeyS")) tmpDir.z += 1;
    if (keys.has("KeyA")) tmpDir.x -= 1;
    if (keys.has("KeyD")) tmpDir.x += 1;

    if (tmpDir.lengthSq() > 0) {
      tmpDir.normalize().multiplyScalar(moveSpeed * dt);
      player.position.add(tmpDir);

      const angle = Math.atan2(tmpDir.x, tmpDir.z);
      player.rotation.y = angle;
    }

    // Smooth camera follow
    camTarget.copy(player.position);
    camTarget.y += 0.7;

    const desiredCamPos = player.position.clone().add(camOffset);
    camera.position.lerp(desiredCamPos, 0.1);
    camera.lookAt(camTarget);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

main();
