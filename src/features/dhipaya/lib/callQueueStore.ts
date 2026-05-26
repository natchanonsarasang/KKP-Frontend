import { useEffect, useState } from "react";
import type { Customer } from "./types";

// Tiny pub/sub store shared between CustomersList and CallList.
let queued: Customer[] = [];
const listeners = new Set<(v: Customer[]) => void>();

function emit() {
  for (const l of listeners) l(queued);
}

export function getQueuedCustomers(): Customer[] {
  return queued;
}

export function addToCallQueue(customers: Customer[]) {
  const existingIds = new Set(queued.map((c) => c.id));
  const additions = customers.filter((c) => !existingIds.has(c.id));
  if (additions.length === 0) return 0;
  queued = [...queued, ...additions];
  emit();
  return additions.length;
}

export function removeFromCallQueue(id: string) {
  queued = queued.filter((c) => c.id !== id);
  emit();
}

export function clearCallQueue() {
  queued = [];
  emit();
}

export function useCallQueue(): Customer[] {
  const [state, setState] = useState<Customer[]>(queued);
  useEffect(() => {
    listeners.add(setState);
    setState(queued);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
