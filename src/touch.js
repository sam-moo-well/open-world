// Mobile touch controls.
//
// This layer only *synthesizes* the signals src/input.js already exposes —
// key edges, mouse buttons, look deltas — so the controller needs no
// touch-specific branches. Everything is pointer-event based, so it also
// works under a desktop browser with ?touch=1 for testing.
//
// Layout (landscape, two thumbs, nothing critical outside the corner arcs):
//
//   left half            right half
//   +------------------+------------------+
//   |                  |            (abl) |
//   |  floating stick  |        (grd)     |
//   | [crouch]         |   (jmp)  ATTACK  |
//   +------------------+------------------+
//
// One control per intent; game state disambiguates the rest:
//   Attack  tap  -> combo (chains on repeat tap); running/airborne/crouched
//                   variants are already contextual in the controller
//           hold -> spin attack
//   Guard   tap  -> toggle guard up/down;  hold -> guard while held
//   Ability tap  -> power up;              hold -> long channel
//   Jump / Crouch are plain buttons. Draw/sheathe has no button at all:
//   attacking auto-draws, and the controller auto-sheathes out of combat.

const HOLD_MS = 260;
const STICK_RADIUS = 62;
const CANCEL_SLOP = 34;   // px a thumb may slide before a press is abandoned

// Pointer capture throws for a pointer the browser no longer tracks; losing
// capture is never worth losing the input over.
function capture(el, id) {
  try { el.setPointerCapture(id); } catch { /* not capturable */ }
}

export class TouchControls {
  static shouldEnable() {
    const forced = new URLSearchParams(location.search).get('touch');
    if (forced === '1') return true;
    if (forced === '0') return false;
    return (navigator.maxTouchPoints || 0) > 0
      && matchMedia('(pointer: coarse)').matches;
  }

  constructor(input, { isDead = () => false } = {}) {
    this.input = input;
    this.isDead = isDead;
    this.stickId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.camPointers = new Map();
    this.pinchDist = null;
    this.guardOn = false;
    this.guardClosing = false;
    this.guardDownAt = 0;
    this._build();
  }

  // ------------------------------------------------------------ synthesis

  // Only the *edge* matters to the controller, and edges survive until the
  // next consume(), so releasing on a timer is safe regardless of frame timing.
  _pulseKey(code) {
    this.input.injectKey(code, true);
    setTimeout(() => this.input.injectKey(code, false), 60);
  }

  _pulseAttack() {
    this.input.injectMouse('left', true);
    setTimeout(() => this.input.injectMouse('left', false), 60);
  }

  _setGuard(on) {
    if (this.guardOn === on) return;
    this.guardOn = on;
    this.input.injectMouse('right', on);
    this.els.guard.classList.toggle('active', on);
  }

  // ---------------------------------------------------------------- build

  _button(cls, label, handlers) {
    const el = document.createElement('div');
    el.className = `t-btn ${cls}`;
    el.textContent = label;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      capture(el, e.pointerId);
      el.classList.add('down');
      el._downAt = performance.now();
      el._start = { x: e.clientX, y: e.clientY };
      el._held = false;
      el._cancelled = false;
      if (handlers.onHold) {
        el._timer = setTimeout(() => {
          el._held = true;
          handlers.onHold();
        }, HOLD_MS);
      }
      handlers.onDown?.();
    });
    // Sliding a thumb off a button cancels it — the standard touch escape
    // hatch, and it keeps a camera drag that grazes a button from firing it.
    el.addEventListener('pointermove', (e) => {
      if (el._cancelled || !el.classList.contains('down')) return;
      if (Math.hypot(e.clientX - el._start.x, e.clientY - el._start.y) < CANCEL_SLOP) return;
      el._cancelled = true;
      el.classList.remove('down');
      clearTimeout(el._timer);
    });
    const release = (e) => {
      e.stopPropagation();
      clearTimeout(el._timer);
      if (el._cancelled) return;
      if (!el.classList.contains('down')) return;
      el.classList.remove('down');
      handlers.onUp?.(performance.now() - el._downAt, el._held);
      if (!el._held) handlers.onTap?.();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    this.root.appendChild(el);
    return el;
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'touch-ui';
    document.body.appendChild(root);
    this.root = root;

    // Camera drag surface — sits behind the buttons on the right half.
    const cam = document.createElement('div');
    cam.className = 't-cam';
    root.appendChild(cam);

    // Movement surface — left half, spawns the stick wherever it's pressed.
    const move = document.createElement('div');
    move.className = 't-move';
    root.appendChild(move);

    const stick = document.createElement('div');
    stick.className = 't-stick';
    const knob = document.createElement('div');
    knob.className = 't-knob';
    stick.appendChild(knob);
    root.appendChild(stick);

    this.els = { cam, move, stick, knob };

    // --- buttons ---
    this._button('t-attack', '⚔', {
      onTap: () => this._pulseAttack(),
      onHold: () => this._pulseKey('KeyV'),      // spin attack
    });
    this.els.guard = this._button('t-guard', '🛡', {
      onDown: () => {
        this.guardDownAt = performance.now();
        this.guardClosing = this.guardOn;
        this._setGuard(!this.guardOn);
      },
      onUp: () => {
        // Tap toggles; a deliberate hold lowers the guard on release.
        if (this.guardClosing) return;
        if (performance.now() - this.guardDownAt > HOLD_MS) this._setGuard(false);
      },
    });
    this._button('t-jump', '⤒', { onDown: () => this._pulseKey('Space') });
    this._button('t-ability', '✦', {
      onTap: () => this._pulseKey('KeyE'),       // power up
      onHold: () => this._pulseKey('KeyG'),      // long channel
    });
    this._button('t-crouch', '⌄', { onDown: () => this._pulseKey('KeyC') });

    this._bindStick(move);
    this._bindCamera(cam);
  }

  // ---------------------------------------------------------------- stick

  _bindStick(zone) {
    const place = (x, y) => {
      this.stickOrigin = { x, y };
      this.els.stick.style.left = `${x}px`;
      this.els.stick.style.top = `${y}px`;
      this.els.stick.classList.add('active');
    };

    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      capture(zone, e.pointerId);
      place(e.clientX, e.clientY);
      this._updateStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      this._updateStick(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.input.stick = null;
      this.els.stick.classList.remove('active');
      this.els.knob.style.transform = 'translate(-50%, -50%)';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    // Safety net: a pointer can vanish without a pointerup on its zone
    // (capture stolen, browser gesture, tab backgrounded). A stick stuck at
    // full throw would run the hero off forever, so always release.
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', () => {
      if (this.stickId !== null) end({ pointerId: this.stickId });
    });
  }

  _updateStick(x, y) {
    let dx = x - this.stickOrigin.x;
    let dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.els.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Screen +y (dragging down) is "backwards", matching the S key.
    this.input.stick = { x: dx / STICK_RADIUS, y: dy / STICK_RADIUS };
  }

  // --------------------------------------------------------------- camera

  _bindCamera(zone) {
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(zone, e.pointerId);
      this.camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinchDist = null;
    });

    zone.addEventListener('pointermove', (e) => {
      const prev = this.camPointers.get(e.pointerId);
      if (!prev) return;
      const pts = this.camPointers;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pts.size === 1) {
        this.input.look.dx += e.clientX - prev.x;
        this.input.look.dy += e.clientY - prev.y;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist !== null) {
          // Camera applies wheel * 0.6, so feed it fractional steps.
          this.input.wheel += (this.pinchDist - dist) * 0.03;
        }
        this.pinchDist = dist;
      }
    });

    const end = (e) => {
      const had = this.camPointers.get(e.pointerId);
      this.camPointers.delete(e.pointerId);
      if (this.camPointers.size < 2) this.pinchDist = null;
      // A tap anywhere revives the hero on the death screen.
      if (had && this.isDead()) this._pulseKey('Enter');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
}
