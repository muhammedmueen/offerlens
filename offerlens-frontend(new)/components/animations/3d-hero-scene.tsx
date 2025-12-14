"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { Float, MeshDistortMaterial } from "@react-three/drei"
import { useRef, Suspense, useState, useEffect } from "react"
import type * as THREE from "three"

function useDeviceCapability() {
  const [isCapable, setIsCapable] = useState(true)

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // Check for low-end devices
    const isLowEnd =
      navigator.hardwareConcurrency <= 4 ||
      /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    // Check WebGL support
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    const hasWebGL = !!gl

    setIsCapable(!prefersReducedMotion && !isLowEnd && hasWebGL)
  }, [])

  return isCapable
}

function FloatingSphere({
  position,
  color,
  speed = 1,
  distort = 0.3,
  size = 1,
}: {
  position: [number, number, number]
  color: string
  speed?: number
  distort?: number
  size?: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.1 * speed
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.15 * speed
    }
  })

  return (
    <Float speed={speed} rotationIntensity={0.5} floatIntensity={1}>
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[size, 32, 32]} />
        <MeshDistortMaterial
          color={color}
          attach="material"
          distort={distort}
          speed={1.5}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>
    </Float>
  )
}

function FloatingTorus({
  position,
  color,
  speed = 1,
}: {
  position: [number, number, number]
  color: string
  speed?: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.2 * speed
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.1 * speed
    }
  })

  return (
    <Float speed={speed * 0.8} rotationIntensity={0.8} floatIntensity={0.8}>
      <mesh ref={meshRef} position={position}>
        <torusGeometry args={[0.6, 0.2, 12, 24]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.8} />
      </mesh>
    </Float>
  )
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.4} color="#6366f1" />

      <FloatingSphere position={[-3, 1, -2]} color="#6366f1" speed={0.6} distort={0.3} size={0.7} />
      <FloatingSphere position={[3, -1, -3]} color="#8b5cf6" speed={0.8} distort={0.25} size={0.5} />
      <FloatingSphere position={[0, 2, -4]} color="#a855f7" speed={0.5} distort={0.35} size={0.9} />
      <FloatingTorus position={[-2, -1.5, -2]} color="#6366f1" speed={0.7} />
      <FloatingTorus position={[2.5, 1.5, -3]} color="#8b5cf6" speed={0.5} />
    </>
  )
}

function CSSFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="css-blob css-blob-1" />
      <div className="css-blob css-blob-2" />
      <div className="css-blob css-blob-3" />
    </div>
  )
}

export function HeroScene() {
  const isCapable = useDeviceCapability()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  if (!isCapable) {
    return (
      <div className="absolute inset-0 -z-10 opacity-60 dark:opacity-40">
        <CSSFallback />
      </div>
    )
  }

  return (
    <div className="absolute inset-0 -z-10 opacity-60 dark:opacity-40">
      <Suspense fallback={<CSSFallback />}>
        <Canvas
          camera={{ position: [0, 0, 5], fov: 75 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: true,
          }}
          performance={{ min: 0.5 }}
        >
          <Scene />
        </Canvas>
      </Suspense>
    </div>
  )
}
