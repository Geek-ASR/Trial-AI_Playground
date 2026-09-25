import { audio } from '../../audio/audio';
import { LESSON_BY_ID, REALMS, REALM_BY_ID, lessonsIn, nextLesson } from '../../curriculum';
import type { Lesson, RealmId } from '../../curriculum/types';
import { isDone, levelInfo, progress, setOnboarded, subscribe } from '../../progress/store';
import { onSettings, PRESETS, settings } from '../../render/settings';
import type { Labs } from '../../sims';
import type { Interactable } from '../../sims/sim';
import { BLOCKS } from '../../world/blocks';
import type { Engine, Place } from '../../world/engine';
import { LAB_SITES, SITE_BY_REALM, STATION_BY_LESSON, type LabKind } from '../../world/layout';
import { builderView } from '../components/builderView';
import { challengeView } from '../components/challengeView';
import { credits, onCredits } from '../../progress/credits';
import { forgeView } from '../components/forgeView';
import { lessonView } from '../components/lessonView';
import { settingsView } from '../components/settingsView';
import { toast } from '../components/toast';
import { h } from '../dom';

let root: HTMLElement | null = null;
let engine: Engine | null = null;
let labs: Labs | null = null;
let enginePromise: Promise<Engine> | null = null;
let panel: { el: HTMLElement; body: HTMLElement; destroy?: () => void } | null = null;
let pendingTarget: string | undefined;
let stopTour: (() => void) | null = null;
const isTouch = matchMedia('(pointer: coarse)').matches;

let LAB_NAMES: Record<LabKind, string> = {} as Record<LabKind, string>;

const hud = {
  place: h('div', { class: 'hud-place' }),
  level: h('a', { class: 'hud-level', href: '#/learn' }),
  clock: h('div', { class: 'hud-clock' }),
  fps: h('div', { class: 'hud-fps', hidden: true }),
  prompt: h('div', { class: 'hud-prompt', hidden: true }),
  hotbar: h('div', { class: 'hotbar', role: 'toolbar', 'aria-label': 'Blocks' }),
  fly: h('div', { class: 'hud-fly', hidden: true }, '✈ Flying — Space/Shift to go up/down, F to land'),
  guide: h('div', { class: 'hud-guide', hidden: true }),
  caption: h('div', { class: 'tour-caption', hidden: true }),
  photo: h('div', { class: 'photo-bar', hidden: true }),
  start: h('div', { class: 'start-overlay', hidden: true }),
  loading: h('div', { class: 'loading-overlay' },
    h('div', { class: 'loader-cube' }),
    h('p', { class: 'loading-label' }, 'Preparing the world…'),
    h('div', { class: 'xpbar big' }, h('span')),
    h('p', { class: 'muted small' }, 'Generating 8 million blocks, six biomes and six live AI labs — right here in your browser.'),
  ),
  map: h('dialog', { class: 'map-dialog' }),
  credits: h('button', { class: 'hud-btn hud-credits', title: 'Block credits — earn more with quizzes, maths and code (Q)' }),
  cursor: h('div', { class: 'hud-cursor', hidden: true }, '🖱 Free cursor — drag to look · click to break · right-click to place · Shift+M for mouse-look'),
};

function placeName(p: Place): string {
  if (p === 'hub') return '✦ The Hub';
  if (p === 'wilds') return '🌲 The Wilds';
  if (p === 'playground') return '🏗 Your Playground';
  if (REALM_BY_ID.has(p as RealmId)) return REALM_BY_ID.get(p as RealmId)!.name;
  return `🔬 ${LAB_NAMES[p as LabKind] ?? p}`;
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
    hud.clock,
  );
  const topRight = h('div', { class: 'hud-top-right' },
    h('button', { class: 'hud-btn', onclick: () => openMap(), title: 'Map & teleport (M)' }, '🗺 Map'),
    hud.credits,
    h('button', { class: 'hud-btn', onclick: () => openBuilder(), title: 'Code Builder (B)' }, '🧱 Build'),
    h('button', { class: 'hud-btn', onclick: () => guideToNext(), title: 'Nova guides you to your next lesson (G)' }, '🧭 Guide'),
    h('button', { class: 'hud-btn', onclick: () => togglePhoto(), title: 'Photo mode (P)' }, '📷'),
    h('button', { class: 'hud-btn', onclick: () => openSettings(), title: 'Settings' }, '⚙'),
    h('button', { class: 'hud-btn', onclick: () => showStart(true), title: 'Controls' }, '?'),
  );
  el.append(topLeft, topRight, hud.cursor, hud.fps, h('div', { class: 'crosshair', 'aria-hidden': 'true' }), hud.prompt, hud.fly, hud.guide, hud.hotbar, hud.caption, hud.photo, hud.start, hud.loading, hud.map);
  renderLevel();
  subscribe(renderLevel);
  const renderCredits = () => { hud.credits.textContent = `⚡ ${credits().toLocaleString()}`; };
  hud.credits.addEventListener('click', () => openChallenges());
  renderCredits();
  onCredits(renderCredits);
  return el;
}

async function ensureEngine(): Promise<Engine> {
  if (engine) return engine;
  enginePromise ??= (async () => {
    const [{ Engine, LAB_NAMES: names }, { createLabs }] = await Promise.all([import('../../world/engine'), import('../../sims')]);
    LAB_NAMES = names;
    const bar = hud.loading.querySelector('.xpbar span') as HTMLElement;
    const label = hud.loading.querySelector('.loading-label') as HTMLElement;
    const e = await Engine.create(root!, (id) => isDone(id), (text, frac) => {
      label.textContent = text;
      bar.style.width = `${Math.round(frac * 100)}%`;
    });
    root!.prepend(e.canvas);
    labs = createLabs(e);
    // Handy for debugging in the console (and for the browser smoke test).
    (window as unknown as { neuralcraft: unknown }).neuralcraft = { engine: e, labs };
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
  const waitReady = () => {
    if (!e.worldReady) {
      requestAnimationFrame(waitReady);
      return;
    }
    hud.loading.classList.add('done');
    if (pendingTarget) goTo(pendingTarget);
    if (!panel && !stopTour) showStart(false);
  };
  waitReady();
}

export function hidePlay() {
  if (!root) return;
  stopTour?.();
  closePanel(false);
  engine?.stop();
  root.hidden = true;
}

function goTo(target: string) {
  if (!engine) return;
  pendingTarget = undefined;
  const lesson = LESSON_BY_ID.get(target);
  const lab = LAB_SITES.find((l) => l.kind === target);
  if (lesson) {
    engine.teleport(lesson.id);
    openLesson(lesson);
  } else if (lab) {
    engine.teleport(lab.kind);
  } else if (REALM_BY_ID.has(target as RealmId) || target === 'hub' || target === 'playground') {
    engine.teleport(target);
  } else if (target === 'forge') {
    engine.teleport('neural');
    openForge();
  } else if (target === 'build') {
    openBuilder();
  } else if (target === 'tour') {
    startTour();
  }
}

function wire(e: Engine) {
  e.on('place', (p) => {
    hud.place.textContent = placeName(p);
    const realm = REALM_BY_ID.get(p as RealmId) ?? REALM_BY_ID.get(LAB_SITES.find((l) => l.kind === p)?.realm as RealmId);
    hud.place.style.setProperty('--realm', realm?.color ?? '#7ef9ff');
    hud.place.classList.remove('pulse');
    void hud.place.offsetWidth;
    hud.place.classList.add('pulse');
  });
  hud.place.textContent = placeName(e.place);
  e.on('near', (s) => {
    hud.prompt.hidden = !s;
    if (!s) return;
    const label = s.kind === 'lesson' ? LESSON_BY_ID.get(s.lessonId!)!.title : s.title;
    hud.prompt.replaceChildren(
      isTouch ? h('button', { class: 'btn btn-primary', onclick: () => e.interact() }, `Open: ${label}`) : h('span', null, h('kbd', null, 'E'), ` ${label}`),
    );
  });
  e.on('interact', (s: Interactable) => {
    if (s.kind === 'forge') openForge();
    else if (s.kind === 'lesson') openLesson(LESSON_BY_ID.get(s.lessonId!)!);
    else if (s.kind === 'lab') openLab(s.lab as LabKind);
    else if (s.kind === 'flock') openFlock();
    else if (s.kind === 'kiosk') openChallenges();
  });
  e.on('needCredits', (need, have) => {
    toast('Not enough block credits', `That needs ${need} ⚡ and you have ${have}. Press Q (or the ⚡ button) to earn more with a quick quiz, maths or code challenge.`, 'error', 5000);
  });
  e.on('cursor', (free) => {
    hud.cursor.hidden = !free;
    root!.classList.toggle('free-cursor', free);
    if (free) hud.start.hidden = true;
  });
  e.on('lock', (locked) => {
    root!.classList.toggle('locked', locked);
    if (!locked && !e.freeCursor && !panel && !hud.map.open && !isTouch && !stopTour && !root!.classList.contains('photo')) showStart(false);
  });
  e.on('hotbar', () => renderHotbar(e));
  e.on('fly', (on) => { hud.fly.hidden = !on; });
  e.on('builder', () => openBuilder());
  e.on('guide', () => guideToNext());
  e.on('photo', () => togglePhoto());
  e.on('quality', (level, auto) => {
    if (auto) toast('Graphics adjusted', `Switched to ${PRESETS[level].label} to keep things smooth. Change it in ⚙ Settings.`, 'info', 5000);
  });
  e.on('weather', (k) => {
    const msg: Record<string, string> = { rain: '🌧 It\'s starting to rain…', storm: '⛈ A thunderstorm is rolling in!', cloudy: '☁ Clouds are gathering.', clear: '☀ The sky is clearing.' };
    if (msg[k] && k !== 'clear') toast(msg[k], '', 'info', 3500);
  });
  labs!.nova.onStats = (s) => {
    hud.guide.hidden = false;
    hud.guide.replaceChildren(
      h('b', null, `🧭 Following Nova → ${s.target}`),
      h('span', null, ` · path ${s.length} steps · A* explored ${s.explored.toLocaleString()} cells (Dijkstra would explore ${s.dijkstra.toLocaleString()})`),
      h('button', { class: 'mini-x', onclick: () => { labs!.nova.cancel(); hud.guide.hidden = true; }, 'aria-label': 'Stop guiding' }, '✕'),
    );
  };
  labs!.nova.onArrive = () => { setTimeout(() => { hud.guide.hidden = true; }, 2500); };
  renderHotbar(e);
  if (isTouch) addTouchControls(e);

  const clockTimer = () => {
    if (!engine) return;
    const s = engine.sky;
    const icon = engine.weather.kind === 'storm' ? '⛈' : engine.weather.kind === 'rain' ? '🌧' : engine.weather.kind === 'cloudy' ? '☁' : s.daylight > 0.5 ? '☀' : '🌙';
    hud.clock.textContent = `${icon} ${s.clock()}`;
    hud.fps.hidden = !settings().showFps;
    hud.fps.textContent = `${Math.round(engine.fps)} fps · ${PRESETS[engine.quality].label}`;
  };
  setInterval(clockTimer, 500);
  onSettings(() => clockTimer());

  window.addEventListener('keydown', (ev) => {
    if (root?.hidden) return;
    const a = document.activeElement as HTMLElement | null;
    const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    if (ev.key === 'Escape') {
      if (stopTour) { stopTour(); return; }
      if (root?.classList.contains('photo')) { togglePhoto(); return; }
      if (panel) { closePanel(); return; }
    }
    if (typing || panel) return;
    if (ev.code === 'KeyM' && !ev.shiftKey && !ev.repeat) {
      if (hud.map.open) hud.map.close(); else openMap();
    }
    if (ev.code === 'KeyQ' && !ev.repeat && !hud.map.open) openChallenges();
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
  const play = () => {
    audio.unlock();
    setOnboarded();
    hud.start.hidden = true;
    if (!isTouch) engine?.lock();
  };
  hud.start.replaceChildren(
    h('div', { class: 'start-card' },
      h('h2', null, first ? 'Welcome to NeuralCraft 👋' : help ? 'Controls' : 'Paused'),
      first ? h('p', null, 'You\'re in the Hub. Walk through a glowing portal ring to reach a realm; every light beam is a lesson, and beyond each realm is a live AI lab. Lost? Press G and Nova the robot will guide you.') : null,
      isTouch
        ? h('ul', { class: 'controls-list' },
            h('li', null, 'Left stick: move · drag on the right: look'),
            h('li', null, 'Buttons: jump, fly, break and place blocks'),
            h('li', null, 'Tap “Open” near a beacon or console'))
        : h('ul', { class: 'controls-list' },
            h('li', null, h('kbd', null, 'WASD'), ' move · ', h('kbd', null, 'Mouse'), ' look · ', h('kbd', null, 'Space'), ' jump / swim (double-tap to fly)'),
            h('li', null, h('kbd', null, 'E'), ' open lesson or lab · ', h('kbd', null, 'G'), ' guide · ', h('kbd', null, 'M'), ' map · ', h('kbd', null, 'B'), ' build · ', h('kbd', null, 'H'), ' hub'),
            h('li', null, h('kbd', null, 'V'), ' third-person camera · ', h('kbd', null, 'P'), ' photo mode · ', h('kbd', null, '1–9'), ' pick block'),
            h('li', null, h('kbd', null, 'Q'), ' earn block credits · ', h('kbd', null, 'Shift+M'), ' switch to a normal mouse cursor (and back)'),
            h('li', null, h('kbd', null, 'Left click'), ' break (or paint in the Cathedral) · ', h('kbd', null, 'Right click'), ' place · ', h('kbd', null, 'Esc'), ' free the mouse'),
          ),
      h('div', { class: 'cta-row' },
        h('button', { class: 'btn btn-primary btn-lg', onclick: play }, isTouch ? 'Play' : 'Click to play'),
        first ? h('button', { class: 'btn btn-lg', onclick: () => { setOnboarded(); startTour(); } }, '🎥 Take the tour first') : null,
        first ? h('button', { class: 'btn btn-lg btn-ghost', onclick: () => {
          play();
          const firstLesson = lessonsIn('foundations')[0];
          engine?.teleport(firstLesson.id);
          openLesson(firstLesson);
        } }, 'Go to lesson 1') : null,
      ),
    ),
  );
}

async function startTour() {
  if (!engine || stopTour) return;
  audio.unlock();
  hud.start.hidden = true;
  closePanel(false);
  root!.classList.add('touring');
  const { playTour } = await import('../../sims/tour');
  engine.setLetterbox(0.1);
  hud.caption.hidden = false;
  hud.caption.replaceChildren(h('button', { class: 'btn small tour-skip', onclick: () => stopTour?.() }, 'Skip ▸'));
  const captionText = h('div', { class: 'tour-text' });
  hud.caption.prepend(captionText);
  stopTour = playTour(engine, (title, sub) => {
    captionText.classList.remove('show');
    void captionText.offsetWidth;
    captionText.replaceChildren(title ? h('h2', null, title) : '', sub ? h('p', null, sub) : '');
    if (title) captionText.classList.add('show');
  }, () => {
    stopTour = null;
    engine?.setLetterbox(0);
    hud.caption.hidden = true;
    root!.classList.remove('touring');
    showStart(false);
  });
}

function openPanel(content: { el: HTMLElement; destroy?: () => void }, wide = false) {
  closePanel(false);
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
    if (isTouch || engine?.freeCursor) hud.start.hidden = true;
    else showStart(false);
  }
}

function openLesson(lesson: Lesson) {
  const view = lessonView(lesson, {
    mode: 'world',
    onVisualize: (l, ops) => engine?.showOnPad(l.realm, ops),
    onPassed: (l, reward) => {
      engine?.refreshStation(l.id);
      if (reward.firstTime) {
        engine?.celebrateStation(l.id);
        if (reward.levelUp) audio.levelUp();
        else audio.success();
      }
    },
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
  if (Math.hypot(site.x - p.x, site.z - p.z) > 30) engine.teleport(realm);
  engine.lookAt(site.x + 0.5, engine.player.pos.y + 1, site.z + 0.5);
  engine.player.pitch = -0.28;
}

function openBuilder() {
  const view = builderView({
    onBuild: (ops, shapes) => engine?.build(ops, shapes) ?? { blocks: 0, shapes: 0, cost: 0 },
    onEarn: () => openChallenges(),
    onUndo: () => engine?.undoBuild() ?? 0,
  });
  openPanel(view, true);
}

function openChallenges(tab?: 'quiz' | 'math' | 'code') {
  const view = challengeView({
    onReward: () => {
      audio.success();
      const p = engine?.player.pos;
      if (p && engine) engine.celebrate(p.x, p.y + 5, p.z, undefined, 1);
    },
  }, tab);
  openPanel(view, true);
}

function openForge() {
  // The world is already a 3D scene, so the panel opens on the lighter 2D diagrams (3D is one click away).
  const view = forgeView({ view: '2d', onPad: (ops) => engine?.showOnPad('neural', ops, false) });
  openPanel(view, true);
  if (engine && engine.place === 'neural') lookAtPad('neural');
}

function openLab(kind: LabKind) {
  if (!labs || !engine) return;
  import('../../sims').then(({ labPanel }) => {
    const view = labPanel(labs!, kind, () => engine!.player.pos);
    openPanel(view, true);
  });
}

function openFlock() {
  if (!labs) return;
  openPanel(labs.flock.panel());
}

function openSettings() {
  if (!engine) return;
  const view = settingsView({
    quality: () => engine!.quality,
    fps: () => engine!.fps,
    resetWorld: () => engine!.resetWorld(),
    tour: () => startTour(),
  });
  openPanel(view);
}

function togglePhoto() {
  if (!root || !engine) return;
  const on = !root.classList.contains('photo');
  root.classList.toggle('photo', on);
  hud.photo.hidden = !on;
  if (on) {
    hud.photo.replaceChildren(
      h('span', null, '📷 Photo mode — the HUD is hidden. '),
      h('button', { class: 'btn small', onclick: () => {
        const url = engine!.screenshot();
        const a = h('a', { href: url, download: `neuralcraft-${Date.now()}.png` });
        a.click();
        toast('📸 Saved!', 'Your screenshot was downloaded.', 'success', 2500);
      } }, '💾 Save screenshot'),
      h('button', { class: 'btn small btn-ghost', onclick: () => togglePhoto() }, 'Exit (P)'),
    );
  }
}

function nextUnfinished(): Lesson | undefined {
  let l: Lesson | undefined = lessonsIn('foundations')[0];
  while (l && isDone(l.id)) l = nextLesson(l.id);
  return l;
}

function guideToNext() {
  if (!engine || !labs) return;
  const l = nextUnfinished();
  if (!l) {
    labs.nova.say(['You finished every lesson! 🎓', 'Try the labs — press M'], 6);
    return;
  }
  const s = STATION_BY_LESSON.get(l.id)!;
  labs.nova.guide(engine.player.pos, { x: s.x, z: s.z }, l.title);
}

function openMap() {
  engine?.unlock();
  hud.start.hidden = true;
  const teleport = (t: string) => {
    hud.map.close();
    engine?.teleport(t);
    audio.portal();
    if (!isTouch) engine?.lock();
  };
  const navigate = (x: number, z: number, name: string) => {
    hud.map.close();
    if (engine && labs) labs.nova.guide(engine.player.pos, { x, z }, name);
    if (!isTouch) engine?.lock();
  };
  hud.map.replaceChildren(
    h('form', { method: 'dialog', class: 'map-card' },
      h('header', { class: 'map-head' }, h('h2', null, '🗺 Map'), h('button', { class: 'panel-close', value: 'close', 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'lesson-actions' },
        h('button', { type: 'button', class: 'map-hub', onclick: () => teleport('hub') }, '✦ Teleport to the Hub'),
        h('button', { type: 'button', class: 'btn', onclick: () => { hud.map.close(); startTour(); } }, '🎥 Cinematic tour'),
        h('button', { type: 'button', class: 'btn', onclick: () => teleport('playground') }, '🏗 Your Playground'),
      ),
      h('h3', null, '🔬 Live AI labs'),
      h('div', { class: 'map-labs' }, LAB_SITES.map((l) =>
        h('div', { class: 'map-lab', style: { '--realm': REALM_BY_ID.get(l.realm)!.color } as Partial<CSSStyleDeclaration> },
          h('b', null, LAB_NAMES[l.kind]),
          h('div', null,
            h('button', { type: 'button', class: 'linklike', onclick: () => teleport(l.kind) }, 'Teleport'),
            ' · ',
            h('button', { type: 'button', class: 'linklike', onclick: () => navigate(l.console.x, l.console.z, LAB_NAMES[l.kind]) }, 'Walk there with Nova'),
          ),
        ))),
      h('h3', null, '📚 Realms & lessons'),
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
    ),
  );
  hud.map.showModal();
}

// ---------------------------------------------------------------- touch

function addTouchControls(e: Engine) {
  const stick = h('div', { class: 'touch-stick' }, h('div', { class: 'knob' }));
  const btn = (label: string, fn: () => void, hold?: (down: boolean) => void) => {
    const b = h('button', { class: 'touch-btn' }, label);
    b.addEventListener('touchstart', (ev) => { ev.preventDefault(); audio.unlock(); fn(); hold?.(true); }, { passive: false });
    b.addEventListener('touchend', (ev) => { ev.preventDefault(); hold?.(false); }, { passive: false });
    return b;
  };
  const buttons = h('div', { class: 'touch-buttons' },
    btn('⤒', () => {}, (d) => { e.input.jump = d; }),
    btn('✈', () => e.toggleFly()),
    btn('⛏', () => e.breakBlock()),
    btn('▣', () => e.placeBlock()),
    btn('⤓', () => {}, (d) => { e.input.descend = d; }),
    btn('🧭', () => guideToNext()),
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
