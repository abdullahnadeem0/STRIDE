import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BITS,
  FLAVORS,
  HERO_BITS,
  INSIDE_STEPS,
  INTRO_VIDEO_URL,
  clamp,
  cubicBezierSolver,
  hexToRgba,
  seededRand,
  spriteStyle,
} from './data/stride';
import {
  createStrideGL,
  getArcBarState,
  getHeroMetrics,
  type BarState,
  type StrideGLController,
} from './three/strideScene';

const easeSlide = cubicBezierSolver(0.25, 0.75, 0.2, 1);
const easeEnter = cubicBezierSolver(0.16, 1, 0.3, 1);

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpBarState(a: BarState, b: BarState, t: number): BarState {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    h: lerp(a.h, b.h, t),
    rz: lerp(a.rz, b.rz, t),
    ry: lerp(a.ry, b.ry, t),
    rx: lerp(a.rx, b.rx, t),
    z: lerp(a.z, b.z, t),
    op: lerp(a.op, b.op, t),
    sx: lerp(a.sx, b.sx, t),
    sy: lerp(a.sy, b.sy, t),
    shadow: lerp(a.shadow, b.shadow, t),
  };
}

function StrideMark({ className = '', inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="18" fill={inverted ? '#f0e8e0' : '#1c1a1f'} />
      <path
        d="M8 24.5L14.5 13.5L19.5 21L23 16L28 24.5H8Z"
        fill={inverted ? '#1c1a1f' : '#f0e8e0'}
      />
    </svg>
  );
}

function StepIcon({ index }: { index: number }) {
  if (index === 0) {
    // Leaf
    return (
      <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 5C12.5 5 6.5 9.5 6 18.5C15 19 20.5 13.5 21 5Z" />
        <path d="M5 21C8.5 17.5 12.5 13.5 17.5 9.5" />
      </svg>
    );
  }
  if (index === 1) {
    // Four grains
    return (
      <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <ellipse cx="9" cy="9" rx="2.6" ry="4.2" transform="rotate(-30 9 9)" />
        <ellipse cx="17" cy="9" rx="2.6" ry="4.2" transform="rotate(30 17 9)" />
        <ellipse cx="9" cy="17" rx="2.6" ry="4.2" transform="rotate(30 9 17)" />
        <ellipse cx="17" cy="17" rx="2.6" ry="4.2" transform="rotate(-30 17 17)" />
      </svg>
    );
  }
  if (index === 2) {
    // Heart
    return (
      <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 21.2C13 21.2 4.5 15.8 4.5 9.8C4.5 7 6.7 5 9.3 5C11 5 12.3 5.9 13 7.2C13.7 5.9 15 5 16.7 5C19.3 5 21.5 7 21.5 9.8C21.5 15.8 13 21.2 13 21.2Z" />
      </svg>
    );
  }
  // Bolt
  return (
    <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 3.5L6.5 14.5H13L11.5 22.5L19.5 11.5H13L14.5 3.5Z" />
    </svg>
  );
}

interface TitleSwapState {
  current: number;
  outgoing: number | null;
  dir: number;
  swapKey: number;
}

export default function App() {
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  // Intro state
  const [introStage, setIntroStage] = useState<'video' | 'stamp' | 'done'>(
    reducedMotion ? 'done' : 'video'
  );
  const [heroEntered, setHeroEntered] = useState<boolean>(reducedMotion);

  // Hero state (starts on Berry Oat = index 1, counter "02")
  const [activeFlavor, setActiveFlavor] = useState<number>(1);
  const [counterText, setCounterText] = useState<string>('02');
  const [autoplay, setAutoplay] = useState<boolean>(!reducedMotion);
  const [titleState, setTitleState] = useState<TitleSwapState>({
    current: 1,
    outgoing: null,
    dir: 1,
    swapKey: 0,
  });
  const [titleFontSize, setTitleFontSize] = useState<number>(64);

  // Section 2 state
  const [insideStep, setInsideStep] = useState<number>(0);
  const [shownStep, setShownStep] = useState<number>(0);
  const [shownStepFlavor, setShownStepFlavor] = useState<number>(1);

  // Section 3 reveal
  const [shopRevealed, setShopRevealed] = useState<boolean>(false);

  // Section 4 builder state
  const [packSlots, setPackSlots] = useState<(number | null)[]>([null, null, null]);
  const [glowColor, setGlowColor] = useState<string>('rgba(148, 189, 180, 0.72)');
  const [buyAdded, setBuyAdded] = useState<boolean>(false);
  const [rangeHeadRevealed, setRangeHeadRevealed] = useState<boolean>(false);

  // Cart & Nav state
  const [cartCount, setCartCount] = useState<number>(0);
  const [badgePopKey, setBadgePopKey] = useState<number>(0);
  const [bagBumpKey, setBagBumpKey] = useState<number>(0);
  const [activeNav, setActiveNav] = useState<'flavors' | 'inside' | 'shop' | 'range'>('flavors');
  const [navMode, setNavMode] = useState<'default' | 'light' | 'dark'>('default');
  const [navHiStyle, setNavHiStyle] = useState<{ left: number; width: number }>({ left: 5, width: 80 });
  const [webglActive, setWebglActive] = useState<boolean>(false);
  const [dibsNotice, setDibsNotice] = useState<boolean>(false);

  // DOM refs
  const introRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const outTitleLayerRef = useRef<HTMLDivElement>(null);
  const inTitleLayerRef = useRef<HTMLDivElement>(null);
  const bitRefs = useRef<(HTMLDivElement | null)[]>([]);

  const insideRef = useRef<HTMLElement>(null);
  const inDarkRef = useRef<HTMLDivElement>(null);
  const inBackFrameRef = useRef<HTMLDivElement>(null);
  const inFrontRef = useRef<HTMLDivElement>(null);
  const inFrontFrameRef = useRef<HTMLDivElement>(null);
  const inBarRef = useRef<HTMLDivElement>(null);
  const inNumRef = useRef<HTMLDivElement>(null);
  const inHeadRef = useRef<HTMLHeadingElement>(null);
  const inCapRef = useRef<HTMLParagraphElement>(null);
  const stormRefs = useRef<(HTMLDivElement | null)[]>([]);

  const shopRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cardPkRefs = useRef<(HTMLDivElement | null)[]>([]);

  const rangeRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const slotBarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bagBtnRef = useRef<HTMLButtonElement>(null);
  const navPillRef = useRef<HTMLDivElement>(null);
  const navLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // Mutable animation state (no React re-render per frame)
  const simRef = useRef({
    pos: reducedMotion ? 1 : -2.6,
    target: 1,
    activeIdx: 1,
    slideTween: null as null | {
      start: number;
      dur: number;
      from: number;
      to: number;
      dir: number;
      triggered12: boolean;
      useEnterCurve?: boolean;
    },
    revealAnim: null as null | {
      start: number;
      dur: number;
      color: string;
    },
    flipAngle: 0,
    flipTween: null as null | {
      start: number;
      dur: number;
      from: number;
      to: number;
    },
    pokeTween: null as null | {
      start: number;
      dur: number;
    },
    liveTiltX: 0,
    liveTiltY: 0,
    lastInteraction: performance.now(),
    isDragging: false,
    autoplay: !reducedMotion,
    heroEntered: reducedMotion,
    insideStep: 0,
    phoneShopCentered: false,
    smoothActive: false,
    smoothTarget: 0,
    smoothCurrent: 0,
    lastFrameTime: performance.now(),
    userTouchedPack: false,
    autoFilledPack: false,
  });

  // Keep refs synced with React state
  useEffect(() => {
    simRef.current.autoplay = autoplay;
  }, [autoplay]);

  useEffect(() => {
    simRef.current.heroEntered = heroEntered;
  }, [heroEntered]);

  // Pre-seeded 20 storm pieces
  const stormSeeds = useMemo(() => {
    const rand = seededRand(4242);
    return Array.from({ length: 20 }, (_, i) => ({
      useActiveBit: i % 10 < 7,
      randomBit: Math.floor(rand() * 5),
      angle: rand() * Math.PI * 2,
      ph: i / 20 + rand() * 0.03,
      spin: (rand() < 0.5 ? -1 : 1) * (240 + rand() * 120),
      sizeFactor: 0.7 + rand() * 0.7,
    }));
  }, []);

  // Measure title font size cleanly
  const computeTitleFontSize = useCallback((flavorIdx: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const heroH = heroRef.current?.clientHeight || vh;
    const name = FLAVORS[flavorIdx].name.toUpperCase();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '400 100px "Archivo Black", sans-serif';

    if (vw < 820) {
      const words = name.split(' ');
      let maxW = 100;
      for (const word of words) {
        maxW = Math.max(maxW, ctx.measureText(word).width);
      }
      const base = Math.max(40, Math.min(64, vw * 0.125));
      const landscape = window.innerHeight <= 460;
      const capped = landscape ? Math.min(36, base) : base;
      const fit = ((vw - 36) * 100) / maxW;
      setTitleFontSize(Math.min(capped, fit));
    } else {
      const u = Math.min(vw / 1440, heroH / 900);
      const w = Math.max(100, ctx.measureText(name).width);
      const fit = (760 * u * 100) / w;
      setTitleFontSize(Math.min(96 * u, fit));
    }
  }, []);

  useEffect(() => {
    computeTitleFontSize(titleState.current);
    document.fonts.ready.then(() => computeTitleFontSize(simRef.current.activeIdx));
    const onResize = () => computeTitleFontSize(simRef.current.activeIdx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computeTitleFontSize, titleState.current]);

  // Intro & Hero entrance orchestration
  const enterHero = useCallback(() => {
    if (simRef.current.heroEntered) return;
    simRef.current.heroEntered = true;
    setHeroEntered(true);
    setIntroStage('done');
    document.body.classList.remove('locked');

    const now = performance.now();
    simRef.current.lastInteraction = now;

    if (!reducedMotion) {
      simRef.current.pos = -2.6;
      simRef.current.target = 1;
      simRef.current.slideTween = {
        start: now,
        dur: 1700,
        from: -2.6,
        to: 1,
        dir: 1,
        triggered12: true,
        useEnterCurve: true,
      };
    } else {
      simRef.current.pos = 1;
      simRef.current.target = 1;
    }

    // Animate floating hero bits
    bitRefs.current.forEach((el, i) => {
      if (!el) return;
      const def = HERO_BITS[i];
      if (reducedMotion) {
        el.style.opacity = '0.55';
        return;
      }
      el.animate([{ opacity: 0 }, { opacity: 0.6 }], {
        duration: 900,
        delay: 300 + 90 * i,
        fill: 'forwards',
        easing: 'ease-out',
      });
      const dx = (i % 2 === 0 ? 1 : -1) * (12 + (i % 3));
      const dy = -(22 + 3 * i);
      const drot = (i % 2 === 0 ? 1 : -1) * (10 + (i % 3));
      el.animate(
        [
          { transform: 'translate(0px, 0px) rotate(0deg)' },
          { transform: `translate(${dx}px, ${dy}px) rotate(${drot}deg)` },
          { transform: 'translate(0px, 0px) rotate(0deg)' },
        ],
        {
          duration: 7000 + 900 * i,
          iterations: Infinity,
          easing: 'ease-in-out',
          composite: 'add',
        }
      );
    });
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      document.body.classList.remove('locked');
      enterHero();
      return;
    }

    document.body.classList.add('locked');
    const vid = videoRef.current;
    let stamped = false;
    let startedPlaying = false;
    let stampTimeout = 0;
    let exitTimeout = 0;
    let noStartTimeout = 0;
    let failsafeTimeout = 0;

    const triggerStamp = () => {
      if (stamped || simRef.current.heroEntered) return;
      stamped = true;
      window.clearTimeout(stampTimeout);
      window.clearTimeout(noStartTimeout);
      if (vid) {
        try {
          vid.pause();
        } catch {
          // ignore
        }
      }
      setIntroStage('stamp');
      exitTimeout = window.setTimeout(() => {
        enterHero();
      }, 380 + 650);
    };

    const startPlayback = () => {
      if (!vid || stamped || simRef.current.heroEntered) return;
      try {
        if (vid.currentTime < 0.55) {
          vid.currentTime = 0.55;
        }
        const p = vid.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            startedPlaying = true;
          }).catch(() => {
            triggerStamp();
          });
        } else {
          startedPlaying = true;
        }
      } catch {
        triggerStamp();
      }
    };

    const onCanPlay = () => startPlayback();
    const onPlaying = () => {
      startedPlaying = true;
      window.clearTimeout(noStartTimeout);
    };
    const onTimeUpdate = () => {
      if (vid && vid.currentTime >= 0.55) startedPlaying = true;
      if (vid && vid.currentTime >= 4.6) {
        triggerStamp();
      }
    };
    const onEnded = () => triggerStamp();
    const onError = () => triggerStamp();

    if (vid) {
      vid.addEventListener('canplay', onCanPlay, { once: true });
      vid.addEventListener('playing', onPlaying);
      vid.addEventListener('timeupdate', onTimeUpdate);
      vid.addEventListener('ended', onEnded);
      vid.addEventListener('error', onError);
      if (vid.readyState >= 3) {
        startPlayback();
      }
    }

    noStartTimeout = window.setTimeout(() => {
      if (!startedPlaying) triggerStamp();
    }, 3500);

    failsafeTimeout = window.setTimeout(() => {
      enterHero();
    }, 9000);

    return () => {
      window.clearTimeout(stampTimeout);
      window.clearTimeout(exitTimeout);
      window.clearTimeout(noStartTimeout);
      window.clearTimeout(failsafeTimeout);
      if (vid) {
        vid.removeEventListener('canplay', onCanPlay);
        vid.removeEventListener('playing', onPlaying);
        vid.removeEventListener('timeupdate', onTimeUpdate);
        vid.removeEventListener('ended', onEnded);
        vid.removeEventListener('error', onError);
      }
    };
  }, [enterHero, reducedMotion]);

  // Finish any active color reveal immediately
  const finishRevealNow = useCallback(() => {
    const rev = simRef.current.revealAnim;
    const revEl = revealRef.current;
    if (rev) {
      document.documentElement.style.setProperty('--flav', rev.color);
      simRef.current.revealAnim = null;
    }
    if (revEl) {
      revEl.style.setProperty('--rv', 'transparent');
      revEl.style.maskImage = 'none';
      revEl.style.webkitMaskImage = 'none';
    }
  }, []);

  // Trigger flavor swap visuals (color reveal, title letter-rise, counter crossfade, step 04 headline)
  const triggerFlavorSwap = useCallback(
    (newIdx: number, dir: number) => {
      const color = FLAVORS[newIdx].color;
      simRef.current.activeIdx = newIdx;
      setActiveFlavor(newIdx);
      computeTitleFontSize(newIdx);

      if (reducedMotion) {
        document.documentElement.style.setProperty('--flav', color);
        setCounterText(`0${newIdx + 1}`);
        setTitleState((prev) => ({
          current: newIdx,
          outgoing: null,
          dir,
          swapKey: prev.swapKey + 1,
        }));
        setShownStepFlavor(newIdx);
        return;
      }

      // 1. Color reveal circle
      finishRevealNow();
      if (revealRef.current) {
        revealRef.current.style.setProperty('--rv', color);
      }
      simRef.current.revealAnim = {
        start: performance.now(),
        dur: 420,
        color,
      };

      // 2. Title swap
      setTitleState((prev) => ({
        current: newIdx,
        outgoing: prev.current,
        dir,
        swapKey: prev.swapKey + 1,
      }));

      // 3. Counter crossfade
      const cEl = countRef.current;
      if (cEl) {
        cEl.animate(
          [
            { translate: '0 0px', opacity: 1 },
            { translate: '0 -10px', opacity: 0 },
          ],
          { duration: 220, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
        );
        window.setTimeout(() => {
          setCounterText(`0${newIdx + 1}`);
          cEl.animate(
            [
              { translate: '0 14px', opacity: 0 },
              { translate: '0 0px', opacity: 1 },
            ],
            { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
          );
        }, 60);
      } else {
        setCounterText(`0${newIdx + 1}`);
      }

      // 4. Section 2 step 04 headline fade
      if (simRef.current.insideStep === 3 && inHeadRef.current) {
        const hEl = inHeadRef.current;
        hEl.animate(
          [
            { opacity: 1, translate: '0 0px' },
            { opacity: 0, translate: '0 -10px' },
          ],
          { duration: 200, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
        );
        window.setTimeout(() => {
          setShownStepFlavor(newIdx);
          hEl.animate(
            [
              { opacity: 0, translate: '0 14px' },
              { opacity: 1, translate: '0 0px' },
            ],
            { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
          );
        }, 120);
      } else {
        setShownStepFlavor(newIdx);
      }
    },
    [computeTitleFontSize, finishRevealNow, reducedMotion]
  );

  // Animate title letters whenever swapKey changes
  useEffect(() => {
    if (titleState.swapKey === 0 || reducedMotion) return;
    const dir = titleState.dir >= 0 ? 1 : -1;

    if (outTitleLayerRef.current) {
      const chars = outTitleLayerRef.current.querySelectorAll<HTMLElement>('.title-char');
      chars.forEach((ch, idx) => {
        ch.animate(
          [
            { transform: 'translateY(0%)', opacity: 1 },
            { transform: `translateY(${dir > 0 ? '-110%' : '110%'})`, opacity: 0 },
          ],
          {
            duration: 300,
            delay: idx * 11,
            easing: 'cubic-bezier(.45,0,.75,.3)',
            fill: 'forwards',
          }
        );
      });
    }

    if (inTitleLayerRef.current) {
      const chars = inTitleLayerRef.current.querySelectorAll<HTMLElement>('.title-char');
      chars.forEach((ch, idx) => {
        ch.animate(
          [
            { transform: `translateY(${dir > 0 ? '110%' : '-110%'})`, opacity: 0 },
            { transform: 'translateY(0%)', opacity: 1 },
          ],
          {
            duration: 620,
            delay: 120 + idx * 22,
            easing: 'cubic-bezier(.22,1,.36,1)',
            fill: 'forwards',
          }
        );
      });
    }
  }, [titleState, reducedMotion]);

  // Slide carousel to a target integer slot
  const goTo = useCallback(
    (nextTarget: number, durationOverride?: number) => {
      const sim = simRef.current;
      const now = performance.now();
      sim.lastInteraction = now;

      const prevTarget = sim.target;
      const dir = nextTarget >= prevTarget ? 1 : -1;
      const newIdx = ((nextTarget % 5) + 5) % 5;
      sim.target = nextTarget;

      if (reducedMotion) {
        sim.pos = nextTarget;
        if (newIdx !== sim.activeIdx) {
          triggerFlavorSwap(newIdx, dir);
        }
        return;
      }

      const dist = Math.abs(nextTarget - sim.pos);
      const dur = durationOverride ?? 650 + 160 * Math.max(0, dist - 1);
      const sameFlavor = newIdx === sim.activeIdx;

      sim.slideTween = {
        start: now,
        dur,
        from: sim.pos,
        to: nextTarget,
        dir,
        triggered12: sameFlavor,
      };
    },
    [reducedMotion, triggerFlavorSwap]
  );

  // Trigger soft crossfade for Section 2 text when step changes
  const triggerStepTextSwap = useCallback(
    (newStep: number) => {
      if (reducedMotion) {
        setShownStep(newStep);
        return;
      }
      const targets = [inNumRef.current, inHeadRef.current, inCapRef.current];
      targets.forEach((el) => {
        if (!el) return;
        el.animate(
          [
            { translate: '0 0px', opacity: 1 },
            { translate: '0 -10px', opacity: 0 },
          ],
          { duration: 240, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
        );
      });
      window.setTimeout(() => {
        setShownStep(newStep);
        setShownStepFlavor(simRef.current.activeIdx);
        targets.forEach((el) => {
          if (!el) return;
          el.animate(
            [
              { translate: '0 14px', opacity: 0 },
              { translate: '0 0px', opacity: 1 },
            ],
            { duration: 460, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
          );
        });
      }, 280);
    },
    [reducedMotion]
  );

  // WebGL initialization & Main Animation Loop
  const glRef = useRef<StrideGLController | null>(null);

  useEffect(() => {
    const canvas = document.getElementById('gl') as HTMLCanvasElement | null;
    if (!canvas) return;

    let cancelled = false;
    let rafId = 0;

    const handleResize = () => {
      glRef.current?.resize(window.innerWidth, window.innerHeight);
    };

    createStrideGL(canvas).then((ctrl) => {
      if (cancelled) {
        ctrl?.dispose();
        return;
      }
      if (!ctrl) {
        setWebglActive(false);
        return;
      }
      glRef.current = ctrl;
      setWebglActive(true);
      document.documentElement.classList.add('gl');
      window.addEventListener('resize', handleResize);

      const tick = () => {
        if (cancelled) return;
        const now = performance.now();
        const sim = simRef.current;
        const dt = Math.min(64, Math.max(1, now - sim.lastFrameTime));
        sim.lastFrameTime = now;

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // 1. Desktop smooth scroll
        if (sim.smoothActive && !reducedMotion && !document.body.classList.contains('locked')) {
          sim.smoothCurrent += (sim.smoothTarget - sim.smoothCurrent) * (1 - Math.exp(-dt / 120));
          window.scrollTo(0, sim.smoothCurrent);
          if (Math.abs(sim.smoothTarget - sim.smoothCurrent) < 0.5) {
            window.scrollTo(0, sim.smoothTarget);
            sim.smoothActive = false;
          }
        }

        // 2. Slide tween
        if (sim.slideTween) {
          const st = sim.slideTween;
          const t = clamp((now - st.start) / Math.max(1, st.dur), 0, 1);
          const e = st.useEnterCurve ? easeEnter(t) : easeSlide(t);
          sim.pos = lerp(st.from, st.to, e);
          if (!st.triggered12 && t >= 0.12) {
            st.triggered12 = true;
            const newIdx = ((Math.round(st.to) % 5) + 5) % 5;
            if (newIdx !== sim.activeIdx) {
              triggerFlavorSwap(newIdx, st.dir);
            }
          }
          if (t >= 1) {
            sim.pos = st.to;
            sim.slideTween = null;
          }
        }

        // 3. Color reveal circle
        const heroEl = heroRef.current;
        const heroH = heroEl?.clientHeight || vh;
        const heroMetrics = getHeroMetrics(vw, vh, heroH);

        if (sim.revealAnim && revealRef.current && heroEl) {
          const rev = sim.revealAnim;
          const t = clamp((now - rev.start) / rev.dur, 0, 1);
          const e = easeSlide(t);
          const maxDist = Math.max(
            Math.hypot(heroMetrics.cx, heroMetrics.cy),
            Math.hypot(vw - heroMetrics.cx, heroMetrics.cy),
            Math.hypot(heroMetrics.cx, heroH - heroMetrics.cy),
            Math.hypot(vw - heroMetrics.cx, heroH - heroMetrics.cy)
          );
          const R = 1.45 * maxDist;
          const r = R * e;
          const f = Math.max(60, 0.35 * r);
          const mask = `radial-gradient(circle at ${heroMetrics.cx}px ${heroMetrics.cy}px, #000 ${Math.max(0, r - f)}px, transparent ${r}px)`;
          revealRef.current.style.maskImage = mask;
          revealRef.current.style.webkitMaskImage = mask;
          if (t >= 1) {
            finishRevealNow();
          }
        }

        // 4. Autoplay check
        if (
          sim.autoplay &&
          sim.heroEntered &&
          !sim.isDragging &&
          !sim.slideTween &&
          document.visibilityState === 'visible' &&
          heroEl
        ) {
          const hr = heroEl.getBoundingClientRect();
          const visH = Math.max(0, Math.min(hr.bottom, vh) - Math.max(hr.top, 0));
          if (visH / Math.max(1, hr.height) >= 0.6 && now - sim.lastInteraction >= 3200) {
            sim.lastInteraction = now;
            goTo(sim.target + 1);
          }
        }

        // 5. Section 2 scroll mapping, pin, flip, and storm
        const insideEl = insideRef.current;
        const shopEl = shopRef.current;
        let p1 = 0;
        let p3 = 0;
        let stormQ = 0;

        if (insideEl) {
          const ir = insideEl.getBoundingClientRect();
          p1 = clamp(1 - ir.top / vh, 0, 1);

          const p = clamp(-ir.top / Math.max(1, ir.height - vh), 0, 1);
          const step = Math.floor(Math.min(p, 0.759) / 0.19);
          stormQ = reducedMotion ? 0 : clamp((p - 0.76) / 0.24, 0, 1);

          if (step !== sim.insideStep) {
            sim.insideStep = step;
            setInsideStep(step);
            const targetRy = INSIDE_STEPS[step].ry;
            if (reducedMotion) {
              sim.flipAngle = targetRy;
              sim.flipTween = null;
              setShownStep(step);
              setShownStepFlavor(sim.activeIdx);
            } else {
              const halfTurns = clamp(Math.abs(targetRy - sim.flipAngle) / 180, 0.4, 2);
              const dur = 720 * halfTurns;
              sim.flipTween = {
                start: now,
                dur,
                from: sim.flipAngle,
                to: targetRy,
              };
              const swapDelay = 0.38 * Math.min(dur, 720);
              window.setTimeout(() => {
                if (simRef.current.insideStep === step) {
                  triggerStepTextSwap(step);
                }
              }, swapDelay);
            }
          }

          if (sim.flipTween) {
            const ft = sim.flipTween;
            const t = clamp((now - ft.start) / Math.max(1, ft.dur), 0, 1);
            const e = -(Math.cos(Math.PI * t) - 1) / 2;
            sim.flipAngle = lerp(ft.from, ft.to, e);
            if (t >= 1) {
              sim.flipAngle = ft.to;
              sim.flipTween = null;
            }
          }

          // Scale frames for section 2
          const isPhone = vw < 820;
          const frameK = isPhone ? Math.min(vw / 390, vh / 780) : Math.min(vw / 1440, vh / 900);
          const frameTransform = `translate(-50%, -50%) scale(${frameK})`;
          if (inBackFrameRef.current) inBackFrameRef.current.style.transform = frameTransform;
          if (inFrontFrameRef.current) inFrontFrameRef.current.style.transform = frameTransform;

          // Front fixed layer pin
          if (inFrontRef.current) {
            const visible = ir.bottom > 0 && ir.top < vh;
            inFrontRef.current.style.visibility = visible ? 'visible' : 'hidden';
            if (visible) {
              const pinY = ir.top > 0 ? ir.top : ir.bottom < vh ? ir.bottom - vh : 0;
              inFrontRef.current.style.transform = `translateY(${pinY}px)`;
            }
          }

          // Storm dimming & fade
          const frontFade = 1 - clamp(4 * stormQ, 0, 1);
          if (inFrontFrameRef.current) inFrontFrameRef.current.style.opacity = String(frontFade);
          if (inNumRef.current) inNumRef.current.style.opacity = String(frontFade);
          if (inDarkRef.current) {
            inDarkRef.current.style.opacity = String(clamp(3.5 * stormQ, 0, 1) * 0.42);
          }

          // Storm 20 ingredient pieces
          const R = 0.55 * Math.hypot(vw, vh);
          const baseSize = 0.085 * Math.min(vw, vh);
          const activeBit = FLAVORS[sim.activeIdx].bit;

          stormRefs.current.forEach((el, i) => {
            if (!el) return;
            if (reducedMotion || stormQ <= 0 || stormQ >= 1) {
              el.style.opacity = '0';
              return;
            }
            const seed = stormSeeds[i];
            const s = clamp((stormQ - 0.45 * seed.ph) / 0.55, 0, 1);
            if (s <= 0 || s >= 1) {
              el.style.opacity = '0';
              return;
            }
            const bitIdx = seed.useActiveBit ? activeBit : seed.randomBit;
            const style = spriteStyle(BITS[bitIdx], 0);
            el.style.backgroundSize = style.backgroundSize as string;
            el.style.backgroundPosition = style.backgroundPosition as string;

            const sz = baseSize * seed.sizeFactor;
            const radius = (0.06 + Math.pow(s, 1.5) * 0.95) * R;
            const x = vw / 2 + Math.cos(seed.angle) * radius;
            const y = vh / 2 + Math.sin(seed.angle) * radius * 0.8;
            const sc = 0.2 + 1.7 * s;
            const rot = seed.spin * s;
            const op = Math.sin(Math.PI * s) * clamp(5 * stormQ, 0, 1) * clamp(6 * (1 - stormQ), 0, 1);

            el.style.width = `${sz}px`;
            el.style.height = `${sz}px`;
            el.style.transform = `translate(${x - sz / 2}px, ${y - sz / 2}px) scale(${sc}) rotate(${rot}deg)`;
            el.style.opacity = String(op);
          });
        }

        if (shopEl) {
          const sr = shopEl.getBoundingClientRect();
          p3 = clamp((vh - sr.top) / (0.7 * vh), 0, 1);
          if (vw < 820 && p3 > 0 && !sim.phoneShopCentered) {
            sim.phoneShopCentered = true;
            const liveCard = cardRefs.current[sim.activeIdx];
            liveCard?.scrollIntoView({
              behavior: reducedMotion ? 'auto' : 'smooth',
              inline: 'center',
              block: 'nearest',
            });
          } else if (p3 === 0) {
            sim.phoneShopCentered = false;
          }
        }

        // 6. Hero pool bars (11 slots around floor(pos))
        const jT = Math.round(sim.target);
        const baseJ = Math.floor(sim.pos) - 5;
        const heroOtherFade = 1 - clamp(1.6 * p1, 0, 1);
        const heroOffsetTop = heroEl ? heroEl.getBoundingClientRect().top : 0;

        for (let pIdx = 0; pIdx < 11; pIdx++) {
          const j = baseJ + pIdx;
          if (j === jT) {
            ctrl.hidePoolBar(pIdx);
            continue;
          }
          const k = j - sim.pos;
          const flavorIdx = ((j % 5) + 5) % 5;
          const state = getArcBarState(k, j, heroMetrics, now, reducedMotion);
          state.y += heroOffsetTop;
          state.op *= heroOtherFade;
          ctrl.updatePoolBar(pIdx, flavorIdx, j - jT, state);
        }

        // 7. Traveller bar: Hero (A) -> Section 2 (B) -> Live Shop Card (C)
        const stateA = getArcBarState(jT - sim.pos, jT, heroMetrics, now, reducedMotion);
        stateA.y += heroOffsetTop;

        let travellerState = stateA;

        if (p1 > 0 && inBarRef.current) {
          const br = inBarRef.current.getBoundingClientRect();
          const bob = reducedMotion ? 0 : Math.sin((now / 2600) * Math.PI * 2) * 6;
          const stateB: BarState = {
            x: (br.left + br.right) / 2,
            y: (br.top + br.bottom) / 2 + bob,
            h: br.height,
            rz: 14,
            ry: sim.flipAngle + 720 * stormQ,
            rx: 0,
            z: 0,
            op: 1,
            sx: 1,
            sy: 1,
            shadow: 1,
          };
          travellerState = lerpBarState(stateA, stateB, easeInOutQuad(p1));

          if (p3 > 0) {
            const pkEl = cardPkRefs.current[sim.activeIdx];
            if (pkEl) {
              const pr = pkEl.getBoundingClientRect();
              const nearestTurn = Math.round(stateB.ry / 360) * 360;
              let pokeSx = 1;
              let pokeSy = 1;
              if (sim.pokeTween) {
                const pt = clamp((now - sim.pokeTween.start) / sim.pokeTween.dur, 0, 1);
                if (pt < 0.3) {
                  const f = pt / 0.3;
                  pokeSx = lerp(1, 1.06, f);
                  pokeSy = lerp(1, 0.93, f);
                } else if (pt < 0.6) {
                  const f = (pt - 0.3) / 0.3;
                  pokeSx = lerp(1.06, 0.97, f);
                  pokeSy = lerp(0.93, 1.04, f);
                } else {
                  const f = (pt - 0.6) / 0.4;
                  pokeSx = lerp(0.97, 1, f);
                  pokeSy = lerp(1.04, 1, f);
                }
                if (pt >= 1) sim.pokeTween = null;
              }
              const stateC: BarState = {
                x: (pr.left + pr.right) / 2,
                y: (pr.top + pr.bottom) / 2,
                h: pr.height,
                rz: 0,
                ry: nearestTurn + sim.liveTiltX * 14,
                rx: -sim.liveTiltY * 14,
                z: 30,
                op: 1,
                sx: pokeSx,
                sy: pokeSy,
                shadow: 0.7,
              };
              travellerState = lerpBarState(travellerState, stateC, easeInOutQuad(p3));
            }
          }
        }

        ctrl.updateTravellerBar(sim.activeIdx, 0, travellerState);

        // Render frame
        ctrl.renderFrame();

        if (ctrl.isSoftwareGl) {
          ctrl.afterDraw(tick);
        } else {
          rafId = requestAnimationFrame(tick);
        }
      };

      if (ctrl.isSoftwareGl) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      document.documentElement.classList.remove('gl');
      glRef.current?.dispose();
      glRef.current = null;
    };
  }, [finishRevealNow, goTo, reducedMotion, stormSeeds, triggerFlavorSwap, triggerStepTextSwap]);

  // Smooth wheel scroll (desktop only) & ScrollSpy for Nav
  useEffect(() => {
    const updateNavFromScroll = () => {
      const vh = window.innerHeight;
      const sections: ['flavors' | 'inside' | 'shop' | 'range', HTMLElement | null][] = [
        ['flavors', heroRef.current],
        ['inside', insideRef.current],
        ['shop', shopRef.current],
        ['range', rangeRef.current],
      ];

      let active: 'flavors' | 'inside' | 'shop' | 'range' = 'flavors';
      for (const [id, el] of sections) {
        if (el && el.getBoundingClientRect().top <= 0.35 * vh) {
          active = id;
        }
      }
      setActiveNav(active);

      const rangeTop = rangeRef.current?.getBoundingClientRect().top ?? 9999;
      const shopRect = shopRef.current?.getBoundingClientRect();
      if (rangeTop <= 94) {
        setNavMode('dark');
      } else if (shopRect && shopRect.top <= 94 && shopRect.bottom > 40) {
        setNavMode('light');
      } else {
        setNavMode('default');
      }
    };

    updateNavFromScroll();
    window.addEventListener('scroll', updateNavFromScroll, { passive: true });
    window.addEventListener('resize', updateNavFromScroll);

    const onWheel = (e: WheelEvent) => {
      if (reducedMotion || document.body.classList.contains('locked')) return;
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) {
        return;
      }
      e.preventDefault();
      const sim = simRef.current;
      const delta =
        e.deltaMode === 1
          ? e.deltaY * 32
          : e.deltaMode === 2
            ? e.deltaY * window.innerHeight
            : e.deltaY;
      if (!sim.smoothActive) {
        sim.smoothCurrent = window.scrollY;
        sim.smoothTarget = window.scrollY;
      }
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      sim.smoothTarget = clamp(sim.smoothTarget + delta, 0, maxScroll);
      sim.smoothActive = true;
    };

    const stopSmooth = () => {
      simRef.current.smoothActive = false;
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', stopSmooth, { passive: true });
    window.addEventListener('mousedown', stopSmooth, { passive: true });
    window.addEventListener('keydown', stopSmooth, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateNavFromScroll);
      window.removeEventListener('resize', updateNavFromScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', stopSmooth);
      window.removeEventListener('mousedown', stopSmooth);
      window.removeEventListener('keydown', stopSmooth);
    };
  }, [reducedMotion]);

  // Update sliding white highlight inside nav pill
  useEffect(() => {
    const updateHi = () => {
      const link = navLinkRefs.current[activeNav];
      if (!link) return;
      setNavHiStyle({ left: link.offsetLeft, width: link.offsetWidth });
    };
    updateHi();
    document.fonts.ready.then(updateHi);
    window.addEventListener('resize', updateHi);
    return () => window.removeEventListener('resize', updateHi);
  }, [activeNav, heroEntered]);

  // Keyboard navigation in hero (ArrowRight / ArrowLeft)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!heroRef.current || !simRef.current.heroEntered) return;
      const hr = heroRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const visH = Math.max(0, Math.min(hr.bottom, vh) - Math.max(hr.top, 0));
      if (visH < hr.height * 0.5) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(simRef.current.target + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(simRef.current.target - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goTo]);

  // IntersectionObservers for Shop reveal & Builder auto-fill
  useEffect(() => {
    const shopEl = shopRef.current;
    const rangeEl = rangeRef.current;

    const shopObs = shopEl
      ? new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) {
              setShopRevealed(true);
              shopObs?.disconnect();
            }
          },
          { threshold: 0.18 }
        )
      : null;
    if (shopEl && shopObs) shopObs.observe(shopEl);

    let t1 = 0;
    let t2 = 0;
    let t3 = 0;
    const rangeObs = rangeEl
      ? new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) {
              setRangeHeadRevealed(true);
              const sim = simRef.current;
              if (!sim.userTouchedPack && !sim.autoFilledPack) {
                sim.autoFilledPack = true;
                const base = sim.activeIdx;
                const picks = [base, (base + 1) % 5, (base + 2) % 5];
                const fillSlot = (slotIdx: number, flav: number) => {
                  if (simRef.current.userTouchedPack) return;
                  setPackSlots((prev) => {
                    const next = [...prev];
                    next[slotIdx] = flav;
                    return next;
                  });
                  setGlowColor(hexToRgba(FLAVORS[flav].color, 0.72));
                  glowRef.current?.animate([{ opacity: 0.55 }, { opacity: 1 }], {
                    duration: 600,
                    easing: 'cubic-bezier(.22,.8,.24,1)',
                  });
                };
                if (reducedMotion) {
                  setPackSlots(picks);
                  setGlowColor(hexToRgba(FLAVORS[picks[2]].color, 0.72));
                } else {
                  t1 = window.setTimeout(() => fillSlot(0, picks[0]), 250);
                  t2 = window.setTimeout(() => fillSlot(1, picks[1]), 410);
                  t3 = window.setTimeout(() => fillSlot(2, picks[2]), 570);
                }
              }
              rangeObs?.disconnect();
            }
          },
          { threshold: 0.3 }
        )
      : null;
    if (rangeEl && rangeObs) rangeObs.observe(rangeEl);

    return () => {
      shopObs?.disconnect();
      rangeObs?.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [reducedMotion]);

  // Hero drag & raycast pointer handlers
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    pos0: number;
    lastX: number;
    lastT: number;
    v: number;
    dragging: boolean;
  } | null>(null);

  const onArcPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    simRef.current.lastInteraction = performance.now();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      pos0: simRef.current.pos,
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
      dragging: false,
    };
  };

  const onArcPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const now = performance.now();
    simRef.current.lastInteraction = now;

    if (!d) {
      if (e.pointerType === 'mouse' && glRef.current && arcRef.current) {
        const hit = glRef.current.raycastHeroBars(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
        arcRef.current.style.cursor = hit !== null ? 'pointer' : 'grab';
      }
      return;
    }

    const dxTotal = e.clientX - d.startX;
    if (!d.dragging && Math.abs(dxTotal) > 6) {
      d.dragging = true;
      simRef.current.isDragging = true;
      simRef.current.slideTween = null;
      document.body.classList.add('dragging');
      try {
        arcRef.current?.setPointerCapture(d.pointerId);
      } catch {
        // ignore
      }
    }

    if (d.dragging) {
      const heroH = heroRef.current?.clientHeight || window.innerHeight;
      const metrics = getHeroMetrics(window.innerWidth, window.innerHeight, heroH);
      simRef.current.pos = d.pos0 - dxTotal / metrics.slotPx;
      const dt = Math.max(1, now - d.lastT);
      const instV = -(e.clientX - d.lastX) / metrics.slotPx / dt;
      d.v = d.v * 0.6 + instV * 0.4;
      d.lastX = e.clientX;
      d.lastT = now;
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    simRef.current.isDragging = false;
    document.body.classList.remove('dragging');
    try {
      if (arcRef.current?.hasPointerCapture(d.pointerId)) {
        arcRef.current.releasePointerCapture(d.pointerId);
      }
    } catch {
      // ignore
    }

    if (d.dragging) {
      const pos = simRef.current.pos;
      if (cancelled && Math.abs(pos - Math.round(pos)) <= 0.02) {
        return;
      }
      const snapTo = Math.round(pos + clamp(d.v * 220, -2, 2));
      const dur = Math.max(380, 650 * Math.min(1, Math.abs(snapTo - pos) + 0.35));
      goTo(snapTo, dur);
    } else if (!cancelled && glRef.current) {
      const hitK = glRef.current.raycastHeroBars(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
      if (hitK !== null && hitK !== 0) {
        goTo(simRef.current.target + hitK);
      }
    }
  };

  // Cart & Fly-to-cart helper
  const triggerBagEffects = useCallback(() => {
    setCartCount((c) => c + 1);
    setBadgePopKey((k) => k + 1);
    setBagBumpKey((k) => k + 1);
  }, []);

  const flyToCart = useCallback(
    (sourceEl: HTMLElement | null, flavorIdx: number, delayMs: number, onLanded: () => void) => {
      const bagEl = bagBtnRef.current;
      if (reducedMotion || !sourceEl || !bagEl) {
        window.setTimeout(() => onLanded(), delayMs);
        return;
      }

      const srcRect = sourceEl.getBoundingClientRect();
      const bagRect = bagEl.getBoundingClientRect();

      const clone = document.createElement('div');
      clone.className = 'spr';
      const spr = spriteStyle(FLAVORS[flavorIdx].box, 4);
      clone.style.backgroundSize = spr.backgroundSize as string;
      clone.style.backgroundPosition = spr.backgroundPosition as string;
      clone.style.position = 'fixed';
      clone.style.left = `${srcRect.left}px`;
      clone.style.top = `${srcRect.top}px`;
      clone.style.width = `${srcRect.width}px`;
      clone.style.height = `${srcRect.height}px`;
      clone.style.zIndex = '70';
      clone.style.pointerEvents = 'none';
      clone.style.filter = 'drop-shadow(0 10px 14px rgba(0, 0, 0, .25))';
      document.body.appendChild(clone);

      const dx = bagRect.left + bagRect.width / 2 - (srcRect.left + srcRect.width / 2);
      const dy = bagRect.top + bagRect.height / 2 - (srcRect.top + srcRect.height / 2);
      const lift = Math.min(160, 0.35 * Math.abs(dy) + 60);
      const k = Math.min(0.2, 30 / Math.max(1, srcRect.height));

      const anim = clone.animate(
        [
          { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 },
          {
            transform: `translate(${0.4 * dx}px, ${0.4 * dy - lift}px) scale(${0.45 + k}) rotate(-10deg)`,
            opacity: 1,
            offset: 0.45,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(-18deg)`, opacity: 0.15 },
        ],
        {
          duration: 900,
          delay: delayMs,
          easing: 'cubic-bezier(.5, 0, .2, 1)',
          fill: 'forwards',
        }
      );

      anim.onfinish = () => {
        clone.remove();
        setBagBumpKey((b) => b + 1);
        onLanded();
      };
    },
    [reducedMotion]
  );

  // Smooth scroll to section helper
  const scrollToSection = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      simRef.current.smoothActive = false;
      const top = window.scrollY + el.getBoundingClientRect().top;
      window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    [reducedMotion]
  );

  // Section 2 step icon click
  const handleStepClick = (idx: number) => {
    const insideEl = insideRef.current;
    if (!insideEl) return;
    simRef.current.smoothActive = false;
    const ir = insideEl.getBoundingClientRect();
    const docTop = window.scrollY + ir.top;
    const p = (idx + 0.5) * 0.19;
    const targetY = docTop + p * Math.max(1, ir.height - window.innerHeight);
    window.scrollTo({ top: targetY, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  // Shop card handlers
  const handleCardMouseMove = (idx: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const card = cardRefs.current[idx];
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `translateY(-8px) rotateX(${-y * 12}deg) rotateY(${x * 12}deg)`;
    card.style.boxShadow = '0 24px 40px -18px rgba(40, 30, 20, .35)';
    if (idx === activeFlavor) {
      simRef.current.liveTiltX = x;
      simRef.current.liveTiltY = y;
    }
  };

  const handleCardMouseLeave = (idx: number) => {
    const card = cardRefs.current[idx];
    if (card) {
      card.style.transform = '';
      card.style.boxShadow = '';
    }
    if (idx === activeFlavor) {
      simRef.current.liveTiltX = 0;
      simRef.current.liveTiltY = 0;
    }
  };

  const handleCardPointerDown = (idx: number) => {
    const card = cardRefs.current[idx];
    if (card) {
      card.style.transform = 'scale(0.97)';
    }
  };

  const handleCardClick = (idx: number) => {
    const card = cardRefs.current[idx];
    if (card) {
      card.style.transform = '';
    }
    if (idx === activeFlavor && webglActive) {
      simRef.current.pokeTween = { start: performance.now(), dur: 500 };
    } else {
      const pk = cardPkRefs.current[idx];
      pk?.animate(
        [
          { transform: 'translateZ(30px) scale(1, 1)' },
          { transform: 'translateZ(30px) scale(1.06, 0.93)', offset: 0.3 },
          { transform: 'translateZ(30px) scale(0.97, 1.04)', offset: 0.6 },
          { transform: 'translateZ(30px) scale(1, 1)' },
        ],
        { duration: 500, easing: 'ease-out' }
      );
    }
  };

  const handleAddSingleBag = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const pkEl = cardPkRefs.current[idx];
    flyToCart(pkEl, idx, 0, () => {
      triggerBagEffects();
    });
  };

  // Builder handlers
  const handleThumbClick = (flavorIdx: number) => {
    simRef.current.userTouchedPack = true;
    const emptyIdx = packSlots.findIndex((s) => s === null);
    if (emptyIdx === -1) return;
    setPackSlots((prev) => {
      const next = [...prev];
      next[emptyIdx] = flavorIdx;
      return next;
    });
    setGlowColor(hexToRgba(FLAVORS[flavorIdx].color, 0.72));
    if (!reducedMotion) {
      glowRef.current?.animate([{ opacity: 0.55 }, { opacity: 1 }], {
        duration: 600,
        easing: 'cubic-bezier(.22,.8,.24,1)',
      });
    }
  };

  const handleRemoveSlot = (slotIdx: number) => {
    simRef.current.userTouchedPack = true;
    setPackSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
  };

  const filledCount = packSlots.filter((s) => s !== null).length;
  const remaining = 3 - filledCount;

  const handleBuyPack = () => {
    if (filledCount < 3 || buyAdded) return;
    simRef.current.userTouchedPack = true;

    const currentPicks = [...packSlots] as number[];
    let landed = 0;
    currentPicks.forEach((flavIdx, i) => {
      flyToCart(slotBarRefs.current[i], flavIdx, i * 120, () => {
        landed += 1;
        if (landed === 3) {
          triggerBagEffects();
        }
      });
    });

    window.setTimeout(() => {
      setPackSlots([null, null, null]);
      setBuyAdded(true);
      window.setTimeout(() => {
        setBuyAdded(false);
      }, 1600);
    }, 60);
  };

  // Section 2 displayed headline/caption based on shownStep
  const activeStepData = INSIDE_STEPS[shownStep];
  const stepHeadlineWords =
    shownStep === 3
      ? FLAVORS[shownStepFlavor].name.toUpperCase().split(' ')
      : activeStepData.headline;
  const hasLongStepWord = shownStep === 3 && stepHeadlineWords.some((w) => w.length > 9);

  const renderTitleWords = (flavorIdx: number) =>
    FLAVORS[flavorIdx].name
      .toUpperCase()
      .split(' ')
      .map((word, wIdx) => (
        <span key={`${word}-${wIdx}`} className="title-word">
          {word.split('').map((ch, cIdx) => (
            <span key={`${ch}-${cIdx}`} className="title-char-clip">
              <span className="title-char">{ch}</span>
            </span>
          ))}
        </span>
      ));

  const slotPositions = [
    { left: '50.2%', top: '37%' },
    { left: '34.8%', top: '59.3%' },
    { left: '64.8%', top: '59.3%' },
  ];

  return (
    <>
      {/* Intro Overlay */}
      <div
        id="intro"
        ref={introRef}
        className={introStage === 'stamp' ? 'cream' : introStage === 'done' ? 'done' : ''}
        aria-hidden={introStage === 'done'}
      >
        {!reducedMotion && (
          <video
            ref={videoRef}
            src={INTRO_VIDEO_URL}
            muted
            playsInline
            preload="auto"
          />
        )}
        <button
          type="button"
          className="skip-btn"
          onClick={enterHero}
        >
          Skip intro
        </button>
        <div className="intro-stamp">
          <StrideMark className="intro-stamp-mark" />
          <span className="intro-stamp-word">STRIDE</span>
        </div>
      </div>

      {/* Navigation */}
      <nav
        className={`site-nav ${heroEntered ? 'entered' : ''} ${navMode === 'light' ? 'light' : navMode === 'dark' ? 'dark' : ''}`}
        aria-label="Primary"
      >
        <a
          href="#flavors"
          className="nav-brand"
          onClick={(e) => {
            e.preventDefault();
            scrollToSection(heroRef.current);
          }}
        >
          <StrideMark className="nav-mark" inverted={navMode === 'dark'} />
          <span className="nav-word">Abdullah Nadeem</span>
        </a>

        <div className="nav-pill" ref={navPillRef}>
          <span
            className="nav-hi"
            style={{ left: `${navHiStyle.left}px`, width: `${navHiStyle.width}px` }}
            aria-hidden="true"
          />
          {(['flavors', 'inside', 'shop', 'range'] as const).map((sec) => (
            <a
              key={sec}
              ref={(el) => {
                navLinkRefs.current[sec] = el;
              }}
              href={`#${sec}`}
              className={`nav-link ${activeNav === sec ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                const map = {
                  flavors: heroRef.current,
                  inside: insideRef.current,
                  shop: shopRef.current,
                  range: rangeRef.current,
                };
                scrollToSection(map[sec]);
              }}
            >
              {sec.charAt(0).toUpperCase() + sec.slice(1)}
            </a>
          ))}
        </div>

        <div className="nav-actions">
          <button
            type="button"
            className="nav-off"
            onClick={() => scrollToSection(rangeRef.current)}
          >
            % OFF
          </button>
          <button
            ref={bagBtnRef}
            key={`bag-${bagBumpKey}`}
            type="button"
            className={`nav-bag ${bagBumpKey > 0 ? 'bump' : ''}`}
            aria-label={`Shopping bag, ${cartCount} items`}
            onClick={() => scrollToSection(shopRef.current)}
          >
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 7H15L16 17H4L5 7Z" />
              <path d="M7.5 7V5.5C7.5 4.1 8.6 3 10 3C11.4 3 12.5 4.1 12.5 5.5V7" />
            </svg>
            {cartCount > 0 && (
              <span key={`badge-${badgePopKey}`} className="bag-badge pop">
                {cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="nav-dibs"
            onClick={() => {
              setDibsNotice(true);
              scrollToSection(shopRef.current);
              window.setTimeout(() => setDibsNotice(false), 2200);
            }}
          >
            {dibsNotice ? 'You’re in' : 'First dibs'}
          </button>
        </div>
      </nav>

      {/* Section 1: Hero Carousel (#flavors) */}
      <section id="flavors" ref={heroRef} aria-label="Flavors">
        <div className="reveal" ref={revealRef} />
        <div className={`rings ${heroEntered ? 'entered' : ''}`} aria-hidden="true" />
        <div className="bits" aria-hidden="true">
          {HERO_BITS.map((b, i) => (
            <div
              key={i}
              ref={(el) => {
                bitRefs.current[i] = el;
              }}
              className={`hero-bit spr ${b.hideOnPhone ? 'hide-phone' : ''}`}
              style={{
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `calc(${b.size} * var(--u) * var(--bit-scale, 1))`,
                height: `calc(${b.size} * var(--u) * var(--bit-scale, 1))`,
                ['--rot' as string]: `${b.rot}deg`,
                ...spriteStyle(BITS[b.bit], 0),
              }}
            />
          ))}
        </div>

        <div
          ref={arcRef}
          className="arc"
          onPointerDown={onArcPointerDown}
          onPointerMove={onArcPointerMove}
          onPointerUp={(e) => finishDrag(e, false)}
          onPointerCancel={(e) => finishDrag(e, true)}
        />

        <button
          id="play"
          type="button"
          className={heroEntered ? 'entered' : ''}
          aria-label="Next flavour"
          onClick={() => goTo(simRef.current.target + 1)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 10H16" />
            <path d="M11.5 5.5L16 10L11.5 14.5" />
          </svg>
        </button>

        <h1
          id="title"
          className="disp"
          aria-live="polite"
          style={{ fontSize: `${titleFontSize}px` }}
        >
          <span className="title-stage">
            {titleState.outgoing !== null && (
              <span
                key={`out-${titleState.swapKey}`}
                ref={outTitleLayerRef}
                className="title-layer"
                aria-hidden="true"
              >
                {renderTitleWords(titleState.outgoing)}
              </span>
            )}
            <span
              key={`in-${titleState.swapKey}`}
              ref={inTitleLayerRef}
              className="title-layer"
            >
              {renderTitleWords(titleState.current)}
            </span>
          </span>
        </h1>

        <div id="count" ref={countRef} className={`disp ${heroEntered ? 'entered' : ''}`} aria-hidden="true">
          {counterText}
        </div>

        <button
          id="auto"
          type="button"
          className={heroEntered ? 'entered' : ''}
          aria-pressed={autoplay}
          onClick={() => {
            simRef.current.lastInteraction = performance.now();
            setAutoplay((a) => !a);
          }}
        >
          <span className="auto-ring" aria-hidden="true">
            {autoplay ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="2" y="1.5" width="2.2" height="7" rx="1" />
                <rect x="5.8" y="1.5" width="2.2" height="7" rx="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2.5 1.8L8.2 5L2.5 8.2V1.8Z" />
              </svg>
            )}
          </span>
          <span className="auto-label">Autoplay</span>
        </button>
      </section>

      {/* Section 2: Inside (#inside) */}
      <section id="inside" ref={insideRef} aria-label="What is inside">
        <div className="pin">
          <div className="in-dark" ref={inDarkRef} />
          <div className="in-frame" ref={inBackFrameRef}>
            <div className="in-num disp" ref={inNumRef} aria-hidden="true">
              {activeStepData.num}
            </div>
            <div id="inBar" ref={inBarRef} />
          </div>
        </div>
      </section>

      {/* Section 2 Front Layer (#inFront) above WebGL canvas */}
      <div id="inFront" ref={inFrontRef}>
        <div className="storm-layer" aria-hidden="true">
          {stormSeeds.map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                stormRefs.current[i] = el;
              }}
              className="storm-bit spr"
            />
          ))}
        </div>

        <div className="in-frame" ref={inFrontFrameRef}>
          <h2 className="in-head disp" ref={inHeadRef}>
            {stepHeadlineWords.map((line, i) => (
              <span
                key={i}
                className="block"
                style={hasLongStepWord ? { fontSize: '0.72em' } : undefined}
              >
                {line}
              </span>
            ))}
          </h2>

          <div className="in-icons" role="tablist" aria-label="Inside steps">
            {[0, 1, 2, 3].map((idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={insideStep === idx}
                aria-label={`Step 0${idx + 1}`}
                className={`in-icon ${insideStep === idx ? 'active' : ''}`}
                onClick={() => handleStepClick(idx)}
              >
                <StepIcon index={idx} />
              </button>
            ))}
          </div>

          <p className="in-cap" ref={inCapRef}>
            {activeStepData.caption.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* Section 3: Grab a bag (#shop) */}
      <section id="shop" ref={shopRef} className={shopRevealed ? 'revealed' : ''} aria-label="Shop">
        <h2 className="shop-head disp">
          <span className="line-mask">
            <span className="line-inner">GRAB</span>
          </span>
          <span className="line-mask">
            <span className="line-inner">A BAG</span>
          </span>
        </h2>

        <p className="shop-cap">
          Five bold flavours. Same
          <br />
          real ingredients. Pick your
          <br />
          favourite (or try them all).
        </p>

        <div className="cards" ref={cardsRef}>
          {FLAVORS.map((fl, idx) => (
            <div
              key={fl.id}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              className={`card ${activeFlavor === idx ? 'live' : ''}`}
              style={{
                background: fl.color,
                transitionDelay: shopRevealed ? '0ms' : `${idx * 80}ms`,
              }}
              onMouseMove={(e) => handleCardMouseMove(idx, e)}
              onMouseLeave={() => handleCardMouseLeave(idx)}
              onPointerDown={() => handleCardPointerDown(idx)}
              onClick={() => handleCardClick(idx)}
            >
              <h3 className="card-name disp">
                {fl.lines[0]}
                {fl.lines[1] && (
                  <>
                    <br />
                    {fl.lines[1]}
                  </>
                )}
              </h3>
              <div
                ref={(el) => {
                  cardPkRefs.current[idx] = el;
                }}
                className="pk spr"
                style={spriteStyle(fl.box, 4)}
                aria-hidden="true"
              />
              <button
                type="button"
                className="card-add"
                aria-label={`Add a bag of ${fl.name} to the cart`}
                onClick={(e) => handleAddSingleBag(idx, e)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M8 3V13M3 8H13" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: Build your 3 pack (#range) */}
      <section
        id="range"
        ref={rangeRef}
        className={rangeHeadRevealed ? 'revealed' : ''}
        aria-label="Build your 3 pack"
      >
        <h2 className="range-head disp">
          <span className="line-mask">
            <span className="line-inner">BUILD YOUR</span>
          </span>
          <span className="line-mask">
            <span className="line-inner">
              <span className="range-box">3</span> PACK &amp;
            </span>
          </span>
          <span className="line-mask">
            <span className="line-inner">SAVE $1.49</span>
          </span>
        </h2>

        <div
          ref={glowRef}
          className="glow"
          style={{ ['--g' as string]: glowColor }}
        >
          {slotPositions.map((posStyle, idx) => {
            const flavIdx = packSlots[idx];
            const isFilled = flavIdx !== null;
            return (
              <div
                key={idx}
                className={`slot ${isFilled ? 'filled' : ''}`}
                style={posStyle}
              >
                {isFilled && (
                  <div
                    ref={(el) => {
                      slotBarRefs.current[idx] = el;
                    }}
                    className="slot-bar spr"
                    style={spriteStyle(FLAVORS[flavIdx].box, 4)}
                    aria-label={FLAVORS[flavIdx].name}
                  />
                )}
                <button
                  type="button"
                  className="slot-x"
                  aria-label={isFilled ? `Remove ${FLAVORS[flavIdx].name} from slot ${idx + 1}` : `Empty slot ${idx + 1}`}
                  onClick={() => isFilled && handleRemoveSlot(idx)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M3 3L11 11M11 3L3 11" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        <div className="thumbs">
          {FLAVORS.map((fl) => {
            const count = packSlots.filter((s) => s === fl.id).length;
            return (
              <button
                key={fl.id}
                type="button"
                className="thumb"
                onClick={() => handleThumbClick(fl.id)}
              >
                <span className="thumb-sq" style={{ background: fl.color }}>
                  <span
                    className="thumb-spr spr"
                    style={spriteStyle(fl.box, 4)}
                    aria-hidden="true"
                  />
                </span>
                <span className="thumb-name">{fl.name}</span>
                <span className={`thumb-ring ${count > 0 ? 'has' : ''}`}>
                  {count === 1 ? '✓' : count > 1 ? count : ''}
                </span>
              </button>
            );
          })}
        </div>

        <button
          id="buy"
          type="button"
          className={buyAdded ? 'added' : ''}
          disabled={filledCount < 3 && !buyAdded}
          onClick={handleBuyPack}
        >
          <span>
            {buyAdded
              ? 'Added to cart'
              : filledCount < 3
                ? `Pick ${remaining} more`
                : 'Add 3 pack to cart'}
          </span>
          {!buyAdded && <span className="buy-price">$7.48</span>}
        </button>
      </section>
    </>
  );
}
