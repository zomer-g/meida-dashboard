"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui";
import { uploadCsv, type ImportState } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(uploadCsv, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">קובצי CSV מ-Salesforce (אפשר כמה בבת אחת)</span>
        <input
          type="file"
          name="files"
          accept=".csv,text/csv"
          multiple
          required
          className="rounded-card border border-dashed border-field bg-white p-4 text-sm file:me-4 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:font-semibold file:text-white"
        />
      </label>
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "מעלה ומעבד…" : "העלאה"}
        </button>
      </div>
      <div role="status">
        {state ? (
          <ul className={`flex flex-col gap-1 rounded-card px-4 py-3 text-sm ${state.ok ? "bg-success-soft text-success" : "bg-danger-soft/40 text-danger"}`}>
            {state.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </form>
  );
}
