"use client";

import { useEffect, useRef, useState } from "react";
import { readLocal, writeLocal } from "@/lib/persist";

type Pace = "Calm" | "Standard" | "Swift";
type GameMode = "ready" | "playing" | "over";
type Pipe = { x: number; gapY: number; passed: boolean };
type Game = { mode: GameMode; birdY: number; velocity: number; pipes: Pipe[]; score: number };

const WIDTH = 800;
const HEIGHT = 520;
const GROUND = 475;
const BIRD_X = 185;
const BIRD_RADIUS = 16;
const PIPE_WIDTH = 70;
const PIPE_GAP = 155;
const PACE_SPEED: Record<Pace, number> = { Calm: 2.4, Standard: 3.2, Swift: 4.2 };

function freshGame(mode: GameMode = "ready"): Game {
  return {
    mode,
    birdY: 240,
    velocity: 0,
    pipes: [{ x: 620, gapY: 245, passed: false }, { x: 940, gapY: 220, passed: false }],
    score: 0,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(freshGame());
  const paceRef = useRef<Pace>("Standard");
  const bestRef = useRef(0);
  const [mode, setMode] = useState<GameMode>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => readLocal<number>("flappy-bird-best", 0));
  const [pace, setPace] = useState<Pace>("Standard");

  useEffect(() => {
    bestRef.current = best;
  }, [best]);

  useEffect(() => {
    paceRef.current = pace;
  }, [pace]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let previous = 0;

    const draw = (game: Game) => {
      const ctx = context;
      const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      sky.addColorStop(0, "#76c9e8");
      sky.addColorStop(1, "#d7f0e3");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Distant hills and soft clouds give the playfield a little depth.
      ctx.fillStyle = "rgba(255,255,255,0.52)";
      for (const cloud of [{ x: 125, y: 100 }, { x: 430, y: 75 }, { x: 690, y: 140 }]) {
        ctx.beginPath();
        ctx.ellipse(cloud.x, cloud.y, 43, 15, 0, 0, Math.PI * 2);
        ctx.ellipse(cloud.x + 28, cloud.y - 8, 28, 17, 0, 0, Math.PI * 2);
        ctx.ellipse(cloud.x + 51, cloud.y, 34, 13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#a3d69e";
      ctx.beginPath();
      ctx.moveTo(0, 390);
      ctx.quadraticCurveTo(165, 310, 325, 390);
      ctx.quadraticCurveTo(520, 305, 800, 390);
      ctx.lineTo(800, GROUND);
      ctx.lineTo(0, GROUND);
      ctx.fill();

      for (const pipe of game.pipes) {
        const topEnd = pipe.gapY - PIPE_GAP / 2;
        const bottomStart = pipe.gapY + PIPE_GAP / 2;
        const gradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0);
        gradient.addColorStop(0, "#287a4c");
        gradient.addColorStop(0.35, "#58b86c");
        gradient.addColorStop(1, "#287a4c");
        ctx.fillStyle = gradient;
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, topEnd);
        ctx.fillRect(pipe.x, bottomStart, PIPE_WIDTH, GROUND - bottomStart);
        ctx.fillStyle = "#3b9859";
        ctx.fillRect(pipe.x - 5, topEnd - 17, PIPE_WIDTH + 10, 17);
        ctx.fillRect(pipe.x - 5, bottomStart, PIPE_WIDTH + 10, 17);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(pipe.x + 9, 0, 7, Math.max(0, topEnd - 17));
        ctx.fillRect(pipe.x + 9, bottomStart + 17, 7, Math.max(0, GROUND - bottomStart - 17));
      }

      ctx.fillStyle = "#c99b59";
      ctx.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);
      ctx.fillStyle = "#79bd5d";
      ctx.fillRect(0, GROUND, WIDTH, 12);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      for (let x = 0; x < WIDTH; x += 42) ctx.fillRect(x, GROUND + 22, 22, 4);

      ctx.save();
      ctx.translate(BIRD_X, game.birdY);
      ctx.rotate(Math.max(-0.35, Math.min(0.7, game.velocity * 0.045)));
      ctx.fillStyle = "#f5c542";
      ctx.beginPath();
      ctx.ellipse(0, 0, BIRD_RADIUS + 2, BIRD_RADIUS, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff0a8";
      ctx.beginPath();
      ctx.ellipse(-5, 5, 10, 7, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f28c38";
      ctx.beginPath();
      ctx.moveTo(13, -1);
      ctx.lineTo(29, 4);
      ctx.lineTo(13, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(7, -7, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#253238";
      ctx.beginPath();
      ctx.arc(9, -7, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (game.mode === "ready") {
        ctx.fillStyle = "rgba(16,35,40,0.72)";
        ctx.font = "bold 28px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Tap or press Space to fly", WIDTH / 2, 190);
      }
    };

    const tick = (now: number) => {
      const delta = previous === 0 ? 1 : Math.min(2, (now - previous) / 16.67);
      previous = now;
      const game = gameRef.current;

      if (game.mode === "playing") {
        game.velocity += 0.42 * delta;
        game.birdY += game.velocity * delta;
        const speed = PACE_SPEED[paceRef.current] * delta;
        for (const pipe of game.pipes) {
          pipe.x -= speed;
          if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X) {
            pipe.passed = true;
            game.score += 1;
            setScore(game.score);
            if (game.score > bestRef.current) {
              bestRef.current = game.score;
              setBest(game.score);
              writeLocal("flappy-bird-best", game.score);
            }
          }
        }
        game.pipes = game.pipes.filter((pipe) => pipe.x > -PIPE_WIDTH - 10);
        const rightmost = game.pipes.reduce((right, pipe) => Math.max(right, pipe.x), 0);
        if (rightmost < WIDTH - 220) {
          game.pipes.push({ x: WIDTH + 30, gapY: 170 + Math.random() * 160, passed: false });
        }

        const hitPipe = game.pipes.some((pipe) => {
          const overlapsBird = BIRD_X + BIRD_RADIUS > pipe.x && BIRD_X - BIRD_RADIUS < pipe.x + PIPE_WIDTH;
          return overlapsBird && (game.birdY - BIRD_RADIUS < pipe.gapY - PIPE_GAP / 2 || game.birdY + BIRD_RADIUS > pipe.gapY + PIPE_GAP / 2);
        });
        if (hitPipe || game.birdY + BIRD_RADIUS >= GROUND || game.birdY - BIRD_RADIUS <= 0) {
          game.mode = "over";
          setMode("over");
        }
      }

      draw(game);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const flap = () => {
    const game = gameRef.current;
    if (game.mode === "over") {
      const restarted = freshGame("playing");
      restarted.velocity = -7;
      gameRef.current = restarted;
      setScore(0);
      setMode("playing");
      return;
    }
    if (game.mode === "ready") {
      game.mode = "playing";
      setMode("playing");
    }
    game.velocity = -7;
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const changePace = (value: Pace) => {
    setPace(value);
    paceRef.current = value;
  };

  return (
    <main className="min-h-screen bg-[#101a1d] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">A little flight simulator</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Flappy Bird</h1>
            <p className="mt-2 text-sm text-white/55">Guide your bird through the pipes. Every gap counts.</p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-white/45">Score</p>
              <p className="text-2xl font-bold tabular-nums">{score}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-white/45">Best</p>
              <p className="text-2xl font-bold tabular-nums">{best}</p>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            onClick={flap}
            role="button"
            tabIndex={0}
            aria-label="Flappy Bird game. Click or press Space to fly."
            className="block h-auto w-full cursor-pointer"
          />
          {mode === "over" && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
              <p className="font-semibold">Flight ended <span className="ml-2 text-sm font-normal text-white/55">Score: {score}</span></p>
              <button type="button" onClick={flap} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-[#10201a] hover:bg-emerald-300">Fly again</button>
            </div>
          )}
        </section>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm text-white/55">
          <p>Click, tap, or press <kbd className="rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-xs text-white/80">Space</kbd> to flap.</p>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider">Pace</span>
            {(["Calm", "Standard", "Swift"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changePace(option)}
                aria-pressed={pace === option}
                className={`rounded-md px-3 py-1.5 text-xs transition ${pace === option ? "bg-emerald-400 font-semibold text-[#10201a]" : "bg-white/5 text-white/65 hover:bg-white/10"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}
