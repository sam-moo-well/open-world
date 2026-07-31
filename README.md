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

Click to lock the pointer and take control. On a phone or tablet the touch
layout appears automatically — force it on a desktop browser with `?touch=1`.

### Desktop

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

### Mobile

Thirteen desktop inputs collapse to five touch controls. The principle is one
control per *intent*, with game state disambiguating the rest — which the
controller already did for running, airborne and crouched attacks.

```
+----------------------+----------------------+
|                      |               (✦)    |   ✦  ability
|   floating stick     |        (🛡)           |   🛡  guard
| (⌄)                  |    (⤒)     ⚔        |   ⤒  jump
+----------------------+----------------------+   ⌄  crouch
   move / walk-run          camera drag
```

| Touch | Action |
|---|---|
| **Stick** | Move — push halfway to walk, fully to run (analog, so Shift disappears) |
| **Drag right side** | Orbit camera; pinch to zoom |
| **⚔ tap** | Attack combo — repeat-tap chains it; running, airborne and crouched variants are contextual |
| **⚔ hold** | Spin attack |
| **🛡 tap / hold** | Guard — tap toggles it up and down, or hold and release |
| **⤒** | Jump |
| **⌄** | Crouch |
| **✦ tap / hold** | Power up / long channel |
| **Tap anywhere** | Respawn after death |

Three inputs are gone entirely. Sheathing has no button: attacking auto-draws,
and the sword now puts itself away a few seconds after combat ends (a manual
**Q** always wins until the next fight). Kick and the debug hit key are cut.

Guard is a *toggle* on touch because two thumbs cannot hold a button, steer and
orbit at once — a held guard would cost you the camera. Sliding a thumb off any
button cancels the press, so a camera drag that grazes a button does nothing.

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
  touch.js       mobile controls, synthesized into the same input signals
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
- **Touch**: `touch.js` only *synthesizes* signals `input.js` already
  exposes — key edges, mouse buttons, look deltas — so the controller has
  no touch-specific branches. Movement became analog for the stick's sake,
  and the keyboard fakes a half-pushed stick when Shift is held.

The world is a 620 m square of smooth hills (steepest grade stays
runnable), with lakes in the valleys, sandy shorelines, forest patches and
scattered rocks — all seeded, all reproducible.

## Roadmap

- [x] Hero with full moveset on procedural terrain
- [x] Mobile touch controls
- [ ] Enemies ("fighting off the monsters") — any Mixamo humanoid retargets
      onto this skeleton for free
- [ ] Points of interest
- [ ] Power-ups & collectibles
- [ ] Landing/dodge animations (not in the pack — see audit gaps). A dodge
      matters most on mobile, where it belongs on a **tap** of the guard
      button; the pack has no roll clip, so it needs new animation.
- [ ] Lock-on, and a camera that drifts to follow travel — the two biggest
      remaining wins for touch, best designed in before enemies land.

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
