import * as THREE from 'three';
import { blockDef } from '../../world/blocks';
import type { VoxelOp } from '../../world/ops';

/**
 * A small auto-rotating 3D view of voxel ops, drawn with one InstancedMesh.
 * Used on the Learn page so every lesson has a 3D result even outside the world.
 */
export class VoxelPreview {
  readonly el: HTMLDivElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private mesh: THREE.InstancedMesh | null = null;
  private raf = 0;
  private angle = 0.7;
  private radius = 40;
  private visible = false;
  private io: IntersectionObserver;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'voxel-preview';
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.el.append(this.renderer.domElement);
    } catch {
      this.el.textContent = '3D preview needs WebGL.';
    }
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(20, 40, 10);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(25, 0.4, 25), new THREE.MeshLambertMaterial({ color: 0x2a2f4a }));
    floor.position.y = -0.2;
    this.scene.add(floor);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.loop();
    });
    this.io.observe(this.el);
  }

  show(ops: VoxelOp[]) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    const n = ops.length;
    if (!n) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.96, 0.96), new THREE.MeshLambertMaterial(), n);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let maxY = 0;
    ops.forEach((o, i) => {
      m.makeTranslation(o.x, o.y + 0.5, o.z);
      mesh.setMatrixAt(i, m);
      c.setHex(blockDef(o.b).color);
      mesh.setColorAt(i, c);
      maxY = Math.max(maxY, o.y);
    });
    this.mesh = mesh;
    this.scene.add(mesh);
    this.radius = 30 + maxY;
    this.camera.lookAt(0, maxY / 3, 0);
    this.el.classList.add('has-data');
    this.loop();
  }

  private loop = () => {
    cancelAnimationFrame(this.raf);
    if (!this.renderer || !this.visible || !this.el.isConnected) return;
    const w = this.el.clientWidth, hgt = this.el.clientHeight;
    if (this.renderer.domElement.width !== Math.floor(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, hgt, false);
      this.camera.aspect = w / Math.max(1, hgt);
      this.camera.updateProjectionMatrix();
    }
    this.angle += 0.004;
    this.camera.position.set(Math.cos(this.angle) * this.radius, this.radius * 0.7, Math.sin(this.angle) * this.radius);
    this.camera.lookAt(0, 3, 0);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.renderer?.dispose();
  }
}
