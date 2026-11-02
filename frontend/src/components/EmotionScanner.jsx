// src/components/EmotionScanner.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Real-Time Facial Emotion Scanner (Vibe Check)
// Uses @vladmandic/face-api (TinyFaceDetector + FaceExpressionNet) in the browser.
// Detects Happy, Sad, Angry, Surprised, locks in for 3 continuous seconds,
// and automatically triggers tailored mood/genre recommendations from the backend.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'
import * as faceapi from '@vladmandic/face-api'
import {
  Camera,
  CameraOff,
  Sparkles,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  ScanFace,
  Volume2,
} from 'lucide-react'

// ── Emotion to Genre / Backend Mood Mapping ──────────────────────────────────
export const EMOTION_MAP = {
  happy: {
    label: 'Happy',
    emoji: '😄',
    color: '#22c55e', // Emerald Green
    mood: 'feelgood',
    genreTitle: 'Feel-Good & Cozy Comedy',
    headline: 'HIGH SPIRITS: KEEP THE GOOD VIBES GOING',
    subline: 'Uplifting cinema, heartwarming stories, and feel-good favorites to match your energy.',
    fallbackQuery: 'Paddington',
  },
  sad: {
    label: 'Sad',
    emoji: '😢',
    color: '#3b82f6', // Bright Blue
    mood: 'feelgood',
    genreTitle: 'Comfort Comedy & Warm Cinema',
    headline: 'CHEER UP: WARMTH & COMFORT CINEMA',
    subline: 'Need a lift? Here are laugh-out-loud comedies and warm hugs in movie form.',
    fallbackQuery: 'Forrest Gump',
  },
  angry: {
    label: 'Angry',
    emoji: '😠',
    color: '#ef4444', // Red
    mood: 'action',
    genreTitle: 'High-Octane Adrenaline Action',
    headline: 'BLOW OFF STEAM: INTENSE ACTION THRILLS',
    subline: 'Channel that fire into intense stunts, explosive set pieces, and non-stop momentum.',
    fallbackQuery: 'Mad Max: Fury Road',
  },
  surprised: {
    label: 'Surprised',
    emoji: '😲',
    color: '#a855f7', // Purple
    mood: 'scifi',
    genreTitle: 'Mind-Bending Sci-Fi & Cosmic Twists',
    headline: 'FEED YOUR WONDER: MINDBENDING TWISTS',
    subline: 'Keep your mind racing with stunning twists, mysterious realities, and deep sci-fi concepts.',
    fallbackQuery: 'Inception',
  },
}

const TARGET_EMOTIONS = ['happy', 'sad', 'angry', 'surprised']
const LOCK_IN_DURATION_MS = 3000 // 3 seconds continuous hold

export default function EmotionScanner({ onEmotionSelect, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)

  // Tracking state for 3-second hold
  const currentEmotionRef = useRef(null)
  const lockStartTimeRef = useRef(null)

  // Component state
  const [modelLoading, setModelLoading] = useState(true)
  const [modelError, setModelError] = useState(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)

  // Real-time detection state
  const [detectedEmotion, setDetectedEmotion] = useState(null)
  const [emotionConfidence, setEmotionConfidence] = useState(0)
  const [lockProgress, setLockProgress] = useState(0) // 0 to 100%
  const [lockedEmotion, setLockedEmotion] = useState(null)
  const [liveScores, setLiveScores] = useState({})

  // ── 1. Load Face-API Model Weights ──────────────────────────────────────────
  useEffect(() => {
    let isMounted = true
    async function loadModels() {
      try {
        setModelLoading(true)
        setModelError(null)

        // Path to model weights in Vite's public/ folder
        const MODEL_URL = '/models'

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ])

        if (isMounted) {
          setModelLoading(false)
        }
      } catch (err) {
        console.error('Failed to load face-api models:', err)
        if (isMounted) {
          setModelError('Could not load AI models from /models. Check model files.')
          setModelLoading(false)
        }
      }
    }

    loadModels()
    return () => {
      isMounted = false
    }
  }, [])

  // ── 2. Start Webcam ────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      setPermissionDenied(false)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480 },
          height: { ideal: 360 },
          facingMode: 'user',
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setIsCameraActive(true)
    } catch (err) {
      console.warn('Camera permission denied or camera unavailable:', err)
      setPermissionDenied(true)
      setIsCameraActive(false)
    }
  }, [])

  // ── 3. Stop Webcam ─────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
    }
    setIsCameraActive(false)
    setLockProgress(0)
    currentEmotionRef.current = null
    lockStartTimeRef.current = null
  }, [])

  // Auto-start camera once models are ready
  useEffect(() => {
    if (!modelLoading && !modelError) {
      startCamera()
    }
    return () => stopCamera()
  }, [modelLoading, modelError, startCamera, stopCamera])

  // ── 4. Real-Time Detection Loop ────────────────────────────────────────────
  const runDetection = useCallback(async () => {
    if (!videoRef.current || !isCameraActive || lockedEmotion) return

    const video = videoRef.current
    if (video.readyState === 4 && !video.paused) {
      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceExpressions()

        if (detection && detection.expressions) {
          const expressions = detection.expressions
          setLiveScores(expressions)

          // Find the dominant target emotion (Happy, Sad, Angry, Surprised)
          let topEmotion = null
          let topScore = 0

          TARGET_EMOTIONS.forEach((emo) => {
            const score = expressions[emo] || 0
            if (score > topScore) {
              topScore = score
              topEmotion = emo
            }
          })

          // Require a minimum threshold (e.g. 40% confidence)
          if (topEmotion && topScore >= 0.4) {
            setDetectedEmotion(topEmotion)
            setEmotionConfidence(Math.round(topScore * 100))

            // ── 3-Second Continuous Lock Logic ──
            const now = Date.now()

            if (currentEmotionRef.current === topEmotion) {
              const elapsed = now - lockStartTimeRef.current
              const progress = Math.min(100, Math.round((elapsed / LOCK_IN_DURATION_MS) * 100))
              setLockProgress(progress)

              // Trigger lock-in when threshold reached!
              if (elapsed >= LOCK_IN_DURATION_MS) {
                const config = EMOTION_MAP[topEmotion]
                setLockedEmotion(topEmotion)
                stopCamera()

                if (onEmotionSelect) {
                  onEmotionSelect({
                    emotion: topEmotion,
                    config,
                  })
                }
                return
              }
            } else {
              // Emotion changed: reset timer for the new emotion
              currentEmotionRef.current = topEmotion
              lockStartTimeRef.current = now
              setLockProgress(0)
            }
          } else {
            // Expression ambiguous or neutral
            setDetectedEmotion(null)
            currentEmotionRef.current = null
            lockStartTimeRef.current = null
            setLockProgress(0)
          }
        } else {
          // No face detected
          setDetectedEmotion(null)
          currentEmotionRef.current = null
          lockStartTimeRef.current = null
          setLockProgress(0)
        }
      } catch (err) {
        console.warn('Detection error:', err)
      }
    }

    // Schedule next detection frame
    animFrameRef.current = requestAnimationFrame(runDetection)
  }, [isCameraActive, lockedEmotion, stopCamera, onEmotionSelect])

  useEffect(() => {
    if (isCameraActive && !lockedEmotion) {
      animFrameRef.current = requestAnimationFrame(runDetection)
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isCameraActive, lockedEmotion, runDetection])

  // ── Manual Simulation Fallback for Testing / Evaluators ───────────────────
  const handleSimulateEmotion = (emoKey) => {
    const config = EMOTION_MAP[emoKey]
    setLockedEmotion(emoKey)
    stopCamera()
    if (onEmotionSelect) {
      onEmotionSelect({
        emotion: emoKey,
        config,
      })
    }
  }

  const activeConfig = detectedEmotion ? EMOTION_MAP[detectedEmotion] : null

  return (
    <div className="relative rounded-2xl bg-[#0f1117] border border-white/[0.08] p-5 shadow-2xl overflow-hidden max-w-xl mx-auto">
      {/* Glow Effect */}
      <div
        className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-700"
        style={{ backgroundColor: activeConfig ? activeConfig.color : '#e50914' }}
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.07] mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-[#e50914] flex items-center justify-center shadow-lg shadow-violet-900/30">
            <ScanFace size={18} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              AI VIBE CHECK
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                Face Emotion
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              Hold an emotion for 3s to lock in custom movie recs
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Main Scanner Section */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        {/* Video Feed Frame */}
        <div className="relative w-48 h-36 sm:w-56 sm:h-44 rounded-xl overflow-hidden bg-black border border-white/[0.1] shrink-0 flex items-center justify-center shadow-inner">
          {modelLoading ? (
            <div className="flex flex-col items-center gap-2 text-zinc-400 p-3 text-center">
              <RefreshCw size={18} className="animate-spin text-violet-400" />
              <span className="text-[11px]">Loading AI models…</span>
            </div>
          ) : permissionDenied ? (
            <div className="flex flex-col items-center gap-1.5 text-zinc-400 p-3 text-center">
              <CameraOff size={20} className="text-amber-400" />
              <span className="text-[11px] text-amber-300">Webcam Denied</span>
              <button
                onClick={startCamera}
                className="text-[10px] text-white bg-white/[0.1] px-2.5 py-1 rounded hover:bg-white/[0.2] mt-1"
              >
                Retry Camera
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
              <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

              {/* HUD Target Reticle */}
              <div className="absolute inset-2 border border-white/20 rounded-lg pointer-events-none flex flex-col justify-between p-1">
                <div className="flex justify-between">
                  <span className="w-2 h-2 border-t-2 border-l-2 border-violet-400" />
                  <span className="w-2 h-2 border-t-2 border-r-2 border-violet-400" />
                </div>
                <div className="flex justify-between">
                  <span className="w-2 h-2 border-b-2 border-l-2 border-violet-400" />
                  <span className="w-2 h-2 border-b-2 border-r-2 border-violet-400" />
                </div>
              </div>

              {/* Status Badge */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/70 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-zinc-300">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
                <span>{detectedEmotion ? `${emotionConfidence}%` : 'SCANNING'}</span>
              </div>
            </>
          )}
        </div>

        {/* Emotion Display & 3-Second Lock-in Meter */}
        <div className="flex-1 w-full space-y-3">
          {lockedEmotion ? (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center animate-fadeIn">
              <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase mb-1">
                <CheckCircle2 size={14} /> Emotion Locked In!
              </div>
              <div className="text-2xl font-extrabold text-white flex items-center justify-center gap-2">
                <span>{EMOTION_MAP[lockedEmotion]?.emoji}</span>
                <span>{EMOTION_MAP[lockedEmotion]?.label}</span>
              </div>
              <p className="text-[12px] text-zinc-300 mt-1">
                Switching vibe to:{' '}
                <span className="font-semibold text-emerald-300">
                  {EMOTION_MAP[lockedEmotion]?.genreTitle}
                </span>
              </p>
            </div>
          ) : (
            <>
              {/* Detected Emotion Card */}
              <div className="bg-[#13161b] rounded-xl p-3 border border-white/[0.07]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                    Detected Emotion
                  </span>
                  {activeConfig && (
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${activeConfig.color}20`,
                        color: activeConfig.color,
                      }}
                    >
                      {activeConfig.label} ({emotionConfidence}%)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-3xl">
                    {activeConfig ? activeConfig.emoji : '😐'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {activeConfig ? activeConfig.genreTitle : 'Show an Expression'}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {activeConfig
                        ? `Hold steady to load recommendations`
                        : 'Try smiling, frowning, or acting surprised!'}
                    </p>
                  </div>
                </div>

                {/* 3-Second Hold Progress Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-1 font-mono">
                    <span>3s Lock-in Progress</span>
                    <span style={{ color: activeConfig?.color || '#a1a1aa' }}>
                      {lockProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full transition-all duration-150 rounded-full"
                      style={{
                        width: `${lockProgress}%`,
                        backgroundColor: activeConfig ? activeConfig.color : '#a855f7',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Emotion Breakdown */}
              <div className="grid grid-cols-4 gap-1.5">
                {TARGET_EMOTIONS.map((emo) => {
                  const cfg = EMOTION_MAP[emo]
                  const score = Math.round((liveScores[emo] || 0) * 100)
                  const isCurrent = detectedEmotion === emo
                  return (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => handleSimulateEmotion(emo)}
                      className={`px-1.5 py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-white/[0.12] border-white/40 shadow-sm'
                          : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07]'
                      }`}
                      title={`Click to simulate ${cfg.label}`}
                    >
                      <div className="text-base">{cfg.emoji}</div>
                      <div className="text-[9px] text-zinc-400 truncate font-semibold">
                        {cfg.label}
                      </div>
                      <div className="text-[9px] font-mono font-bold text-zinc-300">
                        {score}%
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Manual Fallback Tester info */}
      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Camera size={13} className="text-zinc-400" />
          Camera data processed 100% locally on-device
        </span>
        <span className="italic text-zinc-500">Tip: Click any emoji to test directly</span>
      </div>
    </div>
  )
}

