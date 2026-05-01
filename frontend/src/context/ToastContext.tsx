import React, { createContext, useContext, useState, useCallback } from "react";

type ToastType = "success" | "error" | "info";
interface Toast { id: number; message: string; type: ToastType; }
interface ToastCtx { addToast: (message: string, type?: ToastType) => void; }

const Ctx = createContext<ToastCtx>({ addToast: () => {} });
export const useToast = () => useContext(Ctx);
let _id = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++_id;
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);

  const colors = { success: "border-green-500 bg-green-500/10", error: "border-red-500 bg-red-500/10", info: "border-accent-cyan bg-accent-cyan/10" };
  const icons = { success: "✅", error: "❌", info: "ℹ️" };

  return (
    <Ctx.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-enter glass border-l-4 ${colors[t.type]} px-4 py-3 rounded-xl shadow-2xl flex items-start gap-3`}>
            <span className="text-lg">{icons[t.type]}</span>
            <p className="text-sm text-slate-200 flex-1">{t.message}</p>
            <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-white text-xs">✕</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
