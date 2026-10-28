"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, ListRow } from "@/components/ui";
import { readLocal, writeLocal } from "@/lib/persist";

type RecordItem = { id: string; title: string; notes: string; createdAt: string };
type Pace = "Calm" | "Standard" | "Swift";
type Phase = "ready" | "playing" | "over";
type Obstacle = { x: number; gapY: number; scored: boolean };
type GameState = { y: number; velocity: number; obstacles: Obstacle[]; spawnTimer: number; elapsed: number };

const STORAGE_KEY = "lastmile:flappy-bird-realistic:localStorage: run_records";
const WIDTH = 960;
const HEIGHT = 540;
const PLAYER_X = 250;
const OBSTACLE_WIDTH = 84;

function scoreFromRecord(item: RecordItem): number {
  const match = item.notes.match(/(?:score:\s*)?(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function paceFor(records: RecordItem[]): Pace {
  const recent = records.slice(0, 3);
  if (recent.length === 0) return "Calm";
  const average = recent.reduce((sum, item) => sum + scoreFromRecord(item), 0) / recent.length;
  if (average >= 15) return "Swift";
  if (average >= 5) return "Standard";
  return "Calm";
}

function bestFrom(records: RecordItem[]): number {
  return records.reduce((best, item) => Math.max(best, scoreFromRecord(item)), 0);
}

function drawScene(ctx: CanvasRenderingContext2D, game: GameState, now: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#8fc8f2");
  sky.addColorStop(0.57, "#d9edfa");
  sky.addColorStop(1, "#f7f0de");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Sunlit atmospheric haze and distant ridgelines give the flight lane depth.
  const haze = ctx.createRadialGradient(720, 110, 10, 720, 110, 340);
  haze.addColorStop(0, "rgba(255,255,255,.56)");
  haze.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(300, 0, 660, 390);

  const cloudDrift = (now * 0.009) % 1200;
  for (let i = 0; i < 4; i += 1) {
    const x = ((i * 285 - cloudDrift + 1200) % 1200) - 100;
    const y = 82 + (i % 2) * 84;
    ctx.fillStyle = "rgba(255,255,255,.48)";
    ctx.beginPath();
    ctx.ellipse(x, y, 52, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 20, y - 7, 27, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 43, y, 39, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#adc7c6";
  ctx.beginPath();
  ctx.moveTo(0, 332);
  ctx.lineTo(115, 239);
  ctx.lineTo(214, 319);
  ctx.lineTo(343, 223);
  ctx.lineTo(475, 330);
  ctx.lineTo(607, 247);
  ctx.lineTo(751, 333);
  ctx.lineTo(869, 253);
  ctx.lineTo(960, 318);
  ctx.lineTo(960, 454);
  ctx.lineTo(0, 454);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8daead";
  ctx.beginPath();
  ctx.moveTo(0, 376);
  ctx.lineTo(157, 296);
  ctx.lineTo(287, 374);
  ctx.lineTo(438, 292);
  ctx.lineTo(576, 382);
  ctx.lineTo(743, 301);
  ctx.lineTo(892, 378);
  ctx.lineTo(960, 336);
  ctx.lineTo(960, 465);
  ctx.lineTo(0, 465);
  ctx.closePath();
  ctx.fill();

  // The obstacle silhouettes stay dark and high-contrast against the sky.
  for (const obstacle of game.obstacles) {
    const top = obstacle.gapY - 91;
    const bottom = obstacle.gapY + 91;
    const x = obstacle.x;
    const pipe = ctx.createLinearGradient(x, 0, x + OBSTACLE_WIDTH, 0);
    pipe.addColorStop(0, "#243f50");
    pipe.addColorStop(0.19, "#426b79");
    pipe.addColorStop(0.52, "#274c5c");
    pipe.addColorStop(1, "#183644");
    ctx.fillStyle = "rgba(13,39,51,.2)";
    ctx.fillRect(x + 8, 0, OBSTACLE_WIDTH, top);
    ctx.fillRect(x + 8, bottom, OBSTACLE_WIDTH, HEIGHT - bottom);
    ctx.fillStyle = pipe;
    ctx.fillRect(x, 0, OBSTACLE_WIDTH, top);
    ctx.fillRect(x, bottom, OBSTACLE_WIDTH, HEIGHT - bottom);
    ctx.fillStyle = "#193743";
    ctx.fillRect(x - 8, top - 17, OBSTACLE_WIDTH + 16, 17);
    ctx.fillRect(x - 8, bottom, OBSTACLE_WIDTH + 16, 17);
    ctx.fillStyle = "rgba(195,231,226,.26)";
    ctx.fillRect(x + 13, 0, 5, Math.max(0, top - 17));
    ctx.fillRect(x + 13, bottom + 17, 5, Math.max(0, HEIGHT - bottom - 17));
    ctx.fillStyle = "rgba(219,240,235,.2)";
    ctx.fillRect(x - 8, top - 17, OBSTACLE_WIDTH + 16, 3);
    ctx.fillRect(x - 8, bottom, OBSTACLE_WIDTH + 16, 3);
  }

  // Runway edge and small perspective marks anchor the lower edge of the scene.
  const ground = ctx.createLinearGradient(0, 448, 0, HEIGHT);
  ground.addColorStop(0, "#627b75");
  ground.addColorStop(0.15, "#384c48");
  ground.addColorStop(1, "#202d2d");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 454, WIDTH, HEIGHT - 454);
  ctx.fillStyle = "rgba(225,235,211,.52)";
  ctx.fillRect(0, 454, WIDTH, 3);
  for (let i = 0; i < 9; i += 1) {
    const x = ((i * 145 - now * 0.12) % 1100 + 1100) % 1100 - 50;
    ctx.fillStyle = "rgba(224,229,204,.42)";
    ctx.beginPath();
    ctx.moveTo(x, 482);
    ctx.lineTo(x + 35, 482);
    ctx.lineTo(x + 54, 490);
    ctx.lineTo(x + 13, 490);
    ctx.closePath();
    ctx.fill();
  }

  // A small, readable flight vehicle with a recognizable wing and cockpit.
  const angle = Math.max(-0.28, Math.min(0.38, game.velocity * 0.0018));
  ctx.save();
  ctx.translate(PLAYER_X, game.y);
  ctx.rotate(angle);
  ctx.shadowColor = "rgba(15,43,61,.28)";
  ctx.shadowBlur = 13;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = "#1a4961";
  ctx.beginPath();
  ctx.moveTo(-32, 0);
  ctx.lineTo(-14, -9);
  ctx.lineTo(18, -8);
  ctx.lineTo(39, 0);
  ctx.lineTo(16, 9);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#4f8cff";
  ctx.beginPath();
  ctx.moveTo(-10, -5);
  ctx.lineTo(2, -23);
  ctx.lineTo(11, -23);
  ctx.lineTo(8, -5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-9, 4);
  ctx.lineTo(4, 17);
  ctx.lineTo(12, 17);
  ctx.lineTo(8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#dff5ff";
  ctx.beginPath();
  ctx.ellipse(10, -2, 7, 4, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffbf69";
  ctx.beginPath();
  ctx.moveTo(34, -3);
  ctx.lineTo(46, 0);
  ctx.lineTo(34, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function FlightGame() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [score, setScore] = useState(0);
  const [activePace, setActivePace] = useState<Pace>("Calm");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordsRef = useRef<RecordItem[]>([]);
  const phaseRef = useRef<Phase>("ready");
  const scoreRef = useRef(0);
  const gameRef = useRef<GameState>({ y: 265, velocity: 0, obstacles: [], spawnTimer: 0, elapsed: 0 });

  useEffect(() => {
    try {
      const saved = readLocal<RecordItem[]>(STORAGE_KEY, []);
      const safeRecords = Array.isArray(saved)
        ? saved.filter((item): item is RecordItem => Boolean(item && typeof item.id === "string" && typeof item.title === "string" && typeof item.notes === "string" && typeof item.createdAt === "string"))
        : [];
      recordsRef.current = safeRecords;
      setRecords(safeRecords);
    } catch {
      setError("Saved flight history could not be loaded. You can still fly; new runs may not be saved.");
    }
  }, []);

  const completedPace = paceFor(records);
  const bestScore = bestFrom(records);

  const finishRun = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "over";
    setPhase("over");
    const finalScore = scoreRef.current;
    const item: RecordItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: `Flight · ${finalScore}`,
      notes: `Score: ${finalScore}`,
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...recordsRef.current].slice(0, 100);
    recordsRef.current = next;
    setRecords(next);
    try {
      writeLocal(STORAGE_KEY, next);
      setError("");
    } catch {
      setError("This run ended, but its score could not be saved. Your flight controls are still available.");
    }
  }, []);

  const startRun = useCallback((flapImmediately = false) => {
    const pace = paceFor(recordsRef.current);
    setActivePace(pace);
    scoreRef.current = 0;
    setScore(0);
    gameRef.current = {
      y: 265,
      velocity: flapImmediately ? -390 : 0,
      obstacles: [],
      spawnTimer: 0.75,
      elapsed: 0,
    };
    setError("");
    phaseRef.current = "playing";
    setPhase("playing");
  }, []);

  const flap = useCallback(() => {
    if (phaseRef.current === "ready") {
      startRun(true);
      return;
    }
    if (phaseRef.current !== "playing") return;
    gameRef.current.velocity = -390;
  }, [startRun]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let frame = 0;
    let previous = 0;
    const render = (now: number) => {
      const game = gameRef.current;
      if (phaseRef.current === "playing") {
        const dt = previous ? Math.min((now - previous) / 1000, 0.04) : 0;
        previous = now;
        game.elapsed += dt;
        game.velocity += 1080 * dt;
        game.y += game.velocity * dt;
        const interval = activePace === "Swift" ? 1.35 : activePace === "Standard" ? 1.75 : 2.2;
        const speed = activePace === "Swift" ? 295 : activePace === "Standard" ? 265 : 235;
        game.spawnTimer -= dt;
        if (game.spawnTimer <= 0) {
          game.obstacles.push({ x: WIDTH + 15, gapY: 145 + Math.random() * 220, scored: false });
          game.spawnTimer = interval;
        }
        for (const obstacle of game.obstacles) {
          obstacle.x -= speed * dt;
          const playerLeft = PLAYER_X - 24;
          const playerRight = PLAYER_X + 29;
          const playerTop = game.y - 15;
          const playerBottom = game.y + 15;
          const overlapsX = playerRight > obstacle.x - 7 && playerLeft < obstacle.x + OBSTACLE_WIDTH + 7;
          const inGap = playerTop > obstacle.gapY - 91 && playerBottom < obstacle.gapY + 91;
          if (overlapsX && !inGap) {
            finishRun();
            break;
          }
          if (!obstacle.scored && obstacle.x + OBSTACLE_WIDTH < PLAYER_X) {
            obstacle.scored = true;
            scoreRef.current += 1;
            setScore(scoreRef.current);
          }
        }
        game.obstacles = game.obstacles.filter((obstacle) => obstacle.x > -OBSTACLE_WIDTH - 20);
        if (game.y < 8 || game.y > 438) finishRun();
      }
      drawScene(ctx, game, now);
      if (phaseRef.current === "playing") frame = window.requestAnimationFrame(render);
    };

    render(0);
    if (phaseRef.current === "playing") frame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(frame);
  }, [activePace, phase, finishRun]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "BUTTON" || target?.tagName === "INPUT") return;
      event.preventDefault();
      if (phaseRef.current === "over") return;
      flap();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flap]);

  const displayedPace = phase === "ready" ? completedPace : activePace;
  const paceStyle = displayedPace === "Swift"
    ? "bg-orange-100 text-orange-800"
    : displayedPace === "Standard"
      ? "bg-blue-100 text-blue-800"
      : "bg-emerald-100 text-emerald-800";

  return (
    <main className="min-h-screen bg-[#faf9f7] px-4 py-6 text-[#1a1d21] sm:px-8 sm:py-10">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-['DM_Sans'] text-xs font-bold uppercase tracking-[0.24em] text-[#4f8cff]">Aero · Adaptive Flight</p>
            <h1 className="font-['Space_Grotesk'] text-4xl font-bold tracking-tight sm:text-5xl">Find your flight path.</h1>
            <p className="mt-2 max-w-xl font-['DM_Sans'] text-sm leading-6 text-slate-600">Thread the mountain pass, read the air, and see how far your instincts can carry you.</p>
          </div>
          <Card className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            <div>
              <p className="font-['DM_Sans'] text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Pace</p>
              <span className={`mt-1 inline-flex rounded-full px-3 py-1 font-['DM_Sans'] text-xs font-bold ${paceStyle}`}>{displayedPace}</span>
            </div>
            <div className="h-9 w-px bg-slate-200" />
            <div className="min-w-[64px] text-right">
              <p className="font-['DM_Sans'] text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Best</p>
              <p className="font-['Space_Grotesk'] text-2xl font-bold tabular-nums">{bestScore}</p>
            </div>
          </Card>
        </header>

        {error && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-['DM_Sans'] text-sm text-amber-900">{error}</p>}

        <Card className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-2 shadow-[0_24px_70px_-35px_rgba(28,55,72,.36)] sm:p-3">
          <div className="relative isolate overflow-hidden rounded-[21px] bg-[#b9d8e9]">
            <canvas
              ref={canvasRef}
              aria-label="Aero flight course with mountain scenery and flight obstacles"
              className="block aspect-[16/9] w-full touch-none"
              onPointerDown={(event) => {
                if (phaseRef.current === "playing") event.preventDefault();
                flap();
              }}
            />
            <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-2xl border border-white/40 bg-[#102a3c]/75 px-4 py-2 text-white shadow-lg backdrop-blur-md sm:left-6 sm:top-6">
              <span className="font-['DM_Sans'] text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">Score</span>
              <span className="font-['Space_Grotesk'] text-2xl font-bold tabular-nums">{score}</span>
            </div>
            <div className="pointer-events-none absolute right-4 top-4 rounded-2xl border border-white/40 bg-white/75 px-3 py-2 shadow-lg backdrop-blur-md sm:right-6 sm:top-6">
              <span className="font-['DM_Sans'] text-xs font-bold text-[#183644]">{displayedPace} pace</span>
            </div>

            {phase === "ready" && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#102a3c]/10 p-4">
                <div className="w-full max-w-sm rounded-3xl border border-white/65 bg-white/90 p-6 text-center shadow-[0_20px_60px_-25px_rgba(16,42,60,.5)] backdrop-blur-md sm:p-8">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf2ff] text-[#4f8cff]">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true"><path d="M3 12.3 20.7 4c.8-.4 1.6.4 1.2 1.2l-8.3 17.7c-.4.8-1.5.7-1.7-.2l-1.7-7.2-7.2-1.7c-.9-.2-1-1.3 0-1.5ZM11.5 14l1.1 4.4 5.2-11.1-11.1 5.2 4.8 1.1Z" /></svg>
                  </div>
                  <p className="font-['DM_Sans'] text-xs font-bold uppercase tracking-[0.2em] text-[#4f8cff]">Ready for takeoff?</p>
                  <h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-bold">Tap to Fly</h2>
                  <p className="mx-auto mt-2 max-w-xs font-['DM_Sans'] text-sm leading-6 text-slate-600">One tap lifts your aircraft. Slip through the pass and keep clear of the ridges.</p>
                  <Button variant="primary" size="lg" className="mt-6 w-full rounded-xl bg-[#4f8cff] font-['DM_Sans'] font-bold text-white" onClick={() => startRun(false)}>Start Run</Button>
                  <p className="mt-3 font-['DM_Sans'] text-xs text-slate-500">Tap or click to fly · Space on desktop</p>
                </div>
              </div>
            )}

            {phase === "playing" && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/30 bg-[#102a3c]/60 px-4 py-2 font-['DM_Sans'] text-xs font-semibold text-white shadow-lg backdrop-blur-sm sm:bottom-6">Tap to climb <span className="mx-1 text-white/50">·</span> Space</div>
            )}

            {phase === "over" && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#102a3c]/35 p-4 backdrop-blur-[2px]">
                <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/95 p-6 text-center shadow-2xl sm:p-8">
                  <p className="font-['DM_Sans'] text-xs font-bold uppercase tracking-[0.2em] text-[#4f8cff]">Flight complete</p>
                  <h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-bold">Nice flying.</h2>
                  <div className="my-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="font-['DM_Sans'] text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Run score</p><p className="mt-1 font-['Space_Grotesk'] text-4xl font-bold tabular-nums">{score}</p></div>
                    <div className="rounded-2xl bg-[#edf3ff] p-4"><p className="font-['DM_Sans'] text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Best score</p><p className="mt-1 font-['Space_Grotesk'] text-4xl font-bold tabular-nums">{bestScore}</p></div>
                  </div>
                  <p className="font-['DM_Sans'] text-sm text-slate-600">Your next course is set to <span className="font-bold text-[#1a1d21]">{paceFor(records)} pace</span>.</p>
                  <Button variant="primary" size="lg" className="mt-6 w-full rounded-xl bg-[#4f8cff] font-['DM_Sans'] font-bold text-white" onClick={() => startRun(false)}>Retry</Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <section className="mt-6 grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="font-['DM_Sans'] text-xs font-bold uppercase tracking-[0.2em] text-[#4f8cff]">Adaptive flight</p>
            <h2 className="mt-2 font-['Space_Grotesk'] text-xl font-bold">Your pace, your pass.</h2>
            <p className="mt-2 font-['DM_Sans'] text-sm leading-6 text-slate-600">Pace follows the average of your three latest flights. Calm starts below 5, Standard begins at 5, and Swift begins at 15.</p>
            <div className="mt-4 flex flex-wrap gap-2 font-['DM_Sans'] text-xs font-bold">
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-800">Calm · &lt;5</span>
              <span className="rounded-full bg-blue-100 px-3 py-1.5 text-blue-800">Standard · 5–14</span>
              <span className="rounded-full bg-orange-100 px-3 py-1.5 text-orange-800">Swift · 15+</span>
            </div>
          </Card>
          <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-['DM_Sans'] text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Flight log</p>
                <h2 className="mt-1 font-['Space_Grotesk'] text-xl font-bold">Recent runs</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-['DM_Sans'] text-xs font-semibold text-slate-600">{records.length} saved</span>
            </div>
            {records.length === 0 ? (
              <EmptyState title="No flights logged yet" message="Complete your first run and your score will appear here." className="rounded-xl bg-[#faf9f7]" />
            ) : (
              <div className="space-y-2">
                {records.slice(0, 4).map((item) => {
                  const date = new Date(item.createdAt);
                  const dateLabel = Number.isNaN(date.getTime()) ? "Saved flight" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  return <ListRow key={item.id} title={item.title} subtitle={`${dateLabel} · ${item.notes}`} trailing={<span className="shrink-0 rounded-full bg-[#edf3ff] px-3 py-1 font-['Space_Grotesk'] text-sm font-bold text-[#315fae]">{scoreFromRecord(item)}</span>} className="min-w-0 break-words rounded-xl border border-slate-100 bg-white" />;
                })}
              </div>
            )}
          </Card>
        </section>
        <p className="mt-5 text-center font-['DM_Sans'] text-xs leading-5 text-slate-500">Aero is an experimental flight challenge. Pace is designed for play, not a measure of real-world flying skill.</p>
      </div>
    </main>
  );
}
