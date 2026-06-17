import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, Float } from "@react-three/drei";
import { gsap } from "gsap";

function FloatingGem() {
  const outerRef = useRef<THREE.Mesh>(null!);
  const innerRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (outerRef.current) {
      outerRef.current.rotation.y = t * 0.12;
      outerRef.current.rotation.x = Math.sin(t * 0.18) * 0.15;
    }
    if (innerRef.current) {
      innerRef.current.rotation.y = -t * 0.08;
      innerRef.current.rotation.z = Math.cos(t * 0.22) * 0.1;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.8}>
      <group>
        <mesh ref={outerRef}>
          <octahedronGeometry args={[2.2, 0]} />
          <meshStandardMaterial
            color="#c9a96e"
            wireframe
            opacity={0.25}
            transparent
          />
        </mesh>
        <mesh ref={innerRef} scale={0.72}>
          <octahedronGeometry args={[2.2, 0]} />
          <meshStandardMaterial
            color="#c9a96e"
            opacity={0.08}
            transparent
          />
        </mesh>
        <mesh scale={1.5}>
          <icosahedronGeometry args={[1.2, 0]} />
          <meshStandardMaterial
            color="#ffffff"
            wireframe
            opacity={0.06}
            transparent
          />
        </mesh>
      </group>
    </Float>
  );
}

export function IntroAnimation3D({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const subtextRef = useRef<HTMLParagraphElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          gsap.to(containerRef.current, {
            opacity: 0,
            scale: 1.06,
            filter: "blur(18px)",
            duration: 1.4,
            ease: "power2.inOut",
            onComplete: () => {
              setShow(false);
              onComplete();
            },
          });
        },
      });

      tl.fromTo(
        lineRef.current,
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 1, ease: "power3.out" }
      )
        .fromTo(
          textRef.current,
          { opacity: 0, y: 20, filter: "blur(14px)", letterSpacing: "0.5em" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            letterSpacing: "0.18em",
            duration: 2,
            ease: "power3.out",
          },
          "-=0.5"
        )
        .fromTo(
          subtextRef.current,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
          "-=1.2"
        )
        .to({}, { duration: 1.8 });
    }, containerRef);

    return () => ctx.revert();
  }, [onComplete]);

  if (!show) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden pointer-events-none"
      style={{ background: "#050505" }}
    >
      <div className="absolute inset-0 z-0" style={{ opacity: 0.65 }}>
        <Canvas camera={{ position: [0, 0, 6], fov: 42 }}>
          <ambientLight intensity={0.25} />
          <directionalLight position={[10, 10, 5]} intensity={1.2} color="#c9a96e" />
          <directionalLight position={[-8, -8, -4]} intensity={0.4} color="#ffffff" />
          <Stars radius={120} depth={60} count={6000} factor={4} saturation={0} fade speed={1} />
          <FloatingGem />
        </Canvas>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 text-center px-8">
        <div
          ref={lineRef}
          className="w-20 h-px origin-center"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(39 45% 61% / 0.9), transparent)",
          }}
        />

        <h1
          ref={textRef}
          className="font-bold uppercase"
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "clamp(3.5rem, 10vw, 7.5rem)",
            letterSpacing: "0.18em",
            color: "transparent",
            backgroundImage:
              "linear-gradient(135deg, hsl(39 45% 82%) 0%, hsl(39 45% 62%) 45%, hsl(39 35% 42%) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 60px hsl(39 45% 61% / 0.6))",
          }}
        >
          Nestly
        </h1>

        <p
          ref={subtextRef}
          style={{
            color: "hsl(0 0% 100% / 0.38)",
            letterSpacing: "0.35em",
            fontSize: "0.7rem",
            textTransform: "uppercase",
          }}
        >
          Find Your Perfect Home
        </p>
      </div>
    </div>
  );
}
