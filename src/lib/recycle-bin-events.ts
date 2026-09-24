"use client";

/**
 * Tiny pub/sub so any part of the app can tell the floating recycle bin "a
 * delete just happened" (refresh its count/list) without a full page reload
 * or prop-drilling. The bin provider is the only subscriber in practice, but
 * this stays generic rather than importing the provider directly, so leaf
 * components (DeleteForm, bespoke delete buttons) don't need to know it exists.
 */
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
