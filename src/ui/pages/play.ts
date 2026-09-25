import { LESSON_BY_ID, REALMS, REALM_BY_ID, lessonsIn, nextLesson } from '../../curriculum';
import type { Lesson, RealmId } from '../../curriculum/types';
import { isDone, levelInfo, progress, setOnboarded, subscribe } from '../../progress/store';
import { BLOCKS } from '../../world/blocks';
import type { Engine, Place } from '../../world/engine';
import { GROUND, SITE_BY_REALM, yawTowards, type Station } from '../../world/layout';
import { builderView } from '../components/builderView';
import { forgeView } from '../components/forgeView';
import { lessonView } from '../components/lessonView';
import { h } from '../dom';

let root: HTMLElement | null = null;
let engine: Engine | null = null;
let enginePromise: Promise<Engine> | null = null;
let panel: { el: HTMLElement; body: HTMLElement; destroy?: () => void } | null = null;
let pendingTarget: string | undefined;
const isTouch = matchMedia('(pointer: coarse)').matches;

// HUD elements, created once.
const hud = {
  place: h('div', { class: 'hud-place' }),
  level: h('a', { class: 'hud-level', href: '#/learn' }),
  prompt: h('div', { class: 'hud-prompt', hidden: true }),
  hotbar: h('div', { class: 'hotbar', role: 'toolbar', 'aria-label': 'Blocks' }),
  fly: h('div', { class: 'hud-fly', hidden: true }, '✈ Flying — Space/Shift to go up/down, F to land'),
  start: h('div', { class: 'start-overlay' }),
  loading: h('div', { class: 'loading-overlay' }, h('div', { class: 'loader-cube' }), h('p', null, 'Generating the world…'), h('div', { class: 'xpbar big' }, h('span'))),
  map: h('dialog', { class: 'map-dialog' }),
};

function placeName(p: Place): string {
  if (p === 'hub') return '✦ The Hub';
  if (p === 'wilds') return '🌲 The Wilds';
  return REALM_BY_ID.get(p)!.name;
}

function renderLevel() {
  const info = levelInfo();
  hud.level.replaceChildren(
    h('span', { class: 'lvl' }, `Lv ${info.level}`), ` ${info.title}`,
    h('span', { class: 'xpbar' }, h('span', { style: { width: `${Math.round(info.frac * 100)}%` } })),
  );
}

function buildRoot(): HTMLElement {
  const el = h('div', { class: 'play-root' });
  const topLeft = h('div', { class: 'hud-top-left' },
    h('a', { class: 'hud-btn', href: '#/', title: 'Back to the website' }, '← Site'),
    hud.place,
    hud.level,
  );
  const topRight = h('div', { class: 'hud-top-right' },
    h('button', { class: 'hud-btn', onclick: () => openMap(), title: 'Map & teleport (M)' }, '🗺 Map'),
    h('button', { class: 'hud-btn', onclick: () => openBuilder(), title: 'Code Builder (B)' }, '🧱 Build'),
    h('button', { class: 'hud-btn', onclick: () => { engine?.teleport('neural'); openForge(); }, title: 'Neural Forge' }, '⚒ Forge'),
    h('button', { class: 'hud-btn', onclick: () => showStart(true), title: 'Controls' }, '?'),
  );
  el.append(topLeft, topRight, h('div', { class: 'crosshair', 'aria-hidden': 'true' }), hud.prompt, hud.fly, hud.hotbar, hud.start, hud.loading, hud.map);
  renderLevel();
  subscribe(renderLevel);
  return el;
}

async function ensureEngine(): Promise<Engine> {
  if (engine) return engine;
  enginePromise ??= (async () => {
    const { Engine } = await import('../../world/engine');
    const e = new Engine(root!, (id) => isDone(id));
    root!.prepend(e.canvas);
    wire(e);
    return e;
  })();
  engine = await enginePromise;
  return engine;
}

export async function showPlay(target?: string) {
  if (!root) {
    root = buildRoot();
    document.body.append(root);
  }
  root.hidden = false;
  pendingTarget = target;
  let e: Engine;
  try {
    e = await ensureEngine();
  } catch (err) {
    hud.loading.replaceChildren(h('p', null, 'Sorry — the 3D world could not start on this device (WebGL is required).'), h('a', { class: 'btn', href: '#/learn' }, 'Do the lessons without 3D →'));
    console.error(err);
    return;
  }
  e.start();
  e.refreshAllStations();
  if (pendingTarget) goTo(pendingTarget);
  if (!panel) showStart(false);
}

export function hidePlay() {
  if (!root) return;
  closePanel();
  engine?.stop();
  root.hidden = true;
}

function goTo(target: string) {
  if (!engine) return;
  pendingTarget = undefined;
  const lesson = LESSON_BY_ID.get(target);
  if (lesson) {
    engine.teleport(lesson.id);
    openLesson(lesson);
  } else if (REALM_BY_ID.has(target as RealmId) || target === 'hub') {
    engine.teleport(target);
  } else if (target === 'forge') {
    engine.teleport('neural');
    openForge();
  } else if (target === 'build') {
    openBuilder();
  }
}

function wire(e: Engine) {
  e.on('loading', (done, total) => {
    const bar = hud.loading.querySelector('.xpbar span') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
    if (done >= Math.min(total, 40)) hud.loading.classList.add('done');
  });
  e.on('place', (p) => {
    hud.place.textContent = placeName(p);
    hud.place.style.setProperty('--realm', p === 'hub' || p === 'wilds' ? '#7ef9ff' : REALM_BY_ID.get(p)!.color);
    hud.place.classList.remove('pulse');
    void hud.place.offsetWidth;
    hud.place.classList.add('pulse');
  });
  hud.place.textContent = placeName(e.place);
  e.on('near', (s) => {
    hud.prompt.hidden = !s;
    if (!s) return;
    const label = s.kind === 'forge' ? 'Neural Forge' : LESSON_BY_ID.get(s.lessonId!)!.title;
    hud.prompt.replaceChildren(
      isTouch ? h('button', { class: 'btn btn-primary', onclick: () => e.interact() }, `Open: ${label}`) : h('span', null, h('kbd', null, 'E'), ` ${label}`),
    );
  });
  e.on('interact', (s: Station) => {
    if (s.kind === 'forge') openForge();
    else openLesson(LESSON_BY_ID.get(s.lessonId!)!);
  });
  e.on('lock', (locked) => {
    root!.classList.toggle('locked', locked);
    if (!locked && !panel && !hud.map.open && !isTouch) showStart(false);
  });
  e.on('hotbar', () => renderHotbar(e));
  e.on('fly', (on) => { hud.fly.hidden = !on; });
  e.on('builder', () => openBuilder());
  renderHotbar(e);
  if (isTouch) addTouchControls(e);

  window.addEventListener('keydown', (ev) => {
    if (root?.hidden) return;
    const a = document.activeElement as HTMLElement | null;
    const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    if (ev.key === 'Escape' && panel) {
      closePanel();
      return;
    }
    if (typing || panel) return;
    if (ev.code === 'KeyM' && !ev.repeat) {
      if (hud.map.open) hud.map.close(); else openMap();
    }
  });
}

function renderHotbar(e: Engine) {
  hud.hotbar.replaceChildren(...e.hotbar.map((b, i) => {
    const def = BLOCKS[b];
    return h('button', {
      class: `slot${i === e.hotbarIndex ? ' active' : ''}`,
      title: `${i + 1}: ${def.name}`,
      'aria-label': `${i + 1}: ${def.name}`,
      onclick: () => e.selectHotbar(i),
      style: { backgroundImage: `url(${e.icon(def.tiles[1])})` },
    }, h('span', null, String(i + 1)));
  }));
}

// ---------------------------------------------------------------- overlays

function showStart(help: boolean) {
  if (!root) return;
  const first = !progress().onboarded;
  hud.start.hidden = false;
  hud.start.replaceChildren(
    h('div', { class: 'start-card' },
      h('h2', null, first ? 'Welcome to NeuralCraft 👋' : help ? 'Controls' : 'Paused'),
      first ? h('p', null, 'You’re standing in the Hub. Each coloured portal leads to a realm. Walk onto one, then find the glowing beacons — every beacon is a lesson. Solve it and your answer gets built on the realm’s display pad.') : null,
      isTouch
        ? h('ul', { class: 'controls-list' },
            h('li', null, 'Left stick: move'), h('li', null, 'Drag on the right: look'),
            h('li', null, 'Buttons: jump, fly, break and place blocks'), h('li', null, 'Tap “Open” near a beacon to start a lesson'))
        : h('ul', { class: 'controls-list' },
            h('li', null, h('kbd', null, 'WASD'), ' move · ', h('kbd', null, 'Mouse'), ' look · ', h('kbd', null, 'Space'), ' jump (double-tap to fly)'),
            h('li', null, h('kbd', null, 'E'), ' open nearby lesson · ', h('kbd', null, 'B'), ' Code Builder · ', h('kbd', null, 'M'), ' map · ', h('kbd', null, 'H'), ' hub'),
            h('li', null, h('kbd', null, 'Left click'), ' break · ', h('kbd', null, 'Right click'), ' place · ', h('kbd', null, '1–9'), ' pick block'),
            h('li', null, h('kbd', null, 'Esc'), ' free the mouse'),
          ),
      h('div', { class: 'cta-row' },
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          setOnboarded();
          hud.start.hidden = true;
          if (!isTouch) engine?.lock();
        } }, isTouch ? 'Play' : 'Click to play'),
        first ? h('button', { class: 'btn btn-lg', onclick: () => {
          setOnboarded();
          hud.start.hidden = true;
          const firstLesson = lessonsIn('foundations')[0];
          engine?.teleport(firstLesson.id);
          openLesson(firstLesson);
        } }, 'Take me to lesson 1') : null,
      ),
    ),
  );
}

function openPanel(content: { el: HTMLElement; destroy?: () => void }, wide = false) {
  closePanel();
  engine?.unlock();
  hud.start.hidden = true;
  const body = h('div', { class: 'panel-body' }, content.el);
  const el = h('aside', { class: `panel open${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'false' },
    h('button', { class: 'panel-close', onclick: () => closePanel(), 'aria-label': 'Close panel (Esc)' }, '✕'),
    body,
  );
  root!.append(el);
  panel = { el, body, destroy: content.destroy };
}

function closePanel(resume = true) {
  if (!panel) return;
  panel.destroy?.();
  panel.el.remove();
  panel = null;
  if (resume && root && !root.hidden) {
    if (isTouch) hud.start.hidden = true;
    else showStart(false);
  }
}

function openLesson(lesson: Lesson) {
  const view = lessonView(lesson, {
    mode: 'world',
    onVisualize: (l, ops) => engine?.showOnPad(l.realm, ops),
    onPassed: (l) => engine?.refreshStation(l.id),
    onSeeInWorld: (l) => {
      closePanel(false);
      lookAtPad(l.realm);
      if (!isTouch) engine?.lock();
    },
    onNext: (n) => {
      engine?.teleport(n.id);
      openLesson(n);
    },
  });
  openPanel(view);
}

function lookAtPad(realm: RealmId) {
  if (!engine) return;
  const site = SITE_BY_REALM.get(realm)!;
  const p = engine.player.pos;
  const d = Math.hypot(site.x - p.x, site.z - p.z);
  if (d > 30) {
    engine.teleport(realm);
  }
  const q = engine.player.pos;
  engine.player.yaw = yawTowards(q.x, q.z, site.x + 0.5, site.z + 0.5);
  engine.player.pitch = -Math.atan2(q.y + 1.6 - (GROUND + 3), Math.hypot(site.x - q.x, site.z - q.z));
}

function openBuilder() {
  const view = builderView({
    onBuild: (ops) => engine?.build(ops) ?? 0,
    onUndo: () => engine?.undoBuild() ?? 0,
  });
  openPanel(view, true);
}

function openForge() {
  const view = forgeView({ onPad: (ops) => engine?.showOnPad('neural', ops, false) });
  openPanel(view, true);
  if (engine && engine.place === 'neural') lookAtPad('neural');
}

function openMap() {
  engine?.unlock();
  hud.start.hidden = true;
  const teleport = (t: string) => {
    hud.map.close();
    engine?.teleport(t);
    if (!isTouch) engine?.lock();
  };
  hud.map.replaceChildren(
    h('form', { method: 'dialog', class: 'map-card' },
      h('header', { class: 'map-head' }, h('h2', null, '🗺 Teleport'), h('button', { class: 'panel-close', value: 'close', 'aria-label': 'Close' }, '✕')),
      h('button', { type: 'button', class: 'map-hub', onclick: () => teleport('hub') }, '✦ The Hub'),
      h('div', { class: 'map-grid' },
        REALMS.map((r) =>
          h('section', { class: 'map-realm', style: { '--realm': r.color } as Partial<CSSStyleDeclaration> },
            h('button', { type: 'button', class: 'map-realm-btn', onclick: () => teleport(r.id) }, r.name),
            h('ul', null, lessonsIn(r.id).map((l) =>
              h('li', null, h('button', { type: 'button', class: isDone(l.id) ? 'done' : '', onclick: () => {
                hud.map.close();
                engine?.teleport(l.id);
                openLesson(l);
              } }, `${isDone(l.id) ? '✓ ' : ''}${l.title}`)))),
            r.id === 'neural' ? h('button', { type: 'button', class: 'map-forge', onclick: () => { hud.map.close(); engine?.teleport('neural'); openForge(); } }, '⚒ Neural Forge') : null,
          )),
      ),
      h('p', { class: 'muted small' }, 'Tip: the next unfinished lesson is ', (() => {
        const n = nextUnfinished();
        return n ? h('button', { type: 'button', class: 'linklike', onclick: () => { hud.map.close(); engine?.teleport(n.id); openLesson(n); } }, n.title) : 'nothing — you finished them all! 🎓';
      })()),
    ),
  );
  hud.map.showModal();
}

function nextUnfinished(): Lesson | undefined {
  let l: Lesson | undefined = lessonsIn('foundations')[0];
  while (l && isDone(l.id)) l = nextLesson(l.id);
  return l;
}

// ---------------------------------------------------------------- touch

function addTouchControls(e: Engine) {
  const stick = h('div', { class: 'touch-stick' }, h('div', { class: 'knob' }));
  const btn = (label: string, fn: () => void, hold?: (down: boolean) => void) => {
    const b = h('button', { class: 'touch-btn' }, label);
    b.addEventListener('touchstart', (ev) => { ev.preventDefault(); fn(); hold?.(true); }, { passive: false });
    b.addEventListener('touchend', (ev) => { ev.preventDefault(); hold?.(false); }, { passive: false });
    return b;
  };
  const buttons = h('div', { class: 'touch-buttons' },
    btn('⤒', () => {}, (d) => { e.input.jump = d; }),
    btn('✈', () => e.toggleFly()),
    btn('⛏', () => e.breakBlock()),
    btn('▣', () => e.placeBlock()),
    btn('⤓', () => {}, (d) => { e.input.descend = d; }),
  );
  root!.append(stick, buttons);

  let stickId: number | null = null, sx = 0, sy = 0;
  const knob = stick.firstElementChild as HTMLElement;
  stick.addEventListener('touchstart', (ev) => {
    const t = ev.changedTouches[0];
    stickId = t.identifier; sx = t.clientX; sy = t.clientY;
    ev.preventDefault();
  }, { passive: false });
  stick.addEventListener('touchmove', (ev) => {
    for (const t of Array.from(ev.changedTouches)) {
      if (t.identifier !== stickId) continue;
      const dx = Math.max(-40, Math.min(40, t.clientX - sx));
      const dy = Math.max(-40, Math.min(40, t.clientY - sy));
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      e.input.strafe = dx / 40;
      e.input.forward = -dy / 40;
      e.input.sprint = Math.hypot(dx, dy) > 38;
    }
    ev.preventDefault();
  }, { passive: false });
  const endStick = () => {
    stickId = null;
    knob.style.transform = '';
    e.input.forward = e.input.strafe = 0;
    e.input.sprint = false;
  };
  stick.addEventListener('touchend', endStick);
  stick.addEventListener('touchcancel', endStick);

  let lookId: number | null = null, lx = 0, ly = 0;
  e.canvas.addEventListener('touchstart', (ev) => {
    const t = ev.changedTouches[0];
    if (t.clientX < innerWidth * 0.35) return;
    lookId = t.identifier; lx = t.clientX; ly = t.clientY;
  }, { passive: true });
  e.canvas.addEventListener('touchmove', (ev) => {
    for (const t of Array.from(ev.changedTouches)) {
      if (t.identifier !== lookId) continue;
      e.lookBy((t.clientX - lx) * 0.006, (t.clientY - ly) * 0.006);
      lx = t.clientX; ly = t.clientY;
    }
  }, { passive: true });
  e.canvas.addEventListener('touchend', () => { lookId = null; });
}
