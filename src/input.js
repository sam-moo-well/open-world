// Keyboard + mouse input with per-frame edge detection.
// inject* helpers exist so automated tests can drive the game headlessly.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.edges = new Set();       // keys pressed this frame
    this.mouse = { left: false, right: false };
    this.mouseEdges = { left: false, right: false, rightUp: false };
    this.look = { dx: 0, dy: 0 };
    this.wheel = 0;
    // Analog move vector written by the touch stick; null means "use WASD".
    this.stick = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.edges.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouseEdges.left = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouseEdges.right = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) { this.mouse.right = false; this.mouseEdges.rightUp = true; }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.edges.has(code); }

  // Movement as an analog vector with magnitude 0..1, screen-space
  // (+x right, +y "backwards"). The touch stick is analog by nature; the
  // keyboard fakes it, with Shift standing in for a half-pushed stick. The
  // controller picks walk vs run from the magnitude either way.
  moveVector() {
    if (this.stick) return this.stick;
    const x = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    const y = (this.down('KeyS') ? 1 : 0) - (this.down('KeyW') ? 1 : 0);
    if (x === 0 && y === 0) return { x: 0, y: 0 };
    const len = Math.hypot(x, y);
    const mag = this.down('ShiftLeft') || this.down('ShiftRight') ? 0.5 : 1;
    return { x: (x / len) * mag, y: (y / len) * mag };
  }

  // Call at the end of each frame.
  consume() {
    this.edges.clear();
    this.mouseEdges.left = this.mouseEdges.right = this.mouseEdges.rightUp = false;
    this.look.dx = this.look.dy = 0;
    this.wheel = 0;
  }

  // --- test hooks -------------------------------------------------------
  injectKey(code, down = true) {
    if (down) { this.keys.add(code); this.edges.add(code); }
    else this.keys.delete(code);
  }
  injectMouse(button, down = true) {
    if (button === 'left') { this.mouse.left = down; if (down) this.mouseEdges.left = true; }
    if (button === 'right') {
      this.mouse.right = down;
      if (down) this.mouseEdges.right = true; else this.mouseEdges.rightUp = true;
    }
  }
}
