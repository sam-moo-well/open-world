# Hero Asset Audit — Great Sword Pack

Every FBX in `assets/` was parsed directly from the binary Kaydara format
(`tools/fbxinfo.py`, `tools/animinfo.py`). All figures below are measured, not
assumed.

**Verdict: the pack is a coherent, production-usable moveset for a single hero.**
52 files, 51 animation clips plus one skinned character. One skeleton, one
convention set, no mismatches.

---

## 1. The rig — `Maria WProp J J Ong.fbx`

| | |
|---|---|
| FBX version | 7700 (2016+ binary) |
| Skeleton | `mixamorig`, 65 bones, standard Mixamo humanoid |
| Body mesh | `Maria_J_J_Ong` — 8,094 verts / 14,566 tris, skinned to 52 bones |
| Sword mesh | `Maria_sword` — 42 verts / 80 tris, **rigid-bound 100 % to `mixamorig:RightHand`** |
| Material | `MariaMat` (single) |
| Textures | `maria_diffuse.png` 6.2 MB, `maria_specular.png` 4.6 MB, `maria_normal.png` 3.8 MB — all embedded |
| Bind poses | 2 |

Bone chain is the full Mixamo layout: `Hips → Spine/Spine1/Spine2 → Neck → Head`,
both arms with 4-joint fingers (all five digits), both legs through
`ToeBase → Toe_End`.

**The sword is effectively a socket.** It is a separate mesh weighted entirely to
one bone, so swapping weapons is a mesh substitution parented to `RightHand` — no
re-rigging, no attachment-point authoring. That is the single most useful
property in this pack for an open-world game with loot.

## 2. Conventions — uniform across all 52 files

| Property | Value |
|---|---|
| FBX version | 7700 |
| Frame rate | 30 fps (TimeMode 6) |
| `UnitScaleFactor` | 1.0 → **centimetres** |
| Up axis | Y |
| Skeleton hash (Model→Model hierarchy) | identical in all 52 files |

Nothing needs reconciling on import. Note the units: Mixamo centimetres against
a metres-based engine means a **0.01 uniform scale** on import, and the cm/s
figures below become m/s.

## 3. Root motion

There is **no dedicated root bone**. Displacement is baked into
`mixamorig:Hips` translation. This is the one thing that will bite if ignored:
locomotion clips physically move the hips, so either drive the character from
extracted root motion or strip hip XZ and drive movement from code. Mixing the
two double-moves the character.

Measured travel (first→last key ÷ duration):

| Clip | Forward | Lateral |
|---|---:|---:|
| `run_fwd` | +428 cm/s | — |
| `run_back` | −258 cm/s | — |
| `walk_fwd` | +109 cm/s | — |
| `walk_back` | −101 cm/s | — |
| `strafe_run_negx` | — | −309 cm/s |
| `strafe_run_posx` | — | +235 cm/s |
| `strafe_walk_negx` | — | −125 cm/s |
| `strafe_walk_posx` | — | +115 cm/s |
| `jump_running` | +269 cm/s | — |
| `attack_slide` | +164 cm/s | — |
| `attack_jump` | +147 cm/s | — |
| `attack_spin` | +125 cm/s | — |

Everything else is in-place (< 2 cm/s) apart from the transitions noted below.

## 4. What the pack actually covers

Mixamo's `(2)`, `(3)` suffixes are download artefacts, not variant labels. The
measurements reveal what each numbered file really is — that mapping is encoded
in `assets/animations/manifest.json`. Highlights:

**Directional locomotion pairs.** `walk` / `walk (2)` are forward/backward, as
are `run (2)` / `run`. The four `strafe` files are two lateral speeds in two
directions. So the pack ships a complete 8-way movement set at two speeds, all
looping seamlessly (loop seam ≤ 0.8°).

**Mirrored transition pairs.** Several files are exact complements — same
displacement with opposite signs on every axis, which only happens when one clip
runs A→B and the other B→A:

- `crouching` / `crouching (2)` — hips −49 cm / +50 cm → **crouch down / stand up**
- `blocking` / `blocking (3)` — hips −23 cm / +23 cm → **guard enter / exit**
- `crouching (4)` / `crouching (6)` — ±3.2 / ±2.3 / ±8.0 cm, yaw ∓20.9°
- `draw a great sword 1` / `2` — → **draw / sheathe**

That gives proper enter → hold → exit structure for both crouch and block,
with `crouching (3)`/`(5)` and `blocking (2)` as the seamless hold loops.

**Loop quality.** Measured as max first-vs-last-key rotation delta across nine
key bones. All locomotion, the primary idle, the long idle, both crouch idles and
the block hold read ≤ 0.8° — clean loops needing no cleanup. Idle variants
`(2)`/`(3)`/`(4)` seam at 1.1° / 2.5° / 4.2°; the last wants a short blend or a
trimmed tail.

**Attack coverage.** Five in-place strikes (`attack`, three `slash`, plus two
kicks), three committed/mobile attacks (spin, jump, slide) and one lunge. Every
in-place attack returns to its own start pose, so they blend back into idle
without a settle clip.

**Reactions.** Five distinct in-place hit flinches (0.67–1.27 s) and two deaths
(hips drop 80–87 cm, one falling back, one falling forward with 126 cm of
travel).

**Magic.** A 4.8 s channel, a 1.1 s quick cast and a 3.5 s power-up — enough for
a full ability with wind-up, and unexpected in a sword pack.

### Category totals

| Category | Clips |
|---|---:|
| Idle | 5 |
| Locomotion | 8 |
| Turn | 4 |
| Crouch | 6 |
| Jump | 2 |
| Attack | 11 |
| Defend | 3 |
| Hit reaction | 5 |
| Death | 2 |
| Equip | 2 |
| Magic | 3 |
| **Total** | **51** |

## 5. Gaps worth knowing before design locks

- **No hurt/low-health locomotion** — no limping or wounded walk.
- **No landing clip.** Both jumps exist, but nothing catches the landing; you'll
  need a blend or a synthesized recovery pose.
- **No dodge/roll.** `attack_slide` is the nearest thing, and it commits to an
  attack.
- **No sprint above `run_fwd`**, and no start/stop accelerations — transitions
  into and out of locomotion have to be blended.
- **Left/right on the strafes is unconfirmed.** The sign of the X displacement
  is measured; which one reads as "left" on screen needs one visual pass.
- **`slash (2)` is 3.5 s and travels 88 cm/s** — long enough to be a multi-hit
  combo rather than a single swing. Worth splitting into separate attacks.
- **Turn clips move.** `180 turn (2)` drifts 24 cm; `turn`/`turn (2)` drift
  10–17 cm. Not in-place pivots.
- **One character, one material.** Anything beyond this hero — enemies, NPCs —
  is not in this pack. Since the skeleton is stock Mixamo, any other Mixamo
  humanoid retargets onto it for free.

## 6. Repository notes

Assets are committed as plain binaries totalling 35 MB (the rig alone is
15.6 MB, almost entirely the three embedded PNGs). That is fine for Git today,
but if texture iteration starts, move `assets/**/*.fbx` to Git LFS before the
history grows.

`tools/fbxinfo.py` and `tools/animinfo.py` are dependency-free FBX readers —
rerun them against any new pack to regenerate these numbers.
