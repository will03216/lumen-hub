/**
 * Client-side turntable renderer for Seed3D meshes.
 *
 * Loads a .glb (served same-origin via /api/model3d/mesh) with three.js,
 * frames it, and captures N JPEG frames while orbiting the model around Y.
 * The frames become Seedance keyframes so a static mesh turns into an
 * orbiting product video.
 *
 * Runs entirely in the browser — the ECS/alpine server never touches a 3D
 * renderer. `three` is dynamically imported so it stays out of the main
 * Studio bundle and only loads when a 3D node actually runs.
 *
 * The Seed3D GLB is plain glTF 2.0 (no Draco/KTX2), so GLTFLoader needs no
 * extra decoders.
 */

export type TurntableOptions = {
  /** Number of frames to render around the full 360° orbit. */
  frames: number;
  /** Square output resolution in pixels. */
  size: number;
  /** CSS background color behind the mesh (product turntables read best on
   *  a clean neutral). Default white. */
  background?: string;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
};

/** Render `frames` JPEG data URIs orbiting the mesh at `glbUrl`. */
export async function renderTurntable(
  glbUrl: string,
  opts: TurntableOptions,
): Promise<string[]> {
  const { frames, size, background = "#ffffff", signal, onProgress } = opts;
  if (frames < 1) throw new Error("frames must be ≥ 1");

  onProgress?.("Loading 3D engine…");
  const THREE = await import("three");
  const { GLTFLoader } = await import(
    "three/examples/jsm/loaders/GLTFLoader.js"
  );
  const { RoomEnvironment } = await import(
    "three/examples/jsm/environments/RoomEnvironment.js"
  );

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    // Required so toDataURL() can read the drawing buffer after render.
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // PBR needs an environment or metallic surfaces render black. RoomEnvironment
  // is a lightweight built-in studio IBL — no external HDR asset to fetch.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // A little direct light on top of the IBL for crisper form.
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  try {
    onProgress?.("Loading mesh…");
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(glbUrl);
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    const model = gltf.scene;

    // Center the model at the origin and record its size so we can frame it.
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    model.position.sub(center); // recenter to origin

    // Pivot we spin around Y; the model hangs off it already centered.
    const pivot = new THREE.Group();
    pivot.add(model);
    scene.add(pivot);

    // Frame the bounding sphere into a 35° camera with a small margin.
    const fov = 35;
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 1000);
    const dist =
      (sphere.radius / Math.sin((fov * Math.PI) / 180 / 2)) * 1.25;
    // Slight downward tilt reads as a product hero angle rather than dead-on.
    camera.position.set(0, sphere.radius * 0.35, dist);
    camera.lookAt(0, 0, 0);

    const out: string[] = [];
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      pivot.rotation.y = (i / frames) * Math.PI * 2;
      renderer.render(scene, camera);
      out.push(canvas.toDataURL("image/jpeg", 0.92));
      onProgress?.(`Rendering frame ${i + 1}/${frames}`);
      // Yield so a big orbit doesn't lock the main thread / lets aborts land.
      await new Promise((r) => setTimeout(r, 0));
    }

    // Dispose GPU resources for this mesh.
    model.traverse((obj) => {
      const mesh = obj as { geometry?: { dispose?: () => void }; material?: unknown };
      mesh.geometry?.dispose?.();
      const mat = mesh.material;
      const dispose = (m: { dispose?: () => void }) => m?.dispose?.();
      if (Array.isArray(mat)) mat.forEach((m) => dispose(m as { dispose?: () => void }));
      else if (mat) dispose(mat as { dispose?: () => void });
    });

    return out;
  } finally {
    pmrem.dispose();
    renderer.dispose();
    // Drop the WebGL context so repeated runs don't exhaust the browser's
    // context pool (browsers cap concurrent WebGL contexts).
    renderer.forceContextLoss?.();
  }
}
