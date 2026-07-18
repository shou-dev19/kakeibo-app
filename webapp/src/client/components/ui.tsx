import type { ReactNode } from "react";

/** Page shell: title + optional action + responsive padded content. */
export function Page({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-teal-800 md:text-2xl">{title}</h1>
        {action}
      </header>
      {children}
    </div>
  );
}

/** A white rounded card. Clickable when onClick is provided. */
export function Card({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const base =
    "rounded-xl border border-gray-200 bg-white p-4 shadow-sm";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} text-left transition hover:border-teal-300 hover:shadow ${className}`}
      >
        {children}
      </button>
    );
  }
  return <div className={`${base} ${className}`}>{children}</div>;
}

/** Small stat block: label above a large value. */
export function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "income" | "expense" | "positive" | "negative";
}) {
  const color =
    tone === "income" || tone === "positive"
      ? "text-emerald-600"
      : tone === "expense" || tone === "negative"
        ? "text-rose-600"
        : "text-gray-800";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-lg font-bold tabular-nums md:text-xl ${color}`}>
        {value}
      </span>
    </div>
  );
}

/** Centered loading spinner. */
export function Spinner({ label = "読み込み中..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Inline error message with optional retry. */
export function ErrorMessage({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-6 text-center">
      <p className="text-sm text-rose-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-rose-600 px-4 py-1.5 text-sm font-medium text-white"
        >
          再試行
        </button>
      )}
    </div>
  );
}

/** Empty-state placeholder for zero data. */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
      {message}
    </div>
  );
}

/** Primary / secondary / danger button. */
export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-300",
    secondary:
      "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
    ghost: "text-teal-700 hover:bg-teal-50 disabled:opacity-50",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
