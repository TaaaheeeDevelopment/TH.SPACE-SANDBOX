// ORION-3D SOLAR SYSTEM EXPLORER - CORE ENGINE
// Redesigned to run as a standard non-module script using global browser scope.
// Bypasses local file:// CORS restrictions and handles DOMContentLoaded state safely.

// Access data and audio from global window scope
const planetsData = window.planetsData;
const spaceAudio = window.spaceAudio;

// Application State
const state = {
  activePlanetId: 'sun',
  isOverview: true,
  timeScale: 5.0,
  orbitScale: 1.0,
  isRealisticSizes: false,
  isInclinedOrbits: false,   // Whether inclined orbits is active
  planetObjects: {},         // References to planet meshes and pivots
  orbitLines: [],            // References to orbit line meshes
  isMouseDown: false,
  moonObject: null,          // Earth's moon references
  earthCloudsMesh: null,     // Earth clouds layer
  venusCloudsMesh: null,     // Venus clouds layer
  lastWorldPos: new THREE.Vector3(), // For smooth camera follow delta tracking
  focusMode: 'freeze'        // 'freeze' or 'rotation' for focused planets
};

// Three.js Core Variables
let scene, camera, renderer, controls;
let skyboxMesh, skyboxMesh2;
let nebulaGroup1, nebulaGroup2, nebulaGroup3; // Volumetric cloud nebulae
let raycaster, mouse;
let pointLight, ambientLight;
let solarSystemGroup;        // Parent group for galactic motion

// Real Orbital Inclination Values in radians relative to the ecliptic plane
const inclinations = {
  sun: 0,
  mercury: 7.0 * (Math.PI / 180),
  venus: 3.39 * (Math.PI / 180),
  earth: 0,
  mars: 1.85 * (Math.PI / 180),
  jupiter: 1.30 * (Math.PI / 180),
  saturn: 2.49 * (Math.PI / 180),
  uranus: 0.77 * (Math.PI / 180),
  neptune: 1.77 * (Math.PI / 180)
};



// Atmospheric Glow Shaders
const AtmosphereShader = {
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    uniform vec3 glowColor;
    void main() {
      // Create a smooth glowing rim effect based on facing direction
      float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
      gl_FragColor = vec4(glowColor, 1.0) * intensity;
    }
  `
};

// Procedural Canvas Texture Generator
// Creates beautiful, asset-free high quality textures on the fly to avoid local file:// CORS loading errors
function createProceduralTexture(type, primaryColor, secondaryColor = '#000000') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (type === 'sun') {
    // Glowing plasma effect
    const grad = ctx.createRadialGradient(256, 128, 10, 256, 128, 250);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.2, primaryColor);
    grad.addColorStop(0.7, secondaryColor);
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    
    // Add magnetic turbulence lines
    ctx.strokeStyle = 'rgba(255, 69, 0, 0.3)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      ctx.arc(256, 128, 50 + i * 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (type === 'gas') {
    // Dynamic bands for gas giants
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, secondaryColor);
    grad.addColorStop(0.2, primaryColor);
    grad.addColorStop(0.4, '#a0522d');
    grad.addColorStop(0.6, primaryColor);
    grad.addColorStop(0.8, secondaryColor);
    grad.addColorStop(1, '#3e2723');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Add swirling storm bands and noise
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
      const h = Math.random() * 20 + 5;
      const y = Math.random() * 256;
      ctx.fillRect(0, y, 512, h);
    }
    
    // Jupiter's Great Red Spot
    if (primaryColor === '#d8ca9d') {
      ctx.fillStyle = '#b22222';
      ctx.beginPath();
      ctx.ellipse(320, 160, 25, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.stroke();
    }
  } else {
    // Terrestrial rocky texture
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(0, 0, 512, 256);
    
    // Landmass / crater generation
    ctx.fillStyle = primaryColor;
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 256;
      const r = Math.random() * 45 + 5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Add surface shadows/depth
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.1)';
      const x = Math.random() * 512;
      const y = Math.random() * 256;
      const r = Math.random() * 4 + 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// Generate Saturn / Uranus beautiful glowing rings texture
function createRingTexture(innerColor, outerColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.15, innerColor);
  grad.addColorStop(0.5, outerColor);
  grad.addColorStop(0.85, innerColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 16);
  
  // Add fine ring divisions
  for (let i = 0; i < 15; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.3)';
    const w = Math.random() * 6 + 1;
    const x = Math.random() * 400 + 50;
    ctx.fillRect(x, 0, w, 16);
  }
  
  return new THREE.CanvasTexture(canvas);
}

// Texture Loader with automatic CORS fallback
const textureLoader = new THREE.TextureLoader();

function applyTextureToMaterial(material, texturePath, type, primaryColor, secondaryColor) {
  // 1. Instantly apply beautiful procedural fallback first
  const procTex = createProceduralTexture(type, primaryColor, secondaryColor);
  material.map = procTex;
  material.needsUpdate = true;

  // 2. Try loading the real texture asynchronously
  textureLoader.load(
    texturePath,
    (loadedTex) => {
      loadedTex.wrapS = THREE.RepeatWrapping;
      loadedTex.wrapT = THREE.ClampToEdgeWrapping;
      
      // Successfully loaded! Assign map and refresh material
      material.map = loadedTex;
      material.needsUpdate = true;
      console.log(`Loaded texture: ${texturePath}`);
    },
    undefined,
    (err) => {
      console.warn(`Local file CORS block or error loading texture: ${texturePath}. Falling back smoothly to procedural.`);
    }
  );
}

function applySunTexture(material, texturePath, color) {
  const procTex = createProceduralTexture('sun', color, '#ff4500');
  material.map = procTex;
  material.emissiveMap = procTex;
  material.needsUpdate = true;
  
  textureLoader.load(
    texturePath,
    (loadedTex) => {
      loadedTex.wrapS = THREE.RepeatWrapping;
      loadedTex.wrapT = THREE.ClampToEdgeWrapping;
      
      material.map = loadedTex;
      material.emissiveMap = loadedTex;
      material.needsUpdate = true;
      console.log(`Sun texture loaded: ${texturePath}`);
    },
    undefined,
    (err) => {
      console.warn(`Sun texture CORS error. Fallback applied.`);
    }
  );
}

// Initialization of Scene
function initThree() {
  const canvas = document.getElementById('webgl-canvas');
  if (!canvas) return;
  
  // Create Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020208, 0.0006); // lower fog density for skybox clarity

  // Create Solar System parent group
  solarSystemGroup = new THREE.Group();
  scene.add(solarSystemGroup);

  // Camera - Increased far clipping plane to 30000 to support expanded realistic orbits and massive skybox
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 30000);
  camera.position.set(0, 55, 115); // Grand cinematic overview angle

  // Renderer - Optimized pixel ratio and parameters to enhance PC/Desktop performance dramatically
  // On large desktop viewports, devicePixelRatio above 1.35 causes massive fillrate overdraw on integrated GPUs.
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const cappedPixelRatio = isMobileDevice ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.35);

  renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: window.devicePixelRatio < 2, // Only enable AA on low-DPI devices to save power/GPU on high-DPI screens
    alpha: false, 
    powerPreference: "high-performance",
    precision: "mediump" // Use medium precision to boost fragment shader calculations on PC
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(cappedPixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  // Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 450;
  controls.minDistance = 3.5;

  // Lighting
  // 1. Sun light source (PointLight in the center)
  pointLight = new THREE.PointLight(0xffffff, 2.8, 2000, 0.4);
  pointLight.position.set(0, 0, 0);
  solarSystemGroup.add(pointLight);

  // 2. Cosmic Ambient light (Subtle purple/blue tone for dark side of planets)
  ambientLight = new THREE.AmbientLight(0x1a1e36, 0.35);
  scene.add(ambientLight);

  // Setup Raycasting
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Create Milky Way and Stars Skybox background
  createSkybox();

  // Create volumetric deep space nebulae
  createNebulaClouds();

  // Create Solar System
  buildSolarSystem();

  // Listeners
  window.addEventListener('resize', onWindowResize);
  
  // Click detection vs camera dragging detection (Desktop Pointer Events)
  let startX = 0, startY = 0;
  let startedOnCanvas = false;

  window.addEventListener('pointerdown', (e) => {
    // Only process mouse clicks (to prevent conflicts with mobile touch)
    if (e.pointerType !== 'mouse') return;
    if (e.button !== 0) return; // Only left click
    
    if (e.target === canvas) {
      startedOnCanvas = true;
      startX = e.clientX;
      startY = e.clientY;
    } else {
      startedOnCanvas = false;
    }
  });
  
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (e.button !== 0) return;
    
    if (startedOnCanvas) {
      const diffX = Math.abs(e.clientX - startX);
      const diffY = Math.abs(e.clientY - startY);
      if (diffX < 15 && diffY < 15) {
        onCanvasClick(e);
      }
    }
    startedOnCanvas = false;
  });

  // Touch support for mobile canvas tap
  let touchStartX = 0, touchStartY = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (e.changedTouches.length === 1) {
      const diffX = Math.abs(e.changedTouches[0].clientX - touchStartX);
      const diffY = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (diffX < 15 && diffY < 15) {
        const fakeEvent = {
          clientX: e.changedTouches[0].clientX,
          clientY: e.changedTouches[0].clientY
        };
        onCanvasClick(fakeEvent);
      }
    }
  }, { passive: true });

  canvas.addEventListener('mousemove', onCanvasMouseMove);

  // Launch loading animation transition
  animateLoader();
}

// Milky Way Skybox Background - Uses high-res assets textures for a professional organic space cocoon
function createSkybox() {
  const skyGeo = new THREE.SphereGeometry(10000, 64, 64);
  const skyMat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    fog: false
  });
  
  skyboxMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyboxMesh);
  
  textureLoader.load(
    'assets/8k_stars_milky_way.jpg',
    (texture) => {
      skyMat.map = texture;
      gsap.to(skyMat, { opacity: 0.95, duration: 2.0 });
      skyMat.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.warn("Milky Way 8k texture loading error.");
    }
  );
}

// Volumetric Nebula Gas Cloud Particle texture
function createNebulaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.15, 'rgba(168, 85, 247, 0.45)'); // Purple glow
  grad.addColorStop(0.45, 'rgba(99, 102, 241, 0.15)');  // Indigo/Blue glow
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  
  return new THREE.CanvasTexture(canvas);
}

// Create three massive drifting cosmic dust clouds in deep space - Optimized for PC/Desktop performance
function createNebulaClouds() {
  const texture = createNebulaTexture();
  
  // Helper to generate a single cluster of volumetric cloud points
  function generateNebulaCluster(count, radius, colorHex) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      // Gaussian/spherical random scattering
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = radius * (0.3 + Math.random() * 0.7);
      
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.45; // flatter dust plane
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    
    const mat = new THREE.PointsMaterial({
      size: 130 + Math.random() * 50, // optimized volumetric size to reduce overlapping fillrate overdraw on desktop
      map: texture,
      transparent: true,
      opacity: 0.18, // slightly higher opacity since there are fewer overlapping layers
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(colorHex),
      sizeAttenuation: true
    });
    
    return new THREE.Points(geo, mat);
  }
  
  // 1. Purple Nebula Cloud Group - Optimized counts for buttery-smooth performance
  nebulaGroup1 = generateNebulaCluster(180, 1500, '#b55fe6');
  nebulaGroup1.position.set(-1600, 200, -1200);
  scene.add(nebulaGroup1);
  
  // 2. Indigo/Blue Nebula Cloud Group - Optimized counts
  nebulaGroup2 = generateNebulaCluster(180, 1600, '#6366f1');
  nebulaGroup2.position.set(1500, -300, 1400);
  scene.add(nebulaGroup2);
  
  // 3. Magenta/Violet Nebula Cloud Group - Optimized counts
  nebulaGroup3 = generateNebulaCluster(150, 1200, '#d8b4fe');
  nebulaGroup3.position.set(-200, -500, 2200);
  scene.add(nebulaGroup3);
}

// Build Sun, Orbit paths and all Planets
function buildSolarSystem() {
  planetsData.forEach((data) => {
    // 1. Create Outer Inclination Group for physical orbital tilts
    const inclinationGroup = new THREE.Group();
    inclinationGroup.name = `${data.id}_inclination`;
    solarSystemGroup.add(inclinationGroup);

    // 2. Create Planet Revolution Pivot Group as child of inclinationGroup
    const planetPivot = new THREE.Group();
    planetPivot.name = `${data.id}_pivot`;
    inclinationGroup.add(planetPivot);

    // Core Sphere Mesh
    const sphereGeo = new THREE.SphereGeometry(data.size, 64, 64);
    
    // Choose appropriate procedural texture type
    let textureType = 'rock';
    let secondaryColor = '#0d0d1e';
    if (data.id === 'sun') {
      textureType = 'sun';
      secondaryColor = '#ff4500';
    } else if (data.id === 'jupiter' || data.id === 'saturn') {
      textureType = 'gas';
      secondaryColor = '#5c4033';
    } else if (data.id === 'earth') {
      secondaryColor = '#1e3f66';
    } else if (data.id === 'mars') {
      secondaryColor = '#800000';
    } else if (data.id === 'neptune') {
      secondaryColor = '#00003f';
    }

    const planetMat = new THREE.MeshStandardMaterial({
      roughness: 0.8,
      metalness: 0.1
    });

    // Apply texture with fallbacks
    if (data.id === 'sun') {
      planetMat.roughness = 0.2;
      planetMat.emissive = new THREE.Color(data.color);
      planetMat.emissiveIntensity = 1.8;
      applySunTexture(planetMat, 'assets/2k_sun.jpg', data.color);
    } else {
      let realTexturePath = `assets/2k_${data.id}.jpg`;
      if (data.id === 'venus') {
        realTexturePath = 'assets/2k_venus_surface.jpg';
      }
      applyTextureToMaterial(planetMat, realTexturePath, textureType, data.color, secondaryColor);
    }

    const planetMesh = new THREE.Mesh(sphereGeo, planetMat);
    planetMesh.name = data.id;
    planetMesh.castShadow = data.id !== 'sun';
    planetMesh.receiveShadow = data.id !== 'sun';
    
    // Position planet in orbit
    planetMesh.position.x = data.orbitRadius * state.orbitScale;
    planetPivot.add(planetMesh);
    
    // Randomize starting orbital position for a realistic scattered distribution
    if (data.id !== 'sun') {
      planetPivot.rotation.y = Math.random() * Math.PI * 2;
    }

    // Store reference
    state.planetObjects[data.id] = {
      mesh: planetMesh,
      pivot: planetPivot,
      inclinationGroup: inclinationGroup, // Reference to the outer tilt group
      size: data.size,
      orbitRadius: data.orbitRadius,
      orbitSpeed: data.orbitSpeed,
      rotationSpeed: data.rotationSpeed,
      orbitLine: null
    };

    // Atmospheres & Corona Shaders
    if (data.id !== 'sun') {
      const glowGeo = new THREE.SphereGeometry(data.size * 1.15, 32, 32);
      const glowMat = new THREE.ShaderMaterial({
        vertexShader: AtmosphereShader.vertexShader,
        fragmentShader: AtmosphereShader.fragmentShader,
        uniforms: {
          glowColor: { value: new THREE.Color(data.glowColor) }
        },
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.name = `${data.id}_atmosphere`;
      planetMesh.add(glowMesh);
    } else {
      // Extreme Solar lens glow sprite
      const glowGeo = new THREE.SphereGeometry(data.size * 1.25, 32, 32);
      const glowMat = new THREE.ShaderMaterial({
        vertexShader: AtmosphereShader.vertexShader,
        fragmentShader: AtmosphereShader.fragmentShader,
        uniforms: {
          glowColor: { value: new THREE.Color(data.glowColor) }
        },
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true
      });
      const sunGlow = new THREE.Mesh(glowGeo, glowMat);
      planetMesh.add(sunGlow);
    }

    // Clouds layers for Earth and Venus
    if (data.id === 'earth') {
      const cloudsGeo = new THREE.SphereGeometry(data.size * 1.015, 64, 64);
      const cloudsMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.0,
        blending: THREE.NormalBlending,
        depthWrite: false
      });
      const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
      cloudsMesh.name = 'earth_clouds';
      planetMesh.add(cloudsMesh);
      state.earthCloudsMesh = cloudsMesh;

      textureLoader.load(
        'assets/2k_earth_clouds.jpg',
        (tex) => {
          cloudsMat.map = tex;
          cloudsMat.opacity = 0.45;
          cloudsMat.needsUpdate = true;
        },
        undefined,
        (err) => {
          console.warn("Earth clouds local texture blocked by CORS.");
        }
      );
    }

    if (data.id === 'venus') {
      const cloudsGeo = new THREE.SphereGeometry(data.size * 1.012, 64, 64);
      const cloudsMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
      cloudsMesh.name = 'venus_clouds';
      planetMesh.add(cloudsMesh);
      state.venusCloudsMesh = cloudsMesh;

      textureLoader.load(
        'assets/2k_venus_atmosphere.jpg',
        (tex) => {
          cloudsMat.map = tex;
          cloudsMat.opacity = 0.35;
          cloudsMat.needsUpdate = true;
        },
        undefined,
        (err) => {
          console.warn("Venus clouds local texture blocked by CORS.");
        }
      );
    }

    // Earth's Moon
    if (data.id === 'earth') {
      const moonPivot = new THREE.Group();
      moonPivot.name = 'moon_pivot';
      moonPivot.position.x = data.orbitRadius * state.orbitScale;
      planetPivot.add(moonPivot);

      // Randomize Moon starting position as well
      moonPivot.rotation.y = Math.random() * Math.PI * 2;

      const moonGeo = new THREE.SphereGeometry(0.38, 32, 32);
      const moonMat = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        metalness: 0.1
      });
      applyTextureToMaterial(moonMat, 'assets/2k_moon.jpg', 'rock', '#8a8b8c', '#2c2c2c');

      const moonMesh = new THREE.Mesh(moonGeo, moonMat);
      moonMesh.name = 'moon';
      moonMesh.position.x = data.size * 1.65; // offset from Earth
      moonMesh.castShadow = true;
      moonMesh.receiveShadow = true;
      moonPivot.add(moonMesh);

      state.moonObject = {
        mesh: moonMesh,
        pivot: moonPivot,
        orbitSpeed: 0.032,
        rotationSpeed: 0.008
      };
    }

    // Rings (for Saturn and Uranus)
    if (data.hasRings) {
      const ringColor = data.ringColor || '#eed8ae';
      const innerRad = data.size * 1.4;
      const outerRad = data.size * 2.3;
      
      const ringGeo = new THREE.RingGeometry(innerRad, outerRad, 64);
      
      let ringMat;
      if (data.id === 'saturn') {
        ringMat = new THREE.MeshStandardMaterial({
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
          roughness: 0.6
        });
        
        // Load Saturn alpha ring map
        textureLoader.load(
          'assets/2k_saturn_ring_alpha.png',
          (ringTex) => {
            ringMat.map = ringTex;
            ringMat.alphaMap = ringTex;
            ringMat.needsUpdate = true;
          },
          undefined,
          (err) => {
            console.warn("Saturn rings CORS blocked, using procedural rings.");
            const ringTex = createRingTexture(ringColor, '#000000');
            ringMat.map = ringTex;
            ringMat.needsUpdate = true;
          }
        );
      } else {
        const ringTex = createRingTexture(ringColor, '#000000');
        ringMat = new THREE.MeshStandardMaterial({
          map: ringTex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
          roughness: 0.6
        });
      }
      
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.name = `${data.id}_ring`;
      ringMesh.rotation.x = Math.PI / 2.2; // elegant ring tilt
      planetMesh.add(ringMesh);

      // Fix UV mapping for rings to look circular
      const pos = ringGeo.attributes.position;
      const v2 = new THREE.Vector2();
      for (let i = 0; i < pos.count; i++) {
        v2.set(pos.getX(i), pos.getY(i));
        const len = v2.length();
        const u = (len - innerRad) / (outerRad - innerRad);
        ringGeo.attributes.uv.setXY(i, u, 0.5);
      }
    }

    // Orbit path line
    if (data.orbitRadius > 0) {
      const orbitCurve = new THREE.EllipseCurve(
        0, 0,
        data.orbitRadius * state.orbitScale, data.orbitRadius * state.orbitScale,
        0, 2.0 * Math.PI,
        false
      );
      
      const points = orbitCurve.getPoints(128);
      const points3D = points.map(p => new THREE.Vector3(p.x, 0, p.y));
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(points3D);
      
      const orbitMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(data.color),
        transparent: true,
        opacity: 0.16
      });

      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      inclinationGroup.add(orbitLine); // Added to inclinationGroup instead of solarSystemGroup
      state.orbitLines.push(orbitLine);
      state.planetObjects[data.id].orbitLine = orbitLine;
    }
  });
}

// Smoothly redraw Orbit Paths upon scale slider changes
function rebuildOrbitPaths() {
  // Remove orbit lines from their respective parent inclinationGroups
  planetsData.forEach((data) => {
    const pObj = state.planetObjects[data.id];
    if (pObj && pObj.orbitLine && pObj.inclinationGroup) {
      pObj.inclinationGroup.remove(pObj.orbitLine);
    }
  });
  state.orbitLines = [];

  planetsData.forEach((data) => {
    if (data.orbitRadius > 0) {
      const pObj = state.planetObjects[data.id];
      if (!pObj) return;
      
      const currentOrbitRadius = pObj.orbitRadius; // Use dynamic animated orbitRadius
      const scaledRadius = currentOrbitRadius * state.orbitScale;
      
      pObj.mesh.position.x = scaledRadius;
      
      // Update Moon position with Earth X position
      if (data.id === 'earth' && state.moonObject) {
        state.moonObject.pivot.position.x = scaledRadius;
      }

      const orbitCurve = new THREE.EllipseCurve(
        0, 0,
        scaledRadius, scaledRadius,
        0, 2.0 * Math.PI,
        false
      );

      const points = orbitCurve.getPoints(128);
      const points3D = points.map(p => new THREE.Vector3(p.x, 0, p.y));
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(points3D);
      
      const orbitMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(data.color),
        transparent: true,
        opacity: 0.16
      });

      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      
      pObj.inclinationGroup.add(orbitLine); // Added to inclinationGroup instead of solarSystemGroup
      state.orbitLines.push(orbitLine);
      pObj.orbitLine = orbitLine;
    }
  });
}

// Toggle sizes: Realistic educational proportions (AND dynamic orbits expansion!)
function toggleRealisticScales() {
  state.isRealisticSizes = !state.isRealisticSizes;
  
  // Dynamic camera boundary constraints - clamped at 5000 to keep the camera inside the 10000 skybox cocoon
  controls.maxDistance = state.isRealisticSizes ? 5000 : 800;
  
  planetsData.forEach((data) => {
    const pObj = state.planetObjects[data.id];
    if (!pObj) return;

    let targetSize = data.size;
    let targetOrbitRadius = data.orbitRadius;
    
    if (state.isRealisticSizes) {
      // Scaling compared to Earth (Size = 2.0)
      if (data.id === 'sun') targetSize = 22.0; 
      else if (data.id === 'mercury') targetSize = 0.7;
      else if (data.id === 'venus') targetSize = 1.8;
      else if (data.id === 'earth') targetSize = 2.0;
      else if (data.id === 'mars') targetSize = 1.0;
      else if (data.id === 'jupiter') targetSize = 10.0;
      else if (data.id === 'saturn') targetSize = 8.5;
      else if (data.id === 'uranus') targetSize = 4.2;
      else if (data.id === 'neptune') targetSize = 4.0;
      
      // Spaced Out Logarithmic Orbit Spacing (to keep Mercury visible!)
      if (data.id === 'mercury') targetOrbitRadius = 45;
      else if (data.id === 'venus') targetOrbitRadius = 75;
      else if (data.id === 'earth') targetOrbitRadius = 110;
      else if (data.id === 'mars') targetOrbitRadius = 160;
      else if (data.id === 'jupiter') targetOrbitRadius = 300;
      else if (data.id === 'saturn') targetOrbitRadius = 480;
      else if (data.id === 'uranus') targetOrbitRadius = 700;
      else if (data.id === 'neptune') targetOrbitRadius = 950;
    }

    // Scale mesh smoothly via GSAP
    gsap.to(pObj.mesh.scale, {
      x: targetSize / data.size,
      y: targetSize / data.size,
      z: targetSize / data.size,
      duration: 1.2,
      ease: 'power3.out'
    });
    
    // Scale Moon relative to Earth size
    if (data.id === 'earth' && state.moonObject) {
      let targetMoonScale = state.isRealisticSizes ? 0.2 / 0.38 : 1.0;
      gsap.to(state.moonObject.mesh.scale, {
        x: targetMoonScale,
        y: targetMoonScale,
        z: targetMoonScale,
        duration: 1.2,
        ease: 'power3.out'
      });
      // Slide Moon distance slightly closer in realistic mode
      gsap.to(state.moonObject.mesh.position, {
        x: state.isRealisticSizes ? 5.2 : data.size * 1.65,
        duration: 1.2,
        ease: 'power3.out'
      });
    }

    // Slide planet and its moon pivot outwards smoothly
    gsap.to(pObj, {
      orbitRadius: targetOrbitRadius,
      duration: 1.5,
      ease: 'power3.inOut',
      onUpdate: () => {
        pObj.mesh.position.x = pObj.orbitRadius * state.orbitScale;
        if (data.id === 'earth' && state.moonObject) {
          state.moonObject.pivot.position.x = pObj.orbitRadius * state.orbitScale;
        }
      }
    });
  });
  
  // Animate orbit paths rebuilding in real-time
  let progressObj = { val: 0 };
  gsap.to(progressObj, {
    val: 1,
    duration: 1.5,
    onUpdate: () => {
      rebuildOrbitPaths();
    }
  });
}

// Toggle Inclined Orbits: tilt the entire nested inclinationGroup around Z-axis dynamically
function toggleOrbitTilt() {
  Object.keys(state.planetObjects).forEach((id) => {
    const pObj = state.planetObjects[id];
    if (!pObj) return;

    const targetTilt = state.isInclinedOrbits ? (inclinations[id] || 0) : 0;
    
    // Animate tilt on inclination group (tilts both orbit and planet orbit plane in perfect sync!)
    gsap.to(pObj.inclinationGroup.rotation, {
      z: targetTilt,
      duration: 1.6,
      ease: 'power3.inOut'
    });
  });
}

// Raycaster listener to click planets inside the 3D space recursively (supports clouds, atmospheres, and rings)
function onCanvasClick(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Search recursively through the solar system group
  const intersects = raycaster.intersectObjects(solarSystemGroup.children, true);

  let planetId = null;
  for (let i = 0; i < intersects.length; i++) {
    let obj = intersects[i].object;
    // Traverse up to find the parent matching any planet ID
    while (obj) {
      if (state.planetObjects[obj.name]) {
        planetId = obj.name;
        break;
      }
      obj = obj.parent;
    }
    if (planetId) break;
  }

  if (planetId) {
    focusOnPlanet(planetId);
  }
}

// Hover state on canvas to show cyber pointer recursively
function onCanvasMouseMove(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(solarSystemGroup.children, true);

  let hasPlanet = false;
  for (let i = 0; i < intersects.length; i++) {
    let obj = intersects[i].object;
    while (obj) {
      if (state.planetObjects[obj.name]) {
        hasPlanet = true;
        break;
      }
      obj = obj.parent;
    }
    if (hasPlanet) break;
  }

  const canvas = document.getElementById('webgl-canvas');
  if (hasPlanet) {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'default';
  }
}

// Focus camera on a selected planet with smooth cinemantics
function focusOnPlanet(planetId) {
  const planetObj = state.planetObjects[planetId];
  if (!planetObj) return;

  spaceAudio.init(); // ensure sound context starts
  spaceAudio.playTransition();
  spaceAudio.playClick();

  state.activePlanetId = planetId;
  state.isOverview = false;

  // Reset focus mode to freeze on new selection
  state.focusMode = 'freeze';
  const freezeBtn = document.getElementById('mode-freeze-btn');
  const rotateBtn = document.getElementById('mode-rotate-btn');
  if (freezeBtn && rotateBtn) {
    freezeBtn.classList.add('active');
    rotateBtn.classList.remove('active');
  }

  const mFreezeBtn = document.getElementById('mobile-mode-freeze-btn');
  const mRotateBtn = document.getElementById('mobile-mode-rotate-btn');
  if (mFreezeBtn && mRotateBtn) {
    mFreezeBtn.classList.add('active');
    mRotateBtn.classList.remove('active');
  }

  // Update UI Switcher active highlights
  document.querySelectorAll('.switcher-item').forEach(item => {
    item.classList.toggle('active', item.dataset.planetId === planetId);
  });

  // Update mobile active state highlight
  document.querySelectorAll('.mobile-planet-item').forEach(item => {
    item.classList.toggle('active', item.dataset.planetId === planetId);
  });

  // Calculate dynamic planetary vector location
  const targetWorldPos = new THREE.Vector3();
  planetObj.mesh.getWorldPosition(targetWorldPos);
  
  // Initialize lastWorldPos for delta camera follow tracking
  state.lastWorldPos.copy(targetWorldPos);

  // Transition controls target directly to the planet center
  gsap.to(controls.target, {
    x: targetWorldPos.x,
    y: targetWorldPos.y,
    z: targetWorldPos.z,
    duration: 1.5,
    ease: 'power3.inOut',
    onUpdate: () => controls.update()
  });

  // Position camera closer depending on planet size (dynamically adjusted for realistic scale)
  const currentPlanetSize = planetObj.size * planetObj.mesh.scale.x;
  const focusOffset = currentPlanetSize * 4.0; // Increased factor to 4.0 for standard safe viewing distance
  let targetCamPos = new THREE.Vector3(
    targetWorldPos.x + focusOffset * 0.8,
    targetWorldPos.y + focusOffset * 0.5,
    targetWorldPos.z + focusOffset * 1.2
  );

  if (planetId === 'mercury') {
    // Face away from the Sun to prevent camera entering inside the Sun
    const dirFromSun = new THREE.Vector3().copy(targetWorldPos).normalize();
    if (dirFromSun.length() === 0) dirFromSun.set(1, 0, 0); // fallback
    const distance = currentPlanetSize * 6.5; // safe distance using current scaled size
    targetCamPos.copy(targetWorldPos).addScaledVector(dirFromSun, distance);
    targetCamPos.y += currentPlanetSize * 2.5; // slight height offset
  }

  gsap.to(camera.position, {
    x: targetCamPos.x,
    y: targetCamPos.y,
    z: targetCamPos.z,
    duration: 1.5,
    ease: 'power3.inOut',
    onComplete: () => {
      // Sync lastWorldPos exactly to the current position after transition completes
      planetObj.mesh.getWorldPosition(state.lastWorldPos);
    }
  });

  // Display details panel HUD
  const planetData = planetsData.find(d => d.id === planetId);
  populatePlanetHUD(planetData);
}

// Vector SVG Planet Generator (Interactive glowing hologram look)
function getPlanetHologramSVG(planetId, color, glowColor) {
  let innerElements = '';
  
  if (planetId === 'sun') {
    innerElements = `
      <circle cx="75" cy="75" r="45" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,8" opacity="0.7">
        <animateTransform attributeName="transform" type="rotate" from="0 75 75" to="360 75 75" dur="15s" repeatCount="indefinite"/>
      </circle>
      <circle cx="75" cy="75" r="38" fill="url(#sunGrad)" />
      <path d="M75,20 L75,10 M75,130 L75,140 M20,75 L10,75 M130,75 L140,75" stroke="${glowColor}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
      <path d="M36,36 L29,29 M114,114 L121,121 M36,114 L29,121 M114,36 L121,29" stroke="${glowColor}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    `;
  } else if (planetId === 'saturn') {
    innerElements = `
      <ellipse cx="75" cy="75" rx="55" ry="12" fill="none" stroke="${color}" stroke-width="2.5" transform="rotate(-15 75 75)" opacity="0.8"/>
      <ellipse cx="75" cy="75" rx="46" ry="8" fill="none" stroke="${glowColor}" stroke-width="1.5" transform="rotate(-15 75 75)" opacity="0.6"/>
      <circle cx="75" cy="75" r="26" fill="url(#bodyGrad)" />
      <path d="M 31,86 A 55 12 0 0 0 119,62" fill="none" stroke="${color}" stroke-width="2.5" transform="rotate(-15 75 75)"/>
    `;
  } else if (planetId === 'uranus') {
    innerElements = `
      <ellipse cx="75" cy="75" rx="7" ry="46" fill="none" stroke="${color}" stroke-width="2" transform="rotate(80 75 75)" opacity="0.7"/>
      <circle cx="75" cy="75" r="22" fill="url(#bodyGrad)" />
      <path d="M 74,29 A 7 46 0 0 0 76,121" fill="none" stroke="${color}" stroke-width="2" transform="rotate(80 75 75)"/>
    `;
  } else if (planetId === 'earth') {
    innerElements = `
      <circle cx="75" cy="75" r="42" fill="none" stroke="${color}" stroke-width="0.7" stroke-dasharray="3,5" opacity="0.5"/>
      <circle cx="75" cy="75" r="24" fill="url(#bodyGrad)" />
      <path d="M62,65 Q58,60 62,56 T72,60 T68,70 Z M82,85 Q88,80 82,75 T72,70 T82,88 Z" fill="none" stroke="${glowColor}" stroke-width="1.2" opacity="0.8">
        <animateTransform attributeName="transform" type="rotate" from="0 75 75" to="360 75 75" dur="25s" repeatCount="indefinite"/>
      </path>
      <circle cx="117" cy="75" r="3.5" fill="${glowColor}">
        <animateTransform attributeName="transform" type="rotate" from="0 75 75" to="360 75 75" dur="8s" repeatCount="indefinite"/>
      </circle>
    `;
  } else if (planetId === 'mars') {
    innerElements = `
      <circle cx="75" cy="75" r="20" fill="url(#bodyGrad)" />
      <circle cx="68" cy="68" r="4" fill="none" stroke="${glowColor}" stroke-width="1" opacity="0.7"/>
      <circle cx="80" cy="78" r="3" fill="none" stroke="${glowColor}" stroke-width="1" opacity="0.6"/>
      <circle cx="74" cy="82" r="2.5" fill="none" stroke="${glowColor}" stroke-width="0.8" opacity="0.8"/>
      <circle cx="102" cy="75" r="1.5" fill="#ff7f50">
        <animateTransform attributeName="transform" type="rotate" from="40 75 75" to="400 75 75" dur="6s" repeatCount="indefinite"/>
      </circle>
      <circle cx="110" cy="75" r="1.5" fill="#ffa07a">
        <animateTransform attributeName="transform" type="rotate" from="180 75 75" to="540 75 75" dur="9s" repeatCount="indefinite"/>
      </circle>
    `;
  } else if (planetId === 'jupiter') {
    innerElements = `
      <circle cx="75" cy="75" r="32" fill="url(#bodyGrad)" />
      <path d="M 45,63 L 105,63 M 43,69 L 107,69 M 43,81 L 107,81 M 46,87 L 104,87" stroke="rgba(255,255,255,0.25)" stroke-width="1.8"/>
      <ellipse cx="88" cy="80" rx="6" ry="3.5" fill="#b22222" stroke="${color}" stroke-width="0.5"/>
    `;
  } else {
    innerElements = `
      <circle cx="75" cy="75" r="24" fill="url(#bodyGrad)" />
      <path d="M54,65 Q58,75 75,75 T96,85" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <path d="M51,75 Q75,65 99,75" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1.5"/>
    `;
  }

  return `
    <svg viewBox="0 0 150 150" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sunGrad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="35%" stop-color="${color}"/>
          <stop offset="85%" stop-color="${glowColor}"/>
          <stop offset="100%" stop-color="#000000"/>
        </radialGradient>
        <radialGradient id="bodyGrad" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
          <stop offset="50%" stop-color="${glowColor}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#050512" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="75" cy="75" r="54" fill="none" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,6" opacity="0.4"/>
      <path d="M75,10 L75,18 M75,132 L75,140 M10,75 L18,75 M132,75 L140,75" stroke="${color}" stroke-width="1" opacity="0.6"/>
      ${innerElements}
    </svg>
  `;
}

// Populate panel sidebar details
function populatePlanetHUD(data) {
  document.getElementById('planet-eng-name').textContent = data.englishName;
  document.getElementById('planet-ara-name').textContent = data.name;
  document.getElementById('planet-tagline').textContent = data.tagline;
  document.getElementById('planet-description').textContent = data.description;
  document.getElementById('stat-mass').textContent = data.stats.mass;
  document.getElementById('stat-gravity').textContent = data.stats.gravity;
  document.getElementById('stat-temp').textContent = data.stats.temp;
  document.getElementById('stat-moons').textContent = data.stats.moons;
  document.getElementById('stat-dist').textContent = data.stats.distFromSun;
  document.getElementById('stat-year').textContent = data.stats.yearLength;
  document.getElementById('planet-fun-fact').textContent = data.funFact;
  
  const orders = {
    sun: "نجم النظام",
    mercury: "الكوكب الأول",
    venus: "الكوكب الثاني",
    earth: "الكوكب الثالث",
    mars: "الكوكب الرابع",
    jupiter: "الكوكب الخامس",
    saturn: "الكوكب السادس",
    uranus: "الكوكب السابع",
    neptune: "الكوكب الثامن"
  };
  const orderText = orders[data.id] || "كوكب";
  document.getElementById('planet-order').textContent = orderText;

  const container = document.getElementById('planet-graphic-svg');
  if (container) {
    container.innerHTML = getPlanetHologramSVG(data.id, data.color, data.glowColor);
    container.style.setProperty('--glow-color', data.glowColor);
  }

  const panel = document.getElementById('planet-hud');
  panel.classList.add('visible');

  // MOBILE HUD POPULATION & AUTO OPEN
  const mEngName = document.getElementById('mobile-planet-eng-name');
  if (mEngName) mEngName.textContent = data.englishName;
  
  const mAraName = document.getElementById('mobile-planet-ara-name');
  if (mAraName) mAraName.textContent = data.name;
  
  const mTagline = document.getElementById('mobile-planet-tagline');
  if (mTagline) mTagline.textContent = data.tagline;
  
  const mDescription = document.getElementById('mobile-planet-description');
  if (mDescription) mDescription.textContent = data.description;
  
  const mMass = document.getElementById('mobile-stat-mass');
  if (mMass) mMass.textContent = data.stats.mass;
  
  const mGravity = document.getElementById('mobile-stat-gravity');
  if (mGravity) mGravity.textContent = data.stats.gravity;
  
  const mTemp = document.getElementById('mobile-stat-temp');
  if (mTemp) mTemp.textContent = data.stats.temp;
  
  const mMoons = document.getElementById('mobile-stat-moons');
  if (mMoons) mMoons.textContent = data.stats.moons;
  
  const mDist = document.getElementById('mobile-stat-dist');
  if (mDist) mDist.textContent = data.stats.distFromSun;
  
  const mYear = document.getElementById('mobile-stat-year');
  if (mYear) mYear.textContent = data.stats.yearLength;
  
  const mFunFact = document.getElementById('mobile-planet-fun-fact');
  if (mFunFact) mFunFact.textContent = data.funFact;
  
  const mOrder = document.getElementById('mobile-planet-order');
  if (mOrder) mOrder.textContent = orderText;

  // Show toggle button but DO NOT automatically open details drawer on mobile
  const mobileToggle = document.getElementById('mobile-drawer-toggle');
  const mobileDrawer = document.getElementById('mobile-planet-hud-drawer');
  if (mobileToggle && mobileDrawer) {
    mobileToggle.style.display = 'flex';
    mobileToggle.classList.remove('drawer-open');
    mobileDrawer.classList.remove('visible');
  }
}

// Cinematic zoom-out back to the Solar System Overview
function resetToOverview() {
  spaceAudio.playTransition();
  spaceAudio.playClick();

  state.isOverview = true;
  state.activePlanetId = 'sun';

  // Remove switcher active status except Sun
  document.querySelectorAll('.switcher-item').forEach(item => {
    item.classList.toggle('active', item.dataset.planetId === 'sun');
  });

  document.querySelectorAll('.mobile-planet-item').forEach(item => {
    item.classList.toggle('active', item.dataset.planetId === 'sun');
  });

  // Slide-out panel
  document.getElementById('planet-hud').classList.remove('visible');

  // Slide-out mobile drawers
  const mobileDrawer = document.getElementById('mobile-planet-hud-drawer');
  if (mobileDrawer) mobileDrawer.classList.remove('visible');
  const mobileToggle = document.getElementById('mobile-drawer-toggle');
  if (mobileToggle) {
    mobileToggle.style.display = 'none';
    mobileToggle.classList.remove('drawer-open');
  }

  // Dynamic overview centering relative to Sun's dynamic position
  const sunWorldPos = new THREE.Vector3();
  const sunObj = state.planetObjects['sun'];
  if (sunObj) {
    sunObj.mesh.getWorldPosition(sunWorldPos);
  }

  let camOffset = new THREE.Vector3(0, 55, 115);
  if (state.isRealisticSizes) {
    camOffset.set(0, 450, 950); // zoomed out further for realistic orbits
  }

  // Smoothly center controls target back to origin (Sun)
  gsap.to(controls.target, {
    x: sunWorldPos.x,
    y: sunWorldPos.y,
    z: sunWorldPos.z,
    duration: 1.6,
    ease: 'power2.inOut',
    onUpdate: () => controls.update()
  });

  // Re-establish majestic overview camera perspective
  gsap.to(camera.position, {
    x: sunWorldPos.x + camOffset.x,
    y: sunWorldPos.y + camOffset.y,
    z: sunWorldPos.z + camOffset.z,
    duration: 1.6,
    ease: 'power2.inOut'
  });
}

// Window resizing adjustments
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Cosmic loading screen simulation
function animateLoader() {
  const fill = document.getElementById('progress-fill');
  const txt = document.getElementById('progress-text');
  if (!fill || !txt) return;
  let pct = 0;

  const interval = setInterval(() => {
    pct += Math.floor(Math.random() * 8) + 2;
    if (pct >= 100) {
      pct = 100;
      clearInterval(interval);
      
      setTimeout(() => {
        const loader = document.getElementById('loader-screen');
        if (loader) {
          loader.style.opacity = 0;
          setTimeout(() => loader.style.display = 'none', 1000);
        }
      }, 500);
    }
    fill.style.width = `${pct}%`;
    txt.textContent = `${pct}%`;
  }, 30);
}

// The Core Animation Loop (Runs at 60 FPS)
function animate(time) {
  requestAnimationFrame(animate);

  // Rotate high-res background skyboxes slowly for organic drift
  if (skyboxMesh) {
    skyboxMesh.rotation.y += 0.00003;
  }
  // Rotate volumetric nebulae slowly in opposite directions
  if (nebulaGroup1) {
    nebulaGroup1.rotation.y += 0.00003;
    nebulaGroup1.rotation.x -= 0.000008;
  }
  if (nebulaGroup2) {
    nebulaGroup2.rotation.y -= 0.00002;
    nebulaGroup2.rotation.z += 0.00001;
  }
  if (nebulaGroup3) {
    nebulaGroup3.rotation.y += 0.000015;
  }

  // Update revolutions and rotations for each active planet
  const isTimePausedForOrbits = !state.isOverview; // Focus active -> freeze orbital revolution!

  Object.keys(state.planetObjects).forEach((id) => {
    const pObj = state.planetObjects[id];
    
    // 1. Orbital Revolution (Except Sun)
    if (id !== 'sun' && pObj.orbitSpeed > 0) {
      if (!isTimePausedForOrbits) {
        pObj.pivot.rotation.y += pObj.orbitSpeed * 0.15 * state.timeScale;
      }
    }

    // 2. Self Rotation on Axis
    if (!state.isOverview) {
      // Focused mode: Selected planet rotates around axis ONLY if focusMode is 'rotation'
      if (state.focusMode === 'rotation') {
        if (id === state.activePlanetId) {
          pObj.mesh.rotation.y += pObj.rotationSpeed * state.timeScale;
        }
      }
    } else {
      // Overview mode: normal self-rotation
      pObj.mesh.rotation.y += pObj.rotationSpeed * state.timeScale;
    }
  });

  // Earth and Venus cloud layers rotation
  if (state.earthCloudsMesh) {
    if (state.isOverview || (state.activePlanetId === 'earth' && state.focusMode === 'rotation')) {
      state.earthCloudsMesh.rotation.y += 0.00035 * state.timeScale;
    }
  }
  if (state.venusCloudsMesh) {
    if (state.isOverview || (state.activePlanetId === 'venus' && state.focusMode === 'rotation')) {
      state.venusCloudsMesh.rotation.y += 0.00015 * state.timeScale;
    }
  }

  // Earth's Moon orbiting Earth
  if (state.moonObject) {
    if (state.isOverview) {
      state.moonObject.pivot.rotation.y += state.moonObject.orbitSpeed * state.timeScale;
      state.moonObject.mesh.rotation.y += state.moonObject.rotationSpeed * state.timeScale;
    } else if (state.activePlanetId === 'earth' && state.focusMode === 'rotation') {
      state.moonObject.pivot.rotation.y += state.moonObject.orbitSpeed * state.timeScale;
      state.moonObject.mesh.rotation.y += state.moonObject.rotationSpeed * state.timeScale;
    }
  }

  // Dynamic Camera target centering with delta tracking (locks onto moving planets)
  if (!state.isOverview && state.activePlanetId) {
    const focusedObj = state.planetObjects[state.activePlanetId];
    if (focusedObj) {
      const currentWorldPos = new THREE.Vector3();
      focusedObj.mesh.getWorldPosition(currentWorldPos);
      
      // Calculate delta movement since the last frame
      const deltaMove = currentWorldPos.clone().sub(state.lastWorldPos);
      
      // Move camera and controls target by the same delta
      camera.position.add(deltaMove);
      controls.target.add(deltaMove);
      
      // Save current position for the next frame
      state.lastWorldPos.copy(currentWorldPos);
    }
  } else {
    // Keep target strictly glued to the Sun's position
    const sunObj = state.planetObjects['sun'];
    if (sunObj) {
      const sunWorldPos = new THREE.Vector3();
      sunObj.mesh.getWorldPosition(sunWorldPos);
      controls.target.copy(sunWorldPos);
    }
  }

  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// Wire up events and DOM triggers
function setupEventListeners() {
  // Automatically initialize and play space drone on first user interaction (bypasses browser autoplay blocks)
  const initAudioOnFirstClick = () => {
    spaceAudio.init();
    document.removeEventListener('click', initAudioOnFirstClick);
    document.removeEventListener('keydown', initAudioOnFirstClick);
  };
  document.addEventListener('click', initAudioOnFirstClick);
  document.addEventListener('keydown', initAudioOnFirstClick);

  // Web Audio trigger button
  const soundBtn = document.getElementById('sound-btn');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      spaceAudio.init();
      const isMuted = spaceAudio.toggleMute();
      
      const icon = soundBtn.querySelector('i');
      const label = soundBtn.querySelector('span');
      
      if (isMuted) {
        icon.className = 'fa-solid fa-volume-xmark';
        label.textContent = 'تشغيل الصوت';
        soundBtn.classList.remove('active');
      } else {
        icon.className = 'fa-solid fa-volume-high';
        label.textContent = 'كتم الصوت';
        soundBtn.classList.add('active');
      }
      spaceAudio.playClick();
    });
  }

  // HUD Settings Toggle Menu
  const settingsBtn = document.getElementById('settings-toggle-btn');
  const settingsCard = document.getElementById('settings-card');
  if (settingsBtn && settingsCard) {
    settingsBtn.addEventListener('click', () => {
      spaceAudio.init();
      spaceAudio.playClick();
      const isOpen = settingsCard.style.display === 'flex';
      settingsCard.style.display = isOpen ? 'none' : 'flex';
      settingsBtn.classList.toggle('active', !isOpen);
    });
  }

  // Time Scale Speed Slider
  const speedSlider = document.getElementById('time-speed-slider');
  const speedValText = document.getElementById('time-speed-value');
  if (speedSlider && speedValText) {
    speedSlider.addEventListener('input', (e) => {
      state.timeScale = parseFloat(e.target.value);
      speedValText.textContent = `${state.timeScale.toFixed(1)}x`;
    });
  }

  // Orbit Scale Slider
  const orbitSlider = document.getElementById('orbit-scale-slider');
  const orbitValText = document.getElementById('orbit-scale-value');
  if (orbitSlider && orbitValText) {
    orbitSlider.addEventListener('input', (e) => {
      state.orbitScale = parseFloat(e.target.value);
      orbitValText.textContent = `${state.orbitScale.toFixed(2)}x`;
      rebuildOrbitPaths();
    });
  }

  // Realistic sizes toggle
  const scaleModeBtn = document.getElementById('scale-mode-btn');
  if (scaleModeBtn) {
    scaleModeBtn.addEventListener('click', () => {
      spaceAudio.init();
      spaceAudio.playClick();
      toggleRealisticScales();
      scaleModeBtn.classList.toggle('active', state.isRealisticSizes);
      const label = scaleModeBtn.querySelector('span');
      label.textContent = state.isRealisticSizes ? 'المقياس التفاعلي' : 'المقياس الواقعي';
    });
  }

  // Orbit Inclination Toggle
  const orbitTiltBtn = document.getElementById('orbit-tilt-btn');
  if (orbitTiltBtn) {
    orbitTiltBtn.addEventListener('click', () => {
      spaceAudio.init();
      spaceAudio.playClick();
      state.isInclinedOrbits = !state.isInclinedOrbits;
      
      orbitTiltBtn.classList.toggle('active', state.isInclinedOrbits);
      const label = orbitTiltBtn.querySelector('span');
      if (state.isInclinedOrbits) {
        label.textContent = 'المدارات المائلة';
      } else {
        label.textContent = 'المدارات المستوية';
      }
      
      toggleOrbitTilt();
    });
  }



  // Bottom switcher dock navigation
  const dockItems = document.querySelectorAll('.switcher-item');
  dockItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
      spaceAudio.init();
      spaceAudio.playHover();
    });

    item.addEventListener('click', () => {
      const planetId = item.dataset.planetId;
      if (planetId === 'sun') {
        resetToOverview();
      } else {
        focusOnPlanet(planetId);
      }
    });
  });

  // Action Panel reset
  const closeBtn = document.getElementById('close-hud-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', resetToOverview);
  }

  // Focus mode buttons: Motionless vs Axial Rotation
  const freezeBtn = document.getElementById('mode-freeze-btn');
  const rotateBtn = document.getElementById('mode-rotate-btn');
  
  if (freezeBtn && rotateBtn) {
    freezeBtn.addEventListener('click', () => {
      state.focusMode = 'freeze';
      freezeBtn.classList.add('active');
      rotateBtn.classList.remove('active');
      spaceAudio.init();
      spaceAudio.playClick();
    });
    
    rotateBtn.addEventListener('click', () => {
      state.focusMode = 'rotation';
      rotateBtn.classList.add('active');
      freezeBtn.classList.remove('active');
      spaceAudio.init();
      spaceAudio.playClick();
    });
  }

  // --- MOBILE HUD CONTROLS ---

  // 1. Mobile Drawer Tab Navigation
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
  const mobileDrawers = document.querySelectorAll('.mobile-drawer');

  mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      spaceAudio.init();
      spaceAudio.playClick();

      const panelId = btn.dataset.panel;
      const targetDrawer = document.getElementById(panelId);

      if (targetDrawer) {
        const isAlreadyVisible = targetDrawer.classList.contains('visible');

        // Hide all drawers and deactivate all tab buttons
        mobileDrawers.forEach(drawer => drawer.classList.remove('visible'));
        mobileNavBtns.forEach(navBtn => navBtn.classList.remove('active'));

        // Toggle the clicked one
        if (!isAlreadyVisible) {
          targetDrawer.classList.add('visible');
          btn.classList.add('active');
        }
      }
    });
  });

  // 2. Mobile Drawer Close Buttons
  const closeDrawerBtns = document.querySelectorAll('.close-drawer-btn');
  closeDrawerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      spaceAudio.init();
      spaceAudio.playClick();
      
      // Close the closest drawer parent
      const parentDrawer = btn.closest('.mobile-drawer');
      if (parentDrawer) {
        parentDrawer.classList.remove('visible');
      }
      
      // Also deactivate matching nav button
      mobileNavBtns.forEach(navBtn => {
        if (parentDrawer && navBtn.dataset.panel === parentDrawer.id) {
          navBtn.classList.remove('active');
        }
      });
    });
  });

  // 3. Mobile Planet Selection Grid
  const mobilePlanetItems = document.querySelectorAll('.mobile-planet-item');
  mobilePlanetItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
      spaceAudio.init();
      spaceAudio.playHover();
    });

    item.addEventListener('click', () => {
      const planetId = item.dataset.planetId;
      
      // Close planets drawer automatically upon selection
      const planetsDrawer = document.getElementById('mobile-planets');
      if (planetsDrawer) {
        planetsDrawer.classList.remove('visible');
      }
      mobileNavBtns.forEach(navBtn => {
        if (navBtn.dataset.panel === 'mobile-planets') {
          navBtn.classList.remove('active');
        }
      });

      if (planetId === 'sun') {
        resetToOverview();
      } else {
        focusOnPlanet(planetId);
      }
    });
  });

  // 4. Mobile Sound Sync Toggle
  const mobileSoundBtn = document.getElementById('mobile-sound-btn');
  if (mobileSoundBtn && soundBtn) {
    mobileSoundBtn.addEventListener('click', () => {
      soundBtn.click();
      
      const isMuted = spaceAudio.isMuted;
      const icon = mobileSoundBtn.querySelector('i');
      const label = mobileSoundBtn.querySelector('span');
      
      if (isMuted) {
        icon.className = 'fa-solid fa-volume-xmark';
        label.textContent = 'تشغيل الصوت';
        mobileSoundBtn.classList.remove('active');
      } else {
        icon.className = 'fa-solid fa-volume-high';
        label.textContent = 'كتم الصوت';
        mobileSoundBtn.classList.add('active');
      }
    });
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      if (mobileSoundBtn) {
        const isMuted = spaceAudio.isMuted;
        const icon = mobileSoundBtn.querySelector('i');
        const label = mobileSoundBtn.querySelector('span');
        if (isMuted) {
          icon.className = 'fa-solid fa-volume-xmark';
          label.textContent = 'تشغيل الصوت';
          mobileSoundBtn.classList.remove('active');
        } else {
          icon.className = 'fa-solid fa-volume-high';
          label.textContent = 'كتم الصوت';
          mobileSoundBtn.classList.add('active');
        }
      }
    });
  }

  // 5. Mobile Scale Sync Toggle
  const mobileScaleBtn = document.getElementById('mobile-scale-btn');
  if (mobileScaleBtn && scaleModeBtn) {
    mobileScaleBtn.addEventListener('click', () => {
      scaleModeBtn.click();
      
      mobileScaleBtn.classList.toggle('active', state.isRealisticSizes);
      const label = mobileScaleBtn.querySelector('span');
      label.textContent = state.isRealisticSizes ? 'المقياس التفاعلي' : 'المقياس الواقعي';
    });
  }

  // 6. Mobile Tilt Sync Toggle
  const mobileTiltBtn = document.getElementById('mobile-tilt-btn');
  if (mobileTiltBtn && orbitTiltBtn) {
    mobileTiltBtn.addEventListener('click', () => {
      orbitTiltBtn.click();
      
      mobileTiltBtn.classList.toggle('active', state.isInclinedOrbits);
      const label = mobileTiltBtn.querySelector('span');
      label.textContent = state.isInclinedOrbits ? 'المدارات المائلة' : 'المدارات المستوية';
    });
  }

  // 7. Mobile Speed Slider Sync
  const mobileSpeedSlider = document.getElementById('mobile-speed-slider');
  const mobileSpeedVal = document.getElementById('mobile-speed-val');
  if (mobileSpeedSlider && speedSlider) {
    mobileSpeedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.timeScale = val;
      if (mobileSpeedVal) mobileSpeedVal.textContent = `${val.toFixed(1)}x`;
      
      speedSlider.value = val;
      const speedValText = document.getElementById('time-speed-value');
      if (speedValText) speedValText.textContent = `${val.toFixed(1)}x`;
    });
    
    speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      mobileSpeedSlider.value = val;
      if (mobileSpeedVal) mobileSpeedVal.textContent = `${val.toFixed(1)}x`;
    });
  }

  // 8. Mobile Orbit Slider Sync
  const mobileOrbitSlider = document.getElementById('mobile-orbit-slider');
  const mobileOrbitVal = document.getElementById('mobile-orbit-val');
  if (mobileOrbitSlider && orbitSlider) {
    mobileOrbitSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.orbitScale = val;
      if (mobileOrbitVal) mobileOrbitVal.textContent = `${val.toFixed(2)}x`;
      
      orbitSlider.value = val;
      const orbitValText = document.getElementById('orbit-scale-value');
      if (orbitValText) orbitValText.textContent = `${val.toFixed(2)}x`;
      rebuildOrbitPaths();
    });
    
    orbitSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      mobileOrbitSlider.value = val;
      if (mobileOrbitVal) mobileOrbitVal.textContent = `${val.toFixed(2)}x`;
    });
  }

  // 9. Mobile Details Slide Drawer Toggle Mechanics
  const mobileDrawerToggle = document.getElementById('mobile-drawer-toggle');
  const mobilePlanetHudDrawer = document.getElementById('mobile-planet-hud-drawer');
  if (mobileDrawerToggle && mobilePlanetHudDrawer) {
    mobileDrawerToggle.addEventListener('click', () => {
      spaceAudio.init();
      spaceAudio.playClick();
      
      const isOpen = mobilePlanetHudDrawer.classList.contains('visible');
      if (isOpen) {
        mobilePlanetHudDrawer.classList.remove('visible');
        mobileDrawerToggle.classList.remove('drawer-open');
      } else {
        mobilePlanetHudDrawer.classList.add('visible');
        mobileDrawerToggle.classList.add('drawer-open');
      }
    });
  }

  // 10. Mobile Close Planet HUD buttons
  const mobileCloseHudBtn = document.getElementById('mobile-close-hud-btn');
  if (mobileCloseHudBtn) {
    mobileCloseHudBtn.addEventListener('click', () => {
      resetToOverview();
    });
  }

  const mobileBackToSystemBtn = document.getElementById('mobile-back-to-system-btn');
  if (mobileBackToSystemBtn) {
    mobileBackToSystemBtn.addEventListener('click', () => {
      resetToOverview();
    });
  }

  // 11. Mobile Focus Modes
  const mobileFreezeBtn = document.getElementById('mobile-mode-freeze-btn');
  const mobileRotateBtn = document.getElementById('mobile-mode-rotate-btn');
  if (mobileFreezeBtn && mobileRotateBtn) {
    mobileFreezeBtn.addEventListener('click', () => {
      if (freezeBtn) freezeBtn.click();
      mobileFreezeBtn.classList.add('active');
      mobileRotateBtn.classList.remove('active');
    });
    
    mobileRotateBtn.addEventListener('click', () => {
      if (rotateBtn) rotateBtn.click();
      mobileRotateBtn.classList.add('active');
      mobileFreezeBtn.classList.remove('active');
    });
  }
}

// Entry Point
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    initThree();
    setupEventListeners();
    animate();
  });
} else {
  initThree();
  setupEventListeners();
  animate();
}
