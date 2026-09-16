"use client";

import { useActionState } from "react";
import { buttonClass, smallFieldClass } from "@/components/ui";
import type { DashboardPage } from "@/lib/pages";
import { createUserType, updateUserType, type TypeState } from "./actions";

/** Create a user type (no `initial`) or edit one: name, description and the pages it may open. */
export function TypeForm({
  pages,
  initial,
}: {
  pages: DashboardPage[];
  initial?: { key: string; label: string; description: string | null; pages: string[]; sortOrder: number };
}) {
  const [state, action, pending] = useActionState<TypeState, FormData>(initial ? updateUserType : createUserType, null);
  const id = initial?.key ?? "new";

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {initial ? (
          <input type="hidden" name="key" value={initial.key} />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">מזהה באנגלית (חובה)</span>
            <input name="key" required dir="ltr" pattern="[a-z0-9-]{2,40}" placeholder="donors" className={`${smallFieldClass} w-40`} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">שם (חובה)</span>
          <input name="label" required defaultValue={initial?.label} className={`${smallFieldClass} w-56`} />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="text-xs font-semibold text-muted">תיאור</span>
          <input name="description" defaultValue={initial?.description ?? ""} className={smallFieldClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">סדר</span>
          <input name="sortOrder" type="number" defaultValue={initial?.sortOrder ?? 0} className={`${smallFieldClass} w-20`} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">עמודים שמותר לראות</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <label key={p.key} className="flex items-start gap-2 rounded-card bg-white p-3 ring-1 ring-line">
              <input type="checkbox" name="pages" value={p.key} defaultChecked={initial?.pages.includes(p.key)} className="mt-1 size-4 accent-brand" id={`${id}-${p.key}`} />
              <span>
                <span className="font-semibold">{p.label}</span>
                {p.sensitive ? <span className="ms-2 text-xs font-semibold text-warning">מידע פנימי</span> : null}
                <span className="block text-xs text-muted">{p.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
          {pending ? "שומר…" : initial ? "שמירה" : "יצירת סוג משתמש"}
        </button>
        <p role="status" className={`text-sm ${state && !state.ok ? "text-danger" : "text-success"}`}>
          {state?.message ?? ""}
        </p>
      </div>
    </form>
  );
}
