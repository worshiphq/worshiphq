"use client";

import { Suspense, lazy } from "react";
const Spline = lazy(() => import("@splinetool/react-spline"));

interface SplineSceneProps {
  scene: string;
  className?: string;
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div className="flex size-full items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary-bright" />
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}
