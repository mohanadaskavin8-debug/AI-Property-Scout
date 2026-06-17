import { useEffect, useRef, useState, Component, type ReactNode, type ErrorInfo } from "react";
import { gsap } from "gsap";

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function CSSIntro({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const lineTopRef = useRef<HTMLDivElement>(null);
  const lineBottomRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          gsap.to(containerRef.current, {
            opacity: 0,
            scale: 1.04,
            filter: "blur(12px)",
            duration: 1.2,
            ease: "power2.inOut",
            onComplete: () => onComplete(),
          });
        },
      });

      tl.fromTo(
        particlesRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 2, ease: "power2.out" }
      )
        .fromTo(
          [lineTopRef.current, lineBottomRef.current],
          { scaleX: 0, opacity: 0 },
          { scaleX: 1, opacity: 1, duration: 1.1, ease: "power3.out", stagger: 0.15 },
          "-=1.5"
        )
        .fromTo(
          titleRef.current,
          { opacity: 0, y: 24, filter: "blur(20px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.8, ease: "power3.out" },
          "-=0.8"
        )
        .fromTo(
          subtitleRef.current,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 1.1, ease: "power2.out" },
          "-=1"
        )
        .to({}, { duration: 1.8 });
    }, containerRef);

    return () => ctx.revert();
  }, [onComplete]);

  const particles = Array.from({ length: 80 }, (_, i) => i);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "#050505" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, hsl(39 45% 61% / 0.06) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 100%, hsl(39 45% 61% / 0.08) 0%, transparent 70%)",
        }}
      />

      <div ref={particlesRef} className="absolute inset-0 pointer-events-none" style={{ opacity: 0 }}>
        {particles.map((i) => {
          const x = Math.random() * 100;
          const y = Math.random() * 100;
          const size = 1 + Math.random() * 2;
          const delay = Math.random() * 5;
          const dur = 4 + Math.random() * 6;
          const op = 0.08 + Math.random() * 0.35;
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                background: `hsl(39 45% 61% / ${op})`,
                animation: `nestly-float ${dur}s ease-in-out ${delay}s infinite alternate`,
              }}
            />
          );
        })}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5 px-8 text-center">
        <div
          ref={lineTopRef}
          className="w-24 h-px origin-center"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(39 45% 61% / 0.8), transparent)",
          }}
        />

        <h1
          ref={titleRef}
          className="font-bold uppercase"
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "clamp(3.5rem, 10vw, 7.5rem)",
            letterSpacing: "0.18em",
            color: "transparent",
            backgroundImage:
              "linear-gradient(135deg, hsl(39 45% 80%) 0%, hsl(39 45% 62%) 45%, hsl(39 35% 42%) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 60px hsl(39 45% 61% / 0.5))",
          }}
        >
          Nestly
        </h1>

        <p
          ref={subtitleRef}
          style={{
            color: "hsl(0 0% 100% / 0.38)",
            letterSpacing: "0.35em",
            fontSize: "0.7rem",
            textTransform: "uppercase",
          }}
        >
          Find Your Perfect Home
        </p>

        <div
          ref={lineBottomRef}
          className="w-24 h-px origin-center"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(39 45% 61% / 0.5), transparent)",
          }}
        />
      </div>

      <style>{`
        @keyframes nestly-float {
          0%   { transform: translateY(0px) translateX(0px); }
          100% { transform: translateY(-18px) translateX(8px); opacity: 0.05; }
        }
      `}</style>
    </div>
  );
}

function ThreeIntroLazy({
  onComplete,
  onError,
}: {
  onComplete: () => void;
  onError: () => void;
}) {
  const [Comp, setComp] = useState<React.ComponentType<{ onComplete: () => void }> | null>(null);

  useEffect(() => {
    import("./IntroAnimation3D.tsx")
      .then((mod) => setComp(() => mod.IntroAnimation3D))
      .catch(() => onError());
  }, [onError]);

  if (!Comp) return null;

  return (
    <CanvasErrorBoundary onError={onError}>
      <Comp onComplete={onComplete} />
    </CanvasErrorBoundary>
  );
}

export function IntroAnimation({ onComplete }: { onComplete: () => void }) {
  const [webgl] = useState(() => checkWebGL());
  const [fallback, setFallback] = useState(false);

  if (webgl && !fallback) {
    return (
      <ThreeIntroLazy
        onComplete={onComplete}
        onError={() => setFallback(true)}
      />
    );
  }

  return <CSSIntro onComplete={onComplete} />;
}
