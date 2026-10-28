'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, EmptyState, ListRow } from '@/components/ui'
import { readLocal, writeLocal } from '@/lib/persist'

type RecordItem = { id: string; title: string; notes: string; createdAt: string }

type Pace = 'Calm' | 'Standard' | 'Swift'
type GamePhase = 'ready' | 'playing' | 'over'
type Obstacle = { x: number; gapY: number; passed: boolean }

const STORAGE_KEY = 'lastmile:flappy-bird-realistic:localStorage: run_records'
const PIPE_WIDTH = 74
const BIRD_X_RATIO = 0.25

function scoreForRun(item: RecordItem) {
  const score = Number(item.notes)
  return Number.isFinite(score) ? score : 0
}

function paceForRuns(records: RecordItem[]): Pace {
  const recent = records.slice(0, 3)
  if (!recent.length) return 'Calm'
  const average = recent.reduce((sum, run) => sum + scoreForRun(run), 0) / recent.length
  if (average >= 15) return 'Swift'
  if (average >= 5) return 'Standard'
  return 'Calm'
}

export default function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<GamePhase>('ready')
  const paceRef = useRef<Pace>('Calm')
  const scoreRef = useRef(0)
  const birdRef = useRef({ y: 0, velocity: 0 })
  const obstaclesRef = useRef<Obstacle[]>([])
  const dimensionsRef = useRef({ width: 800, height: 500 })
  const finishRunRef = useRef<(score: number) => void>(() => {})
  const [phase, setPhase] = useState<GamePhase>('ready')
  const [score, setScore] = useState(0)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saveError, setSaveError] = useState('')

  const pace = paceForRuns(records)
  paceRef.current = pace
  phaseRef.current = phase

  useEffect(() => {
    try {
      const saved = readLocal<RecordItem[]>(STORAGE_KEY, [])
      setRecords(Array.isArray(saved) ? saved.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.notes === 'string' && typeof item.createdAt === 'string') : [])
    } catch {
      setSaveError('Your saved flight history could not be loaded. You can still fly; new results will be saved when possible.')
    } finally {
      setLoaded(true)
    }
  }, [])

  const finishRun = useCallback((finalScore: number) => {
    if (phaseRef.current !== 'playing') return
    phaseRef.current = 'over'
    setPhase('over')
    setScore(finalScore)
    const run: RecordItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Flight · ${finalScore} ${finalScore === 1 ? 'gate' : 'gates'}`,
      notes: String(finalScore),
      createdAt: new Date().toISOString(),
    }
    setRecords((previous) => {
      const next = [run, ...previous].slice(0, 30)
      try {
        writeLocal(STORAGE_KEY, next)
        setSaveError('')
      } catch {
        setSaveError('This flight could not be saved. Your current result is still here; please try again after refreshing your storage settings.')
      }
      return next
    })
  }, [])
  finishRunRef.current = finishRun

  const startRun = useCallback(() => {
    const { width, height } = dimensionsRef.current
    const safeHeight = height || 500
    scoreRef.current = 0
    setScore(0)
    setSaveError('')
    birdRef.current = { y: safeHeight * 0.46, velocity: 0 }
    obstaclesRef.current = [{ x: (width || 800) + 90, gapY: safeHeight * 0.48, passed: false }]
    phaseRef.current = 'playing'
    setPhase('playing')
  }, [])

  const flap = useCallback(() => {
    if (phaseRef.current === 'playing') birdRef.current.velocity = -6.1
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let frame = 0
    let lastTime = 0
    let animationTime = 0
    let width = 800
    let height = 500
    let dpr = 1

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(320, bounds.width)
      height = Math.max(320, bounds.height)
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dimensionsRef.current = { width, height }
      if (birdRef.current.y === 0) birdRef.current.y = height * 0.46
    }

    const draw = (time: number) => {
      const groundY = height - 52
      const sky = ctx.createLinearGradient(0, 0, 0, height)
      sky.addColorStop(0, '#b9d9e9')
      sky.addColorStop(0.58, '#e7edf0')
      sky.addColorStop(1, '#f2e6cf')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, width, height)

      // Soft, layered ridgelines give the flight field depth without obscuring hazards.
      const drift = (time * 0.008) % 220
      ctx.fillStyle = '#b2c7c9'
      ctx.beginPath()
      ctx.moveTo(0, groundY)
      for (let x = -240; x <= width + 240; x += 110) {
        const px = x - drift * 0.35
        ctx.lineTo(px, groundY - 100 - Math.sin((x + drift) * 0.009) * 22)
        ctx.lineTo(px + 62, groundY - 74 - Math.cos((x + drift) * 0.011) * 18)
      }
      ctx.lineTo(width, groundY)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = '#8daeb0'
      ctx.beginPath()
      ctx.moveTo(0, groundY)
      for (let x = -180; x <= width + 180; x += 130) {
        const px = x - drift * 0.72
        ctx.lineTo(px, groundY - 63 - Math.sin((x + drift) * 0.012) * 17)
        ctx.lineTo(px + 75, groundY - 34 - Math.cos((x + drift) * 0.01) * 12)
      }
      ctx.lineTo(width, groundY)
      ctx.closePath()
      ctx.fill()

      // Clouds are deliberately light so the pipe edges remain easy to read.
      for (let i = 0; i < 5; i++) {
        const cloudX = ((i * 223 - time * 0.012) % (width + 180) + width + 180) % (width + 180) - 90
        const cloudY = 58 + (i % 3) * 54
        ctx.fillStyle = 'rgba(255,255,255,0.43)'
        ctx.beginPath()
        ctx.ellipse(cloudX, cloudY, 38, 12, 0, 0, Math.PI * 2)
        ctx.ellipse(cloudX + 28, cloudY + 2, 27, 10, 0, 0, Math.PI * 2)
        ctx.ellipse(cloudX - 24, cloudY + 4, 22, 9, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      const currentPhase = phaseRef.current
      const birdX = width * BIRD_X_RATIO
      const bird = birdRef.current
      if (currentPhase === 'ready') {
        bird.y = height * 0.46 + Math.sin(time * 0.003) * 8
        bird.velocity = 0
      }

      for (const pipe of obstaclesRef.current) {
        const gapSize = Math.min(196, Math.max(152, height * 0.39))
        const topEnd = pipe.gapY - gapSize / 2
        const bottomStart = pipe.gapY + gapSize / 2
        const drawPipe = (x: number, y: number, w: number, h: number, capAtBottom: boolean) => {
          if (h <= 0) return
          const grad = ctx.createLinearGradient(x, 0, x + w, 0)
          grad.addColorStop(0, '#315b62')
          grad.addColorStop(0.17, '#4d8586')
          grad.addColorStop(0.55, '#397175')
          grad.addColorStop(1, '#244c55')
          ctx.fillStyle = grad
          ctx.fillRect(x, y, w, h)
          ctx.fillStyle = 'rgba(255,255,255,0.19)'
          ctx.fillRect(x + 10, y, 5, h)
          ctx.fillStyle = 'rgba(15,42,49,0.26)'
          ctx.fillRect(x + w - 8, y, 8, h)
          const capHeight = 19
          const capY = capAtBottom ? y + h - capHeight : y
          ctx.fillStyle = '#244b53'
          ctx.fillRect(x - 6, capY, w + 12, capHeight)
          ctx.fillStyle = 'rgba(255,255,255,0.16)'
          ctx.fillRect(x + 2, capY + 3, w - 4, 3)
        }
        drawPipe(pipe.x, 0, PIPE_WIDTH, topEnd, true)
        drawPipe(pipe.x, bottomStart, PIPE_WIDTH, groundY - bottomStart, false)
      }

      // Ground strip and fine runway marks anchor the scene.
      ctx.fillStyle = '#d3c4a8'
      ctx.fillRect(0, groundY, width, height - groundY)
      ctx.fillStyle = '#b7a688'
      ctx.fillRect(0, groundY, width, 4)
      ctx.fillStyle = 'rgba(255,255,255,0.36)'
      const markOffset = (time * 0.08) % 72
      for (let x = -72; x < width + 72; x += 72) ctx.fillRect(x - markOffset, groundY + 22, 32, 3)

      // A small amber glider is the game's signature silhouette.
      const bob = currentPhase === 'playing' ? Math.max(-0.22, Math.min(0.3, bird.velocity * 0.035)) : Math.sin(time * 0.004) * 0.06
      ctx.save()
      ctx.translate(birdX, bird.y)
      ctx.rotate(bob)
      ctx.shadowColor = 'rgba(34,44,49,0.2)'
      ctx.shadowBlur = 12
      ctx.shadowOffsetY = 5
      ctx.fillStyle = '#f0a744'
      ctx.beginPath()
      ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = '#d7832e'
      ctx.beginPath()
      ctx.ellipse(-4, 4 + Math.sin(time * 0.025) * 2, 11, 7, -0.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(8, -5, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#202a30'
      ctx.beginPath()
      ctx.arc(9, -5, 1.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#e87543'
      ctx.beginPath()
      ctx.moveTo(17, 0)
      ctx.lineTo(28, 3)
      ctx.lineTo(17, 6)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    const loop = (time: number) => {
      const dt = lastTime ? Math.min(34, time - lastTime) : 16.67
      lastTime = time
      animationTime = time
      const currentPhase = phaseRef.current
      if (currentPhase === 'playing') {
        const scale = dt / 16.67
        const { width: gameWidth, height: gameHeight } = dimensionsRef.current
        const groundY = gameHeight - 52
        const bird = birdRef.current
        const paceNow = paceRef.current
        const speed = paceNow === 'Swift' ? 4.0 : paceNow === 'Standard' ? 3.25 : 2.7
        const spacing = paceNow === 'Swift' ? 248 : paceNow === 'Standard' ? 294 : 342
        const gapSize = Math.min(196, Math.max(152, gameHeight * 0.39))

        bird.velocity += 0.34 * scale
        bird.y += bird.velocity * scale
        for (const obstacle of obstaclesRef.current) obstacle.x -= speed * scale

        const birdX = gameWidth * BIRD_X_RATIO
        const radius = 13
        let crashed = bird.y - radius < 0 || bird.y + radius > groundY
        for (const obstacle of obstaclesRef.current) {
          const topEnd = obstacle.gapY - gapSize / 2
          const bottomStart = obstacle.gapY + gapSize / 2
          const overlapsX = birdX + radius > obstacle.x && birdX - radius < obstacle.x + PIPE_WIDTH
          if (overlapsX && (bird.y - radius < topEnd || bird.y + radius > bottomStart)) crashed = true
          if (!obstacle.passed && obstacle.x + PIPE_WIDTH < birdX - radius) {
            obstacle.passed = true
            scoreRef.current += 1
            setScore(scoreRef.current)
          }
        }
        obstaclesRef.current = obstaclesRef.current.filter((obstacle) => obstacle.x > -PIPE_WIDTH - 12)
        const lastObstacle = obstaclesRef.current[obstaclesRef.current.length - 1]
        if (!lastObstacle || lastObstacle.x < gameWidth - spacing) {
          const margin = gapSize / 2 + 34
          const minY = margin
          const maxY = Math.max(minY + 1, groundY - margin)
          const gapY = minY + Math.random() * (maxY - minY)
          obstaclesRef.current.push({ x: lastObstacle ? lastObstacle.x + spacing : gameWidth + 80, gapY, passed: false })
        }
        if (crashed) finishRunRef.current(scoreRef.current)
      }
      draw(animationTime)
      frame = window.requestAnimationFrame(loop)
    }

    resize()
    window.addEventListener('resize', resize)
    frame = window.requestAnimationFrame(loop)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || phaseRef.current !== 'playing') return
      event.preventDefault()
      birdRef.current.velocity = -6.1
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const bestScore = records.reduce((best, item) => Math.max(best, scoreForRun(item)), 0)
  const recentRuns = records.slice(0, 3)

  return (
    <main className="min-h-screen bg-[#faf9f7] px-4 pb-12 text-[#1a1d21] sm:px-6">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between py-6 sm:py-8">
          <a href="/" aria-label="Aero home" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1a1d21] text-[#f0a744] shadow-sm">
              <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true"><path d="M5 19.5 27 6l-8.6 20-3.1-8.2L5 19.5Z" fill="currentColor"/><path d="m15.3 17.8 6.3-5.2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </span>
            <span className="font-['Space_Grotesk'] text-xl font-bold tracking-tight">aero<span className="text-[#4f8cff]">.</span></span>
          </a>
          <div className="hidden items-center gap-2 rounded-full border border-[#e8e5e0] bg-white px-3.5 py-2 text-xs font-semibold text-[#667078] sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#67b99a]" /> ONE-MINUTE FLIGHT CLUB
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
          <div className="pb-1">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#4f8cff]">A little lift goes a long way</p>
            <h1 className="font-['Space_Grotesk'] text-4xl font-bold leading-[1.05] tracking-[-0.045em] sm:text-5xl lg:text-[58px]">Find your rhythm.<br className="hidden sm:block" /> <span className="text-[#7d898d]">Ride the air.</span></h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#69737a] sm:text-base">Thread the mountain gates, one tap at a time. Your flight pace adapts to your last three runs—settle in, then see how far you can soar.</p>
          </div>
          <Card className="flex items-center justify-between gap-4 rounded-2xl border border-[#ebe8e3] bg-white p-4 shadow-[0_8px_28px_rgba(32,43,50,0.04)] sm:p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#899197]">Personal best</p>
              <p className="mt-1 font-['Space_Grotesk'] text-3xl font-bold tracking-tight">{bestScore}<span className="ml-2 text-sm font-medium text-[#879096]">gates</span></p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf4ff] text-[#4f8cff]" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none"><path d="M12 3v18M5 8l7-5 7 5M6 13l6 4 6-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </Card>
        </section>

        <section className="mt-7 overflow-hidden rounded-[26px] border border-[#dce3e3] bg-[#d8e4e5] shadow-[0_20px_65px_rgba(35,53,59,0.12)]" aria-label="Aero flight game">
          <div
            className="relative h-[min(66vw,590px)] min-h-[410px] select-none overflow-hidden sm:min-h-[460px] lg:h-[540px]"
            onPointerDown={() => { if (phaseRef.current === 'playing') flap() }}
            role="application"
            aria-label="Flight field. Tap or click to fly upward; press Space on desktop."
          >
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Glider, mountain gates, score and flight environment" />

            <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-start justify-between sm:left-6 sm:right-6 sm:top-6">
              <div className="rounded-2xl border border-white/60 bg-white/85 px-4 py-2.5 shadow-sm backdrop-blur-md sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#899197]">Gates cleared</p>
                <p className="font-['Space_Grotesk'] text-2xl font-bold leading-none tabular-nums sm:text-3xl">{score}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={pace === 'Swift' ? 'warn' : pace === 'Standard' ? 'brand' : 'neutral'}>PACE · {pace}</Badge>
                <span className="rounded-full border border-white/60 bg-white/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#69737a] backdrop-blur">{pace === 'Swift' ? 'Quick turns' : pace === 'Standard' ? 'Finding flow' : 'Easy flight'}</span>
              </div>
            </div>

            {phase === 'ready' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center px-4 py-20">
                <Card className="w-full max-w-md rounded-[24px] border border-white/80 bg-white/90 p-6 text-center shadow-[0_18px_55px_rgba(32,49,54,0.16)] backdrop-blur-md sm:p-8">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff3df] text-[#d88930]">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true"><path d="M4 15.5 20 5l-6.2 14-2.2-5.7L4 15.5Z" fill="currentColor"/><path d="m11.6 13.3 4.8-4" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4f8cff]">Your runway is ready</p>
                  <h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-bold tracking-tight">Tap to Fly</h2>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#6f797f]">Clear each gate. Tap, click, or press Space to catch an updraft.</p>
                  <Button variant="primary" size="lg" className="mt-6 w-full justify-center rounded-xl" onClick={(event) => { event.stopPropagation(); startRun() }}>Start Run <span aria-hidden="true" className="ml-2">↗</span></Button>
                  <p className="mt-3 text-[11px] font-medium text-[#92999d]">No tutorial needed · just one more run</p>
                </Card>
              </div>
            )}

            {phase === 'over' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center px-4 py-20" onPointerDown={(event) => event.stopPropagation()}>
                <Card className="w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-6 text-center shadow-[0_18px_55px_rgba(32,49,54,0.18)] backdrop-blur-md sm:p-8">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#4f8cff]">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true"><path d="M4 17.5 9 12l3.3 3.3L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M15.5 7H20v4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4f8cff]">Flight complete</p>
                  <h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-bold tracking-tight">Nice flying.</h2>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-left">
                    <div className="rounded-2xl bg-[#f5f7f8] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#899197]">This run</p><p className="mt-1 font-['Space_Grotesk'] text-3xl font-bold">{score}<span className="ml-1 text-xs font-medium text-[#899197]">gates</span></p></div>
                    <div className="rounded-2xl bg-[#edf4ff] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6884af]">Best flight</p><p className="mt-1 font-['Space_Grotesk'] text-3xl font-bold text-[#315f9e]">{bestScore}<span className="ml-1 text-xs font-medium text-[#6884af]">gates</span></p></div>
                  </div>
                  <Button variant="primary" size="lg" className="mt-5 w-full justify-center rounded-xl" onClick={(event) => { event.stopPropagation(); startRun() }}>Fly Again <span aria-hidden="true" className="ml-2">↗</span></Button>
                  <p className="mt-3 text-[11px] font-medium text-[#92999d]">Next pace: {pace}</p>
                </Card>
              </div>
            )}

            {phase === 'playing' && (
              <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 flex justify-center sm:bottom-5">
                <span className="rounded-full border border-white/40 bg-[#1a1d21]/55 px-4 py-2 text-[11px] font-semibold tracking-wide text-white backdrop-blur-sm">TAP TO FLY <span className="mx-1.5 text-white/50">·</span> SPACE</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-white/60 bg-white/75 px-4 py-3 text-xs text-[#6f797f] sm:px-6">
            <span className="font-medium">A clear sky, a steady hand, and one more gate.</span>
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#67b99a]" />{loaded ? 'Flight log up to date' : 'Checking your flight log'}</span>
          </div>
        </section>

        {saveError && <p role="alert" className="mt-4 rounded-xl border border-[#f0d2c7] bg-[#fff5f0] px-4 py-3 text-sm leading-5 text-[#9a513c]">{saveError}</p>}

        <section className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="rounded-[22px] border border-[#ebe8e3] bg-white p-5 shadow-[0_8px_28px_rgba(32,43,50,0.035)] sm:p-6">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#4f8cff]">Your flight log</p><h2 className="mt-1 font-['Space_Grotesk'] text-xl font-bold tracking-tight">Recent runs</h2></div>
              <span className="text-xs font-medium text-[#8b9398]">{records.length} saved</span>
            </div>
            <div className="mt-4">
              {records.length === 0 ? (
                <EmptyState title="A clean flight log" message="Your runs will land here." description="Take off whenever you’re ready—your recent scores and best flight are saved on this device." icon="✦" className="rounded-2xl border border-dashed border-[#e8e5e0] bg-[#fbfaf8] px-5 py-7" />
              ) : (
                <div className="divide-y divide-[#f0eeea]">
                  {records.slice(0, 5).map((record) => {
                    const runScore = scoreForRun(record)
                    const date = new Date(record.createdAt)
                    const dateLabel = Number.isNaN(date.getTime()) ? 'Saved flight' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
                    return <ListRow key={record.id} record={record} title={record.title} subtitle={dateLabel} trailing={`${runScore} ${runScore === 1 ? 'gate' : 'gates'}`} className="min-w-0 py-3" />
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-[22px] border border-[#ebe8e3] bg-white p-5 shadow-[0_8px_28px_rgba(32,43,50,0.035)] sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#4f8cff]">Adaptive flight</p>
            <h2 className="mt-1 font-['Space_Grotesk'] text-xl font-bold tracking-tight">Read the air</h2>
            <p className="mt-2 text-sm leading-6 text-[#747e84]">Your pace responds to the average of your three latest finished runs.</p>
            <div className="mt-4 space-y-3">
              {(['Calm', 'Standard', 'Swift'] as Pace[]).map((level, index) => {
                const active = level === pace
                const descriptions = ['A wider window to find your wings.', 'A little more rhythm between gates.', 'Quick gates for confident pilots.']
                return <div key={level} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? 'bg-[#edf4ff]' : 'bg-[#f8f7f5]'}`}>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${active ? 'bg-[#4f8cff] text-white' : 'bg-white text-[#899197]'}`}>{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className={`text-xs font-bold ${active ? 'text-[#315f9e]' : 'text-[#4b555b]'}`}>{level}</p><p className="text-[10px] leading-4 text-[#899197]">{descriptions[index]}</p></div>
                  {active && <span className="text-[9px] font-bold uppercase tracking-wider text-[#4f8cff]">Now</span>}
                </div>
              })}
            </div>
            <p className="mt-4 border-t border-[#f0eeea] pt-3 text-[11px] leading-5 text-[#92999d]">Recent average: {recentRuns.length ? (recentRuns.reduce((sum, run) => sum + scoreForRun(run), 0) / recentRuns.length).toFixed(1) : '—'} gates · {recentRuns.length}/3 runs counted</p>
          </Card>
        </section>

        <footer className="mt-8 flex flex-col gap-2 border-t border-[#e9e6e1] pt-5 text-[11px] leading-5 text-[#969da1] sm:flex-row sm:items-center sm:justify-between">
          <span>Built for small breaks and big personal bests.</span>
          <span>Scores stay on this device. No account, no pressure.</span>
        </footer>
      </div>
    </main>
  )
}
