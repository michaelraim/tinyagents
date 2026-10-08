import { useEffect, useState } from 'react';
import { AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer, SRGBColorSpace } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterVariant } from './assets';

/**
 * Head-and-shoulders portraits of each Kenney character, rendered once offscreen and
 * cached as data URLs for the HUD (alert cards, the "need you" pill, the roster).
 */
const cache = new Map<string, Promise<string>>();
let renderer: WebGLRenderer | null = null;

function render(variant: CharacterVariant): Promise<string> {
  return new Promise(resolve => {
    new GLTFLoader().load(`/assets/kenney/characters/character-${variant}.glb`, gltf => {
      try {
        renderer ??= new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(128, 128);
        renderer.outputColorSpace = SRGBColorSpace;
        const scene = new Scene();
        scene.add(new AmbientLight('#ffffff', 1.4));
        const key = new DirectionalLight('#ffffff', 2.2); key.position.set(1, 2, 3); scene.add(key);
        const model = gltf.scene;
        scene.add(model);
        const box = new Box3().setFromObject(model);
        const size = box.getSize(new Vector3());
        // Frame the head: the top 55% of the figure.
        const focus = new Vector3(0, box.max.y - size.y * 0.3, 0);
        const camera = new PerspectiveCamera(30, 1, 0.01, 10);
        camera.position.set(0.08, focus.y + 0.02, size.y * 1.45);
        camera.lookAt(focus);
        renderer.render(scene, camera);
        resolve(renderer.domElement.toDataURL('image/png'));
      } catch { resolve(''); }
    }, undefined, () => resolve(''));
  });
}

export function portrait(variant: CharacterVariant) {
  let p = cache.get(variant);
  if (!p) { p = render(variant); cache.set(variant, p); }
  return p;
}

export function usePortrait(variant?: CharacterVariant) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!variant) return;
    let live = true;
    void portrait(variant).then(u => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [variant]);
  return url;
}
