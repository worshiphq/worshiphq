"use client";

/**
 * Tiny pub/sub so any part of the app can tell the floating recycle bin "a
 * delete just happened" (refresh its count/list) without a full page reload
 * or prop-drilling. The bin provider is the only subscriber in practice, but
 * this stays generic rather than importing the provider directly, so leaf
 * components (DeleteForm, bespoke delete buttons) don't need to know it exists.
 */
import { toastNow } from "@/components/ui/feedback";
import { BIN_TOAST, binConfirm } from "@/lib/recycle-bin-config";

type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyRecycleBinChanged() {
  listeners.forEach((l) => l());
}

export function onRecycleBinChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type FlyToBinOrigin = { x: number; y: number; width: number; height: number };
type FlyListener = (origin: FlyToBinOrigin) => void;

const flyListeners = new Set<FlyListener>();

/** Tells the bin to play its "item flying in" animation from this screen rect. */
export function flyToBin(origin: FlyToBinOrigin) {
  flyListeners.forEach((l) => l(origin));
}

export function onFlyToBin(listener: FlyListener): () => void {
  flyListeners.add(listener);
  return () => flyListeners.delete(listener);
}

/** "Delete X?" confirm that also reminds people about the 7-day recycle bin. */
export function confirmBinDelete(question: string): boolean {
  return window.confirm(binConfirm(question));
}

/** After a delete succeeds: tell the user it's in the bin (and for how long),
 *  and refresh the bin's count. */
export function binDeleted(message: string = BIN_TOAST) {
  toastNow(message, "success");
  notifyRecycleBinChanged();
}
