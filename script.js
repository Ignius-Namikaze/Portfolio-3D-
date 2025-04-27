import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // Optional for debugging

// --- Configuration ---
const MODEL_PATH = 'model/your-car-model.glb'; // !!! UPDATE THIS PATH !!!
const INITIAL_MODEL_ROTATION = { x: 0, y: Math.PI * 0.1, z: 0 };
const ROTATION_SPEED_FACTOR = Math.PI * 1.8; // How much scroll affects rotation (radians)
const MODEL_SCALE = 3; // <<--- ADJUST MODEL SCALE HERE ---<<<
const CAMERA_POSITION = { x: 0, y: 1.5, z: 7 }; // <<--- ADJUST CAMERA Z FOR SCALE ---<<<
const BACKGROUND_COLOR = 0x0f0f0f; // Match CSS background
const AMBIENT_LIGHT_COLOR = 0xffffff;
const AMBIENT_LIGHT_INTENSITY = 0.6;
const HEMISPHERE_LIGHT_SKY = 0xcceeff;
const HEMISPHERE_LIGHT_GROUND = 0x444444;
const HEMISPHERE_LIGHT_INTENSITY = 0.8;
const DIRECTIONAL_LIGHT_COLOR = 0xffffff;
const DIRECTIONAL_LIGHT_INTENSITY = 1.2;
const DIRECTIONAL_LIGHT_POSITION = { x: 8, y: 12, z: 10 };
const PARALLAX_FACTOR_X = 0.15; // How much mouse Y affects model X rotation
const PARALLAX_FACTOR_Y = 0.25; // How much mouse X affects model Y rotation offset
const LERP_FACTOR = 0.08; // Smoothness of mouse/scroll interpolation (lower = smoother)

// --- Global Variables ---
let scene, camera, renderer, carModel, controls;
let mouseX = 0, mouseY = 0;
let targetRotationX = INITIAL_MODEL_ROTATION.x;
let targetRotationY = INITIAL_MODEL_ROTATION.y;
let isReducedMotion = window.matchMedia(`(prefers-reduced-motion: reduce)`).matches === true;


const canvas = document.getElementById('bg-canvas');
if (!canvas) {
    console.error("Canvas element #bg-canvas not found!");
    // Hide loader if canvas isn't found
    const loaderElement = document.getElementById('loader');
    if (loaderElement) {
        loaderElement.style.display = 'none';
    }
} else {
    init();
}

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(BACKGROUND_COLOR, 10, 25); // Optional fog

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    renderer.setClearColor(BACKGROUND_COLOR, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Lighting
    setupLighting();

    // Model Loading with Manager
    loadModel();

    // Event Listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll);

    if (!isReducedMotion) { // Only add mouse move if motion is not reduced
        window.addEventListener('mousemove', handleMouseMove);
        document.body.addEventListener('mouseout', handleMouseOut);
    } else {
        console.log("Reduced motion preferred, disabling mouse parallax.");
    }


    // Helpers & Observers
    setupFadeInObserver();
    // setupOrbitControls(); // Optional: Uncomment for debugging

    // Start Animation Loop
    animate();
}

// --- Lighting Setup ---
function setupLighting() {
    const ambientLight = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(
        HEMISPHERE_LIGHT_SKY, HEMISPHERE_LIGHT_GROUND, HEMISPHERE_LIGHT_INTENSITY
    );
    scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(DIRECTIONAL_LIGHT_COLOR, DIRECTIONAL_LIGHT_INTENSITY);
    directionalLight.position.set(DIRECTIONAL_LIGHT_POSITION.x, DIRECTIONAL_LIGHT_POSITION.y, DIRECTIONAL_LIGHT_POSITION.z);
    directionalLight.castShadow = true; // Performance intensive
    scene.add(directionalLight);
}

// --- Model Loading ---
function loadModel() {
    const loadingManager = new THREE.LoadingManager();
    const loaderElement = document.getElementById('loader');
    const loaderText = document.querySelector('#loader p');

    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        const progress = Math.round((itemsLoaded / itemsTotal) * 100);
        if (loaderText) loaderText.textContent = `Loading Model... ${progress}%`;
        // console.log(`Loading file: ${url} (${itemsLoaded}/${itemsTotal})`);
    };

    loadingManager.onLoad = () => {
        console.log('Loading complete!');
        if (loaderElement) {
            loaderElement.style.opacity = '0'; // Start fade out
            setTimeout(() => {
                loaderElement.style.display = 'none'; // Remove after transition
            }, 500); // Match CSS transition duration
        }
        // Ensure initial render after model is ready
        render();
    };

    loadingManager.onError = (url) => {
        console.error('There was an error loading ' + url);
        if (loaderText) {
            loaderText.textContent = 'Error loading 3D model.';
            loaderText.style.color = 'red';
        }
        // Consider leaving the spinner or replacing it with an error icon
        const spinner = document.querySelector('#loader .spinner');
        if(spinner) spinner.style.display = 'none';
    };

    const loader = new GLTFLoader(loadingManager);
    // Optional: Add DracoLoader if your model is Draco compressed
    // const dracoLoader = new DRACOLoader();
    // dracoLoader.setDecoderPath('/examples/jsm/libs/draco/gltf/'); // Adjust path if needed
    // loader.setDRACOLoader(dracoLoader);

    loader.load(
        MODEL_PATH,
        (gltf) => {
            carModel = gltf.scene;
            console.log("Model processed");

            // Optional: Adjust material properties
            carModel.traverse((child) => {
                 if (child.isMesh && child.material) {
                     if(child.material.metalness !== undefined) child.material.metalness = 0.4;
                     if(child.material.roughness !== undefined) child.material.roughness = 0.5;
                 }
             });

            // Center and Scale
            const box = new THREE.Box3().setFromObject(carModel);
            const center = box.getCenter(new THREE.Vector3());
            carModel.position.sub(center);
            carModel.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

            // Set initial rotation and target
            carModel.rotation.set(INITIAL_MODEL_ROTATION.x, INITIAL_MODEL_ROTATION.y, INITIAL_MODEL_ROTATION.z);
            targetRotationX = carModel.rotation.x;
            targetRotationY = carModel.rotation.y;

            scene.add(carModel);
            // onLoad manager handles hiding loader now
        },
        undefined, // onProgress handled by manager
        (error) => {
            // onError handled by manager, log here just in case
            console.error('An error happened loading the model:', error);
        }
    );
}

// --- Event Handlers ---
function handleScroll() {
    if (!carModel) return;

    // Calculate base rotation from scroll
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    const currentScroll = window.scrollY;
    const scrollFraction = scrollableHeight > 0 ? Math.max(0, Math.min(1, currentScroll / scrollableHeight)) : 0;
    const baseRotationY = INITIAL_MODEL_ROTATION.y + scrollFraction * ROTATION_SPEED_FACTOR;

    // Update target based on scroll + last known mouse position
    // (If reduced motion, mouseX is 0, so this just uses baseRotationY)
    targetRotationY = baseRotationY + mouseX * PARALLAX_FACTOR_Y;

    // No direct rotation setting here, animate() handles interpolation
    // No render call here, animate() handles it
}

function handleMouseMove(event) {
    if (!carModel || isReducedMotion) return; // Ignore if reduced motion

    // Normalize mouse position (-0.5 to 0.5 is often easier, but -1 to 1 works)
     mouseX = (event.clientX / window.innerWidth) * 2 - 1;
     mouseY = -(event.clientY / window.innerHeight) * 2 + 1;

    // Calculate target rotation including mouse influence
    // Re-calculate base scroll rotation to ensure it's current
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    const currentScroll = window.scrollY;
    const scrollFraction = scrollableHeight > 0 ? Math.max(0, Math.min(1, currentScroll / scrollableHeight)) : 0;
    const baseRotationY = INITIAL_MODEL_ROTATION.y + scrollFraction * ROTATION_SPEED_FACTOR;

    targetRotationY = baseRotationY + mouseX * PARALLAX_FACTOR_Y;
    targetRotationX = INITIAL_MODEL_ROTATION.x + mouseY * PARALLAX_FACTOR_X; // Mouse Y affects X rotation (tilt)
}

function handleMouseOut(event) {
    // Check if the mouse is truly leaving the window
    if (!event.relatedTarget || event.relatedTarget.nodeName === 'HTML') {
        if (!isReducedMotion) { // Reset only if parallax was active
            mouseX = 0; // Reset mouse influence factors
            mouseY = 0;

            // Recalculate target based only on current scroll position
            const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
            const currentScroll = window.scrollY;
            const scrollFraction = scrollableHeight > 0 ? Math.max(0, Math.min(1, currentScroll / scrollableHeight)) : 0;
            const baseRotationY = INITIAL_MODEL_ROTATION.y + scrollFraction * ROTATION_SPEED_FACTOR;

            targetRotationY = baseRotationY;
            targetRotationX = INITIAL_MODEL_ROTATION.x; // Reset tilt
         }
    }
}


function handleResize() {
    // Update camera
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    // Update renderer
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Re-apply pixel ratio limit

    render(); // Re-render immediately on resize
}

// --- Fade-in Section Logic ---
function setupFadeInObserver() {
    const sections = document.querySelectorAll('.fade-in-section:not(#hero)'); // Exclude hero initially
    const options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15 // Adjust threshold as needed
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                 // Optional: Unobserve after first time for performance
                  observer.unobserve(entry.target);
            } else {
                 // Optional: Remove class to fade out when scrolling up
                  entry.target.classList.remove('visible');
            }
        });
    }, options);

    sections.forEach(section => {
        observer.observe(section);
    });
     // Ensure hero starts visible (it has 'visible' class in HTML)
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate); // Request next frame

    if (carModel) {
        // Interpolate current rotation towards target rotation for smoothness
        const currentLerpFactor = isReducedMotion ? 1 : LERP_FACTOR; // Use 1 (instant) if reduced motion

        carModel.rotation.y += (targetRotationY - carModel.rotation.y) * currentLerpFactor;
        carModel.rotation.x += (targetRotationX - carModel.rotation.x) * currentLerpFactor;
    }

    if (controls) controls.update(); // If using OrbitControls

    render(); // Render the scene in each frame
}

// --- Render Function ---
function render() {
    renderer.render(scene, camera);
}

// --- Optional: Orbit Controls Setup ---
function setupOrbitControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 3;
    controls.maxDistance = 15;
    controls.target.set(0, 0.5, 0); // Adjust target based on model center
    // No need for controls.addEventListener('change', render) if animate loop is running
}