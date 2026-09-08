/*
  Input for the corridor: keys (WASD / arrows), mouse look, and on touch
  screens a floating stick in the lower-left plus drag-to-look everywhere
  else — the layout every mobile first-person game uses, so nobody has to
  learn it.

  Mouse look is Pointer Lock, the FPS convention: click the canvas to hide
  and capture the cursor, then every mouse move turns the camera, click
  again to open the book you're facing, Escape lets go (the browser does
  that part on its own — exiting lock needs no code here). Where Pointer
  Lock isn't available at all, mouse input falls back to the old
  drag-to-look-and-tap scheme instead of failing silently; touch never uses
  lock, since a hidden system cursor isn't a touch-screen concept.

  The keyboard is only captured while the corridor has focus, the pointer
  is over it, or the pointer is locked to it. Arrow keys still scroll the
  rest of the page.
*/

export const LOCK_SUPPORTED =
  typeof document !== "undefined" && "pointerLockElement" in document;

export interface InputFrame {
  /** -1 (back) .. 1 (forward) */
  forward: number;
  /** -1 (left) .. 1 (right) */
  strafe: number;
  /** -1 (left) .. 1 (right), a rate — from arrow keys or the stick's x axis */
  turn: number;
  run: boolean;
  /** Pointer drag since the last frame, in CSS pixels. */
  lookDx: number;
  lookDy: number;
  lookPointer: "mouse" | "touch" | "pen";
  /** Pointer Lock is engaged on the canvas — mouse-look is live. */
  locked: boolean;
  /** Any input at all this frame — used to decide whether to render. */
  active: boolean;
}

export interface InputCallbacks {
  /** A click or tap that did not turn into a drag. Root-relative CSS px. */
  onTap(x: number, y: number): void;
  /** Mouse moved over the canvas without a button held. */
  onHover(x: number, y: number): void;
  onHoverEnd(): void;
  /** Enter or Space with the corridor focused. */
  onActivate(): void;
}

export interface StickElements {
  stick: HTMLElement; // container, shown while a touch holds it
  knob: HTMLElement;
}

const STICK_RADIUS = 44; // px the knob travels
const DEADZONE = 0.12;
const TAP_MOVE_PX = 8;
const TAP_MS = 450;

const KEYS_HANDLED = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight", "Space", "Enter",
]);

export class Controls {
  private keys = new Set<string>();
  private hovering = false;
  private locked = false;
  private lookDx = 0;
  private lookDy = 0;
  private lookPointer: InputFrame["lookPointer"] = "mouse";
  private stickVec = { x: 0, y: 0 };
  private turnedThisFrame = false;

  // Pointers currently down, by pointerId.
  private lookId: number | null = null;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private downAt = { x: 0, y: 0, t: 0, moved: false };

  private readonly abort = new AbortController();

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLElement,
    private readonly stick: StickElements,
    private readonly cb: InputCallbacks
  ) {
    const { signal } = this.abort;
    const opts = { signal };

    window.addEventListener("keydown", this.onKeyDown, opts);
    window.addEventListener("keyup", this.onKeyUp, opts);
    window.addEventListener("blur", this.clearKeys, opts);
    document.addEventListener("visibilitychange", this.clearKeys, opts);
    if (LOCK_SUPPORTED) {
      document.addEventListener("pointerlockchange", this.onLockChange, opts);
    }

    root.addEventListener("pointerenter", this.onEnter, opts);
    root.addEventListener("pointerleave", this.onLeave, opts);

    canvas.addEventListener("pointerdown", this.onPointerDown, opts);
    canvas.addEventListener("pointermove", this.onPointerMove, opts);
    canvas.addEventListener("pointerup", this.onPointerUp, opts);
    canvas.addEventListener("pointercancel", this.onPointerUp, opts);
    canvas.addEventListener("contextmenu", e => e.preventDefault(), opts);
    // Old iOS fires gesture events that would zoom the page.
    canvas.addEventListener("touchstart", e => e.preventDefault(), {
      signal,
      passive: false,
    });
  }

  dispose(): void {
    this.abort.abort();
    this.hideStick();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Read and reset the per-frame accumulators. */
  consume(): InputFrame {
    const k = this.keys;
    const kf = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) -
      (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const ks = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    const kt = (k.has("ArrowRight") || k.has("KeyE") ? 1 : 0) -
      (k.has("ArrowLeft") || k.has("KeyQ") ? 1 : 0);

    const forward = clamp(kf + this.stickVec.y);
    const strafe = clamp(ks);
    const turn = clamp(kt + this.stickVec.x);

    const frame: InputFrame = {
      forward,
      strafe,
      turn,
      run: k.has("ShiftLeft") || k.has("ShiftRight"),
      lookDx: this.lookDx,
      lookDy: this.lookDy,
      lookPointer: this.lookPointer,
      locked: this.locked,
      active:
        forward !== 0 || strafe !== 0 || turn !== 0 ||
        this.lookDx !== 0 || this.lookDy !== 0 || this.turnedThisFrame,
    };
    this.lookDx = 0;
    this.lookDy = 0;
    this.turnedThisFrame = false;
    return frame;
  }

  /* ---- keyboard -------------------------------------------------------- */

  private keysActive(): boolean {
    return this.hovering || this.locked || this.root.matches(":focus-within");
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!KEYS_HANDLED.has(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.keysActive()) return;
    // Enter/Space open the aimed frame, but not if they were meant for a
    // button inside the corridor's chrome (fullscreen, the label link).
    const target = e.target as HTMLElement | null;
    const onControl = !!target && target !== this.root && target !== this.canvas &&
      (target.tagName === "BUTTON" || target.tagName === "A");
    if ((e.code === "Enter" || e.code === "Space") && onControl) return;
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Enter" || e.code === "Space") {
      this.cb.onActivate();
      return;
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private clearKeys = (): void => {
    this.keys.clear();
  };

  /* ---- pointer --------------------------------------------------------- */

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private inStickZone(x: number, y: number): boolean {
    const r = this.root.getBoundingClientRect();
    return x < r.width * 0.45 && y > r.height * 0.5;
  }

  private onEnter = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") this.hovering = true;
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") {
      this.hovering = false;
      this.cb.onHoverEnd();
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.canvas.focus({ preventScroll: true });

    // Pointer Lock owns mouse look entirely: the first click engages it
    // (consumed here, not also opening whatever's under the crosshair), and
    // every click after that is the FPS convention of activating whatever
    // you're facing. Pens fall through to the drag scheme below — Pointer
    // Lock support for them is too spotty to build on.
    if (e.pointerType === "mouse" && LOCK_SUPPORTED) {
      if (this.locked) this.cb.onActivate();
      else this.canvas.requestPointerLock()?.catch(() => {});
      return;
    }

    const p = this.local(e);
    this.canvas.setPointerCapture?.(e.pointerId);

    if (
      e.pointerType === "touch" &&
      this.stickId === null &&
      this.inStickZone(p.x, p.y)
    ) {
      this.stickId = e.pointerId;
      // Screen-space, not root-relative: if the page scrolls under a held
      // finger the root's rect moves and root-relative deltas go wrong.
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.showStick(p.x, p.y);
      return;
    }
    if (this.lookId !== null) return; // one look finger at a time
    this.lookId = e.pointerId;
    this.lookPointer = e.pointerType as InputFrame["lookPointer"];
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      this.stick.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / STICK_RADIUS, ny = -dy / STICK_RADIUS;
      this.stickVec.x = dead(nx);
      this.stickVec.y = dead(ny);
      this.turnedThisFrame = true;
      return;
    }
    if (this.locked && e.pointerType === "mouse") {
      // Coalesced events keep a fast look smooth on high-rate mice.
      const events = e.getCoalescedEvents?.() ?? [e];
      let dx = 0, dy = 0;
      for (const ev of events) {
        dx += ev.movementX;
        dy += ev.movementY;
      }
      this.lookDx += dx;
      this.lookDy += dy;
      this.lookPointer = "mouse";
      return;
    }
    if (e.pointerId === this.lookId) {
      // Coalesced events keep a fast drag smooth on high-rate screens.
      const events = e.getCoalescedEvents?.() ?? [e];
      let dx = 0, dy = 0;
      for (const ev of events) {
        dx += ev.movementX;
        dy += ev.movementY;
      }
      // Safari lacks movementX on touch; fall back to position deltas.
      if (dx === 0 && dy === 0 && events.length === 1) {
        dx = e.clientX - (this.lastLook?.x ?? e.clientX);
        dy = e.clientY - (this.lastLook?.y ?? e.clientY);
      }
      this.lastLook = { x: e.clientX, y: e.clientY };
      this.lookDx += dx;
      this.lookDy += dy;
      if (
        Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > TAP_MOVE_PX
      ) {
        this.downAt.moved = true;
      }
      return;
    }
    if (!this.locked && e.pointerType === "mouse" && e.buttons === 0) {
      const p = this.local(e);
      this.cb.onHover(p.x, p.y);
    }
  };

  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    // A stray movementX/Y spike can arrive with the event that un-hides the
    // cursor; drop anything already queued rather than snap the camera.
    if (!this.locked) {
      this.lookDx = 0;
      this.lookDy = 0;
    }
  };

  private lastLook: { x: number; y: number } | null = null;

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stickVec.x = 0;
      this.stickVec.y = 0;
      this.turnedThisFrame = true;
      this.hideStick();
      return;
    }
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      this.lastLook = null;
      const p = this.local(e);
      const quick = performance.now() - this.downAt.t < TAP_MS;
      if (!this.downAt.moved && quick && e.type === "pointerup") {
        this.cb.onTap(p.x, p.y);
      }
    }
  };

  /* ---- stick ----------------------------------------------------------- */

  private showStick(x: number, y: number): void {
    const s = this.stick.stick;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    this.stick.knob.style.transform = "translate(0, 0)";
    this.root.classList.add("is-stick");
  }

  private hideStick(): void {
    this.root.classList.remove("is-stick");
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function dead(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  const scaled = (a - DEADZONE) / (1 - DEADZONE);
  return Math.sign(v) * Math.min(1, scaled);
}
