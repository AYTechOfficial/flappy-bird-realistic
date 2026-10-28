"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { readLocal, writeLocal } from "@/lib/persist";

type GameStatus = "ready" | "running" | "over";
type FlightRecord = { score: number; date: string };
type FlightHistory = { best: number; flights: FlightRecord[] };
type Pipe = { x: number; gapTop: number; scored: boolean };
type Game = { status: GameStatus; birdY: number; velocity: number; pipes: Pipe[]; score: number; lastPipeAt: number };

const HISTORY_KEY = "flappy-flight-history";
const WIDTH = 800;
const HEIGHT = 420;
const BIRD_X = 170;
const BIRD_RADIUS = 14;
const PIPE_WIDTH = 62;
const GAP_HEIGHT = 148;
const INITIAL_GAME: Game = { status: "ready", birdY: 200, velocity: 0, pipes: [], score: 0, lastPipeAt: 0 };
const EMPTY_HISTORY: FlightHistory = { best: 0, flights: [] };

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>({ ...INITIAL_GAME });
  const [status, setStatus] = useState<GameStatus>("ready");
  const [score, setScore] = useState(0);
  const [history, setHistory] = useState<FlightHistory>(() => readLocal<FlightHistory>(HISTORY_KEY, EMPTY_HISTORY));
  const historyRef = useRef(history);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const startGame = useCallback(() => {
    gameRef.current = {
      status: "running",
      birdY: 200,
      velocity: -390,
      pipes: [{ x: WIDTH + 20, gapTop: 105 + Math.random() * 135, scored: false }],
      score: 0,
      lastPipeAt: 0,
    };
    setScore(0);
    setStatus("running");
  }, []);

  const flap = useCallback(() => {
    const game = gameRef.current;
    if (game.status !== "running") {
      startGame();
      return;
    }
    game.velocity = -390;
  }, [startGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    let frame = 0;
    let previousTime = 0;

    const finishFlight = (game: Game) => {
      if (game.status !== "running") return;
      game.status = "over";
      setStatus("over");
      const next: FlightHistory = {
        best: Math.max(historyRef.current.best, game.score),
        flights: [{ score: game.score, date: new Date().toISOString() }, ...historyRef.current.flights].slice(0, 5),
      };
      historyRef.current = next;
      setHistory(next);
      writeLocal(HISTORY_KEY, next);
    };

    const draw = (time: number) => {
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.04) : 0;
      previousTime = time;
      const game = gameRef.current;

      if (game.status === "running") {
        game.velocity += 1050 * delta;
        game.birdY += game.velocity * delta;
        for (const pipe of game.pipes) pipe.x -= 205 * delta;

        if (time - game.lastPipeAt > 1500) {
          game.pipes.push({ x: WIDTH + 20, gapTop: 70 + Math.random() * 170, scored: false });
          game.lastPipeAt = time;
        }
        game.pipes = game.pipes.filter((pipe) => pipe.x > -PIPE_WIDTH);

        let crashed = game.birdY - BIRD_RADIUS < 0 || game.birdY + BIRD_RADIUS > HEIGHT - 28;
        for (const pipe of game.pipes) {
          const overlapsX = BIRD_X + BIRD_RADIUS > pipe.x && BIRD_X - BIRD_RADIUS < pipe.x + PIPE_WIDTH;
          const outsideGap = game.birdY - BIRD_RADIUS < pipe.gapTop || game.birdY + BIRD_RADIUS > pipe.gapTop + GAP_HEIGHT;
          if (overlapsX && outsideGap) crashed = true;
          if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
            pipe.scored = true;
            game.score += 1;
            setScore(game.score);
          }
        }
        if (crashed) finishFlight(game);
      }

      const sky = context.createLinearGradient(0, 0, 0, HEIGHT);
      sky.addColorStop(0, "#102d48");
      sky.addColorStop(1, "#1b5267");
      context.fillStyle = sky;
      context.fillRect(0, 0, WIDTH, HEIGHT);

      context.fillStyle = "rgba(190, 224, 226, 0.15)";
      context.beginPath();
      context.arc(665, 82, 35, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#224b58";
      context.beginPath();
      context.moveTo(0, 305);
      context.lineTo(180, 188);
      context.lineTo(340, 305);
      context.lineTo(515, 205);
      context.lineTo(720, 315);
      context.lineTo(800, 255);
      context.lineTo(800, HEIGHT);
      context.lineTo(0, HEIGHT);
      context.fill();

      for (const pipe of game.pipes) {
        const bottomY = pipe.gapTop + GAP_HEIGHT;
        context.fillStyle = "#477d58";
        context.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapTop);
        context.fillRect(pipe.x, bottomY, PIPE_WIDTH, HEIGHT - bottomY - 28);
        context.fillStyle = "#75a86b";
        context.fillRect(pipe.x - 5, pipe.gapTop - 18, PIPE_WIDTH + 10, 18);
        context.fillRect(pipe.x - 5, bottomY, PIPE_WIDTH + 10, 18);
        context.fillStyle = "rgba(255,255,255,0.12)";
        context.fillRect(pipe.x + 9, 0, 7, pipe.gapTop - 18);
      }

      context.fillStyle = "#a88458";
      context.fillRect(0, HEIGHT - 28, WIDTH, 28);
      context.fillStyle = "#d2b078";
      context.fillRect(0, HEIGHT - 28, WIDTH, 5);

      context.save();
      context.translate(BIRD_X, game.birdY);
      context.rotate(Math.max(-0.45, Math.min(0.65, game.velocity / 750)));
      context.fillStyle = "#e6b95f";
      context.beginPath();
      context.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#f3d486";
      context.beginPath();
      context.ellipse(-5, 5, 9, 5, -0.3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ec815a";
      context.beginPath();
      context.moveTo(15, -2);
      context.lineTo(28, 2);
      context.lineTo(15, 6);
      context.fill();
      context.fillStyle = "#183348";
      context.beginPath();
      context.arc(8, -6, 2.4, 0, Math.PI * 2);
      context.fill();
      context.restore();

      if (game.status !== "running") {
        context.fillStyle = "rgba(5, 15, 25, 0.36)";
        context.fillRect(0, 0, WIDTH, HEIGHT);
      }
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flap]);

  const best = Math.max(history.best, score);

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10 text-[var(--primary)] sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge tone="brand">FLIGHT SIMULATOR</Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Flappy Bird</h1>
            <p className="mt-2 text-sm text-white/55">A little lift, a steady hand, and room to fly.</p>
          </div>
          <div className="flex gap-3">
            <Card className="min-w-24 text-center">
              <p className="text-xs uppercase tracking-wider text-white/45">Score</p>
              <p className="mt-1 text-2xl font-semibold">{score}</p>
            </Card>
            <Card className="min-w-24 text-center">
              <p className="text-xs uppercase tracking-wider text-white/45">Best</p>
              <p className="mt-1 text-2xl font-semibold">{best}</p>
            </Card>
          </div>
        </header>

        <Card className="overflow-hidden p-2 sm:p-3">
          <div className="relative overflow-hidden rounded-lg">
            <canvas
              ref={canvasRef}
              onPointerDown={flap}
              aria-label="Flappy Bird game. Click or press Space to flap."
              className="block h-auto w-full cursor-pointer"
              style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
            />
            {status !== "running" ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                <p className="text-2xl font-semibold text-white drop-shadow sm:text-3xl">
                  {status === "ready" ? "Ready for takeoff?" : "Flight complete"}
                </p>
                <p className="mt-2 text-sm text-white/75">
                  {status === "ready" ? "Tap, click, or press Space to flap." : `You flew through ${score} ${score === 1 ? "pipe" : "pipes"}.`}
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-white/50">Click the sky or press <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-xs text-white/75">Space</kbd> to flap.</p>
          <Button onClick={startGame} size="lg">{status === "running" ? "Restart flight" : "Start flying"}</Button>
        </div>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent flights</h2>
              <p className="mt-1 text-sm text-white/45">Your latest results, saved on this device.</p>
            </div>
            <Badge>{history.flights.length} {history.flights.length === 1 ? "flight" : "flights"}</Badge>
          </div>
          {history.flights.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {history.flights.map((flight, index) => (
                <Card key={`${flight.date}-${index}`} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Flight {history.flights.length - index}</p>
                    <p className="mt-1 text-xs text-white/45">{new Date(flight.date).toLocaleDateString()}</p>
                  </div>
                  <Badge tone="brand">{flight.score} {flight.score === 1 ? "pipe" : "pipes"}</Badge>
                </Card>
              ))}
            </div>
          ) : (
            <Card><p className="py-2 text-center text-sm text-white/50">No flights yet. Your first run is waiting.</p></Card>
          )}
        </section>
      </div>
    </main>
  );
}
