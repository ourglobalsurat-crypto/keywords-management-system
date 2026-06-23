"use client";

import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

const EVENT = "app-toast";

export function toast(message: string, type: ToastType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, type } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let counter = 0;
    function onToast(e: Event) {
      const detail = (e as CustomEvent).detail as { message: string; type: ToastType };
      const id = ++counter;
      setItems((prev) => [...prev, { id, ...detail }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.type === "success"
              ? "bg-emerald-600"
              : t.type === "error"
                ? "bg-red-600"
                : "bg-slate-800"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
