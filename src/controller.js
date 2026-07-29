// Hero state machine: locomotion, crouch, jump, three-hit combo, special
// attacks, block enter/hold/exit, hit reactions, death, draw/sheathe and
// spellcasting — every clip family in the pack.
//
// Root motion was stripped from the clips (see character.js), so this
// controller owns all displacement. Speeds and attack advance velocities
// come from the measured values in assets/animations/manifest.json.
import * as THREE from 'three';

const GRAVITY = 20;
const JUMP_VELOCITY = 7.2;
const RUN_SPEED = 4.3;          // matches run_fwd's measured 428 cm/s
const WALK_SPEED = 1.4;         // walk_fwd measured 109 cm/s -> ts ~1.28
const CROUCH_SPEED = 1.2;
const TURN_RATE = 11;           // rad/s exponential facing blend

// Forward advance (m/s) applied while these one-shots play, taken from the
// clips' measured baked root velocities.
const ATTACK_ADVANCE = {
  slash_lunge: 0.63,
  attack_spin: 1.25,
  attack_slide: 1.64,
  attack_jump: 1.47,
};

const COMBO = ['slash_1', 'slash_2', 'slash_3'];
const HITS = ['hit_1', 'hit_2', 'hit_3', 'hit_4', 'hit_5'];

export class HeroController {
  constructor(hero, heightAt, input, orbitCam, hud) {
    this.hero = hero;
    this.heightAt = heightAt;
    this.input = input;
    this.cam = orbitCam;
    this.hud = hud;

    this.pos = hero.root.position;
    this.pos.set(0, heightAt(0, 0), 0);
    this.spawn = this.pos.clone();
    this.facing = 0;             // yaw, radians
    this.vy = 0;
    this.grounded = true;

    this.health = 100;
    this.dead = false;
    this.sheathed = false;       // starts armed
    this.crouched = false;
    this.blocking = false;

    this.busy = null;            // name of the locking one-shot, if any
    this.busyAction = null;
    this.busyDone = null;
    this.queuedAttack = false;
    this.comboIndex = -1;
    this.kickToggle = false;
    this.deathToggle = false;

    this.pendingMount = null;    // {at, fn} scheduled against busyAction.time
    this.current = null;         // current looping AnimationAction
    this.currentName = '';
    this.idleTime = 0;
    this.idleVariant = null;     // action currently playing an idle flourish
    this.airClip = null;

    hero.mixer.addEventListener('finished', (e) => this._onFinished(e.action));
    this._play('idle');
  }

  // ---------------------------------------------------------------- anims

  _play(name, { fade = 0.2, once = false, timeScale = 1 } = {}) {
    const action = this.hero.actions[name];
    if (!action) return null;
    if (this.current === action && !once) { action.timeScale = timeScale; return action; }
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.timeScale = timeScale;
    if (this.current && this.current !== action) this.current.fadeOut(fade);
    action.fadeIn(fade).play();
    this.current = action;
    this.currentName = name;
    return action;
  }

  _oneShot(name, { fade = 0.15, timeScale = 1, onDone = null } = {}) {
    this.busy = name;
    this.busyDone = onDone;
    this.idleVariant = null;
    this.busyAction = this._play(name, { fade, once: true, timeScale });
  }

  _onFinished(action) {
    if (action === this.busyAction) {
      const done = this.busyDone;
      this.busy = null;
      this.busyAction = null;
      this.busyDone = null;
      if (done) done();
    } else if (action === this.idleVariant) {
      this.idleVariant = null;
      this.idleTime = 0;
    }
  }

  _cancelBusy() {
    if (this.pendingMount) { this.pendingMount.fn(); this.pendingMount = null; }
    this.busy = null;
    this.busyAction = null;
    this.busyDone = null;
    this.queuedAttack = false;
    this.comboIndex = -1;
  }

  // -------------------------------------------------------------- actions

  _startAttack() {
    if (this.sheathed) {         // TotK-style: attacking auto-draws first
      this.queuedAttack = true;
      this._startDraw();
      return;
    }
    if (this.crouched) {         // rise out of crouch into a slide attack
      this.crouched = false;
      this.comboIndex = -1;
      this._oneShot('attack_slide', { fade: 0.1 });
      return;
    }
    const moving = this._moveInput().lengthSq() > 0 && this.currentName === 'run_fwd';
    this.comboIndex = 0;
    this._oneShot(moving ? 'slash_lunge' : COMBO[0], {
      fade: 0.12,
      onDone: () => this._attackChain(),
    });
  }

  _attackChain() {
    if (this.queuedAttack && this.comboIndex >= 0 && this.comboIndex < COMBO.length - 1) {
      this.queuedAttack = false;
      this.comboIndex += 1;
      this._oneShot(COMBO[this.comboIndex], { fade: 0.1, onDone: () => this._attackChain() });
    } else {
      this.queuedAttack = false;
      this.comboIndex = -1;
    }
  }

  _startDraw() {
    this._oneShot('sword_draw', {
      onDone: () => {
        if (this.queuedAttack) { this.queuedAttack = false; this._startAttack(); }
      },
    });
    this.sheathed = false;
    // Sword hops from back to hand partway through the reach-over,
    // timed against the clip itself so it stays in sync at any frame rate.
    this.pendingMount = { at: 0.25, fn: () => this.hero.sword?.mountHand() };
  }

  _startSheathe() {
    this._oneShot('sword_sheathe');
    this.sheathed = true;
    this.pendingMount = { at: 0.45, fn: () => this.hero.sword?.mountBack() };
  }

  _endBlock() {
    this._oneShot('block_exit', { onDone: () => { this.blocking = false; } });
  }

  takeHit(amount = 12) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hud.setHealth(this.health);
    if (this.health <= 0) { this.die(); return; }
    this._cancelBusy();
    this.blocking = false;
    const clip = HITS[Math.floor(Math.random() * HITS.length)];
    this._oneShot(clip, { fade: 0.08 });
  }

  die() {
    this.dead = true;
    this._cancelBusy();
    this.blocking = false;
    this.crouched = false;
    this.deathToggle = !this.deathToggle;
    this._oneShot(this.deathToggle ? 'death_1' : 'death_2', { fade: 0.1 });
    this.hud.showMessage('YOU HAVE FALLEN', 'press Enter to rise again');
  }

  respawn() {
    this.dead = false;
    this.health = 100;
    this.hud.setHealth(100);
    this.hud.hideMessage();
    this._cancelBusy();
    this.pos.copy(this.spawn);
    this.vy = 0;
    this.facing = 0;
    if (this.sheathed) { this.sheathed = false; this.hero.sword?.mountHand(); }
    this._play('idle', { fade: 0.05 });
  }

  // --------------------------------------------------------------- update

  _moveInput() {
    const v = new THREE.Vector2(
      (this.input.down('KeyD') ? 1 : 0) - (this.input.down('KeyA') ? 1 : 0),
      (this.input.down('KeyS') ? 1 : 0) - (this.input.down('KeyW') ? 1 : 0),
    );
    if (v.lengthSq() === 0) return v;
    v.normalize();
    // Rotate into camera space: camera forward is -Z of the orbit yaw.
    const f = this.cam.forward();
    return new THREE.Vector2(
      v.x * -f.y + -v.y * f.x,
      v.x * f.x + -v.y * f.y,
    );
  }

  update(dt) {
    const input = this.input;

    if (this.dead) {
      if (input.pressed('Enter')) this.respawn();
      this.hero.mixer.update(dt);
      return;
    }

    if (input.pressed('KeyH')) this.takeHit(12);

    // Clip-time-scheduled sword re-mount during draw/sheathe.
    if (this.pendingMount && this.busyAction && this.busyAction.time >= this.pendingMount.at) {
      this.pendingMount.fn();
      this.pendingMount = null;
    }

    const idle = !this.busy && !this.blocking;

    // --- one-shot triggers (ground only, not mid-action) ---
    if (idle && this.grounded) {
      if (input.pressed('KeyQ')) {
        this.crouched = false;
        this.sheathed ? this._startDraw() : this._startSheathe();
      } else if (input.pressed('KeyE') && !this.crouched) {
        this._oneShot('power_up');
      } else if (input.pressed('KeyR') && !this.crouched) {
        this._oneShot('cast_quick');
      } else if (input.pressed('KeyG') && !this.crouched) {
        this._oneShot('cast_long');
      } else if (input.pressed('KeyF') && !this.crouched) {
        this.kickToggle = !this.kickToggle;
        this._oneShot(this.kickToggle ? 'kick_1' : 'kick_2');
      } else if (input.pressed('KeyV') && !this.crouched && !this.sheathed) {
        this._oneShot('attack_spin');
      } else if (input.pressed('KeyC')) {
        this.crouched = !this.crouched;
        this._oneShot(this.crouched ? 'crouch_enter' : 'crouch_exit', { fade: 0.12 });
      }
    }

    // --- attacks ---
    if (input.mouseEdges.left) {
      if (!this.grounded && !this.busy) {
        this._oneShot('attack_jump', { fade: 0.1 });
      } else if (this.busy && this.comboIndex >= 0) {
        this.queuedAttack = true;    // chain the combo
      } else if (idle && this.grounded) {
        this._startAttack();
      }
    }

    // --- block (hold RMB) ---
    if (input.mouseEdges.right && !this.busy && !this.blocking
        && this.grounded && !this.crouched && !this.sheathed) {
      this.blocking = true;
      this._oneShot('block_enter', {
        onDone: () => { if (!this.input.mouse.right) this._endBlock(); },
      });
    }
    if (this.blocking && !this.busy) {
      if (this.input.mouse.right) this._play('block_hold', { fade: 0.15 });
      else this._endBlock();
    }

    // --- jump ---
    if (input.pressed('Space') && this.grounded && !this.busy && !this.blocking) {
      if (this.crouched) {
        this.crouched = false;
        this._oneShot('crouch_exit', { fade: 0.12 });
      } else {
        this.vy = JUMP_VELOCITY;
        this.grounded = false;
        const moving = this._moveInput().lengthSq() > 0;
        this.airClip = moving ? 'jump_running' : 'jump_standing';
        this._play(this.airClip, { fade: 0.08, once: true });
      }
    }

    // --- movement ---
    const move = this._moveInput();
    const canSteer = !this.blocking && (!this.busy || !this.grounded);
    let speed = 0;
    if (canSteer && move.lengthSq() > 0) {
      const target = Math.atan2(move.x, move.y);
      let d = target - this.facing;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.facing += d * Math.min(1, TURN_RATE * dt);

      speed = this.crouched ? CROUCH_SPEED
        : input.down('ShiftLeft') || input.down('ShiftRight') ? WALK_SPEED
        : RUN_SPEED;
      if (!this.grounded) speed *= 0.75;   // gentler air control
      if (this.busy) speed = 0;
      this.pos.x += move.x * speed * dt;
      this.pos.z += move.y * speed * dt;
    }

    // Scripted forward advance during committed attacks.
    if (this.busy && ATTACK_ADVANCE[this.busy] && this.grounded) {
      const adv = ATTACK_ADVANCE[this.busy];
      this.pos.x += Math.sin(this.facing) * adv * dt;
      this.pos.z += Math.cos(this.facing) * adv * dt;
    }

    // --- vertical physics / grounding ---
    const ground = this.heightAt(this.pos.x, this.pos.z);
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) {
      const wasAirborne = !this.grounded;
      this.pos.y = ground;
      this.vy = 0;
      this.grounded = true;
      if (wasAirborne && !this.busy) this._play(this._locomotionClip(speed), { fade: 0.12 });
    } else if (this.pos.y > ground + 0.05) {
      this.grounded = false;
    }

    this.hero.root.rotation.y = this.facing;

    // --- base animation selection (nothing special going on) ---
    if (!this.busy && !this.blocking && this.grounded) {
      const name = this._locomotionClip(speed);
      if (name === 'idle') {
        this.idleTime += dt;
        if (!this.idleVariant && this.idleTime > 11) {
          const pick = ['idle_var_a', 'idle_var_b', 'idle_long'][Math.floor(Math.random() * 3)];
          this.idleVariant = this._play(pick, { fade: 0.5, once: true });
        }
        if (!this.idleVariant) this._play('idle');
      } else {
        this.idleTime = 0;
        this.idleVariant = null;
        const ts = name === 'walk_fwd' ? WALK_SPEED / 1.09 : 1;
        this._play(name, { fade: 0.18, timeScale: ts });
      }
    }

    this.hero.mixer.update(dt);
  }

  _locomotionClip(speed) {
    if (this.crouched) return speed > 0.01 ? 'crouch_idle' : 'crouch_idle';
    if (speed > WALK_SPEED + 0.01) return 'run_fwd';
    if (speed > 0.01) return 'walk_fwd';
    return 'idle';
  }
}
