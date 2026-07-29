// Third-person orbit camera: mouse orbits, wheel zooms, terrain-aware so it
// never clips through hills. Movement input is taken relative to its yaw.
import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, heightAt) {
    this.camera = camera;
    this.heightAt = heightAt;
    this.yaw = Math.PI;          // behind the hero, looking -Z
    this.pitch = 0.32;
    this.dist = 5.2;
    this.smoothPos = new THREE.Vector3();
    this.initialised = false;
  }

  handleInput(input) {
    this.yaw -= input.look.dx * 0.0026;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.dy * 0.0022, -0.15, 1.25);
    this.dist = THREE.MathUtils.clamp(this.dist + input.wheel * 0.6, 2.6, 10);
  }

  // Unit XZ forward vector (from camera towards the hero).
  forward() {
    return new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
  }

  update(dt, targetPos) {
    const target = targetPos.clone().add(new THREE.Vector3(0, 1.5, 0));

    let dist = this.dist;
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    // Pull the camera in until the whole boom clears the terrain.
    for (let iter = 0; iter < 12; iter++) {
      let blocked = false;
      for (let i = 1; i <= 8; i++) {
        const p = target.clone().addScaledVector(dir, (dist * i) / 8);
        if (p.y < this.heightAt(p.x, p.z) + 0.35) { blocked = true; break; }
      }
      if (!blocked) break;
      dist *= 0.86;
    }

    const desired = target.clone().addScaledVector(dir, dist);
    desired.y = Math.max(desired.y, this.heightAt(desired.x, desired.z) + 0.35);

    if (!this.initialised) { this.smoothPos.copy(desired); this.initialised = true; }
    const k = 1 - Math.exp(-dt * 10);
    this.smoothPos.lerp(desired, k);

    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(target);
  }
}
