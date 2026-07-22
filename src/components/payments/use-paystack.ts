"use client";

import { useCallback } from "react";

/** Mirrors InitResult from src/lib/integrations/paystack.ts (server). */
export interface PaystackInit {
  ok: boolean;
  stubbed: boolean;
  authorizationUrl?: string;
  accessCode?: string;
  reference: string;
  error?: string;
}

interface Handlers {
  onSuccess?: (reference: string) => void | Promise<void>;
  onCancel?: () => void;
  onError?: (message: string) => void;
}

const BLUR_ID = "whq-pay-blur";

function showBlur() {
  if (document.getElementById(BLUR_ID)) return;
  const el = document.createElement("div");
  el.id = BLUR_ID;
  // Sits just under Paystack's popup iframe (z ~2147483647) so the app blurs
  // behind while the payment card stays crisp.
  el.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);background:rgba(10,12,20,.38);";
  document.body.appendChild(el);
}
function hideBlur() {
  document.getElementById(BLUR_ID)?.remove();
}

/**
 * Opens Paystack's in-app popup over a blurred dashboard. `start()` takes the
 * server InitResult (from initializePayment) plus success/cancel/error handlers.
 * In stub mode (no live keys, no access code) it falls back to the hosted
 * checkout URL so local/dev flows still work end-to-end.
 */
export function usePaystack() {
  const start = useCallback(async (init: PaystackInit, handlers: Handlers = {}) => {
    if (!init.ok) {
      handlers.onError?.(init.error ?? "Couldn't start the payment. Please try again.");
      return;
    }
    if (init.stubbed || !init.accessCode) {
      if (init.authorizationUrl) window.location.href = init.authorizationUrl;
      else handlers.onError?.("Payments aren't configured yet.");
      return;
    }

    try {
      const mod = await import("@paystack/inline-js");
      const PaystackPop = mod.default;
      const popup = new PaystackPop();
      showBlur();
      popup.resumeTransaction(init.accessCode, {
        onSuccess: async (txn: { reference?: string }) => {
          hideBlur();
          await handlers.onSuccess?.(txn?.reference ?? init.reference);
        },
        onCancel: () => {
          hideBlur();
          handlers.onCancel?.();
        },
        onError: (err: { message?: string }) => {
          hideBlur();
          handlers.onError?.(err?.message ?? "Payment could not be completed.");
        },
      });
    } catch {
      hideBlur();
      // If the popup SDK fails to load, fall back to hosted checkout.
      if (init.authorizationUrl) window.location.href = init.authorizationUrl;
      else handlers.onError?.("Couldn't open the payment window.");
    }
  }, []);

  return { start };
}
