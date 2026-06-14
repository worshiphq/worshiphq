"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

/**
 * Renders nothing; calls `onComplete` once the enclosing form's bound server
 * action finishes (pending true → false). Place inside a <form>. Useful for
 * closing a modal only after the save succeeds, not on submit.
 */
export function OnFormComplete({ onComplete }: { onComplete: () => void }) {
  const { pending } = useFormStatus();
  const was = useRef(false);
  useEffect(() => {
    if (pending) was.current = true;
    else if (was.current) {
      was.current = false;
      onComplete();
    }
  }, [pending, onComplete]);
  return null;
}
