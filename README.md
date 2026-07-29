# Open World — Maria of the Great Sword

A browser-based open-world action game in the spirit of *Tears of the
Kingdom*: a third-person hero exploring rolling hills and valleys, with a
full greatsword moveset. Built on Three.js, no engine.

![status](https://img.shields.io/badge/status-hero%20sandbox-ffd97a)

## Play it

```bash
npm install
npm run dev        # then open the printed URL
```

Click to lock the pointer and take control.

| Input | Action |
|---|---|
| **WASD** | Move (camera-relative; hold **Shift** to walk) |
| **Mouse / Wheel** | Orbit camera / zoom |
| **Space** | Jump (standing or running) |
| **C** | Crouch toggle (attack from crouch = slide attack) |
| **LMB** | Attack — press again mid-swing to chain the 3-hit combo; running attack lunges; airborne attack dives |
| **V** | High spin attack |
| **RMB (hold)** | Block — proper enter / hold / exit |
| **F** | Kick (alternates two kicks) |
| **Q** | Sheathe / draw — the sword physically moves to her back and returns; attacking while sheathed auto-draws |
| **E** | Power up |
| **R** / **G** | Quick cast / long channel |
| **H** | Take a hit (test) — health drops, random hit reaction, death at zero |
| **Enter** | Respawn after death |

## How it works

```
src/
  main.js        scene, sky/sun/fog, lighting, HUD, game loop
  terrain.js     seeded-simplex heightfield (analytic heightAt), vertex-
                 coloured hills, water, instanced trees & rocks
  character.js   FBX loading, root-motion strip, sword hand/back socket
  controller.js  hero state machine + physics
  camera.js      terrain-aware third-person orbit camera
  input.js       keyboard/mouse with per-frame edges + test hooks
```

Design decisions rooted in the asset audit (`docs/ANIMATION_AUDIT.md`):

- **Root motion**: the Mixamo clips bake displacement into the Hips bone
  (no root bone). Every clip gets its Hips XZ pinned at load
  (`character.js`), and the controller drives movement using the *measured*
  clip velocities from `assets/animations/manifest.json` (run 4.3 m/s,
  attack lunges 0.6–1.6 m/s), so feet and ground stay in agreement.
- **Sword socket**: the sword mesh is rigid-bound 100 % to `RightHand`, so
  it is converted at load to a plain mesh parented to the bone. Sheathing
  re-parents it to `Spine2` with a matrix computed from the bind pose —
  hilt over the right shoulder, blade across the back.
- **Terrain**: one analytic `heightAt(x, z)` function feeds the mesh, the
  character grounding, the camera collision and the prop scatter, so
  nothing ever disagrees about where the ground is.

The world is a 620 m square of smooth hills (steepest grade stays
runnable), with lakes in the valleys, sandy shorelines, forest patches and
scattered rocks — all seeded, all reproducible.

## Roadmap

- [x] Hero with full moveset on procedural terrain
- [ ] Enemies ("fighting off the monsters") — any Mixamo humanoid retargets
      onto this skeleton for free
- [ ] Points of interest
- [ ] Power-ups & collectibles
- [ ] Landing/dodge animations (not in the pack — see audit gaps)

## Assets

`assets/` holds the Mixamo Great Sword Pack: the Maria rig (8k verts, three
embedded textures) and 51 animation clips, catalogued with measured
durations, loop seams and root velocities in `assets/animations/manifest.json`.
`tools/` contains the dependency-free FBX readers used to build that
catalogue.

One asset note: `great sword jump attack.fbx` shipped with a nonstandard
binary footer (20 pad bytes + trailing newline) that crashed Three.js's
`FBXLoader`; the footer was rewritten to spec in-place. The animation data
is untouched.
