"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

export function OnFormComplete({ onComplete }: { onComplete: () => void }) {
  const { pending } = useFormStatus();
  const router = useRouter();
  const was = useRef(false);
  useEffect(() => {
    if (pending) was.current = true;
    else if (was.current) {
      was.current = false;
      onComplete();
      router.refresh();
    }
  }, [pending, onComplete, router]);
  return null;
}
