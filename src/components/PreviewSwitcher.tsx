import { setPreview } from "@/app/(app)/preview-actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { buttonClass, smallFieldClass } from "./ui";

/**
 * Shown to real admins only: see the platform as a lower role or as a user type.
 * Applied with a button, not on change: arrowing through a closed select fires
 * `change` on every key, which would switch views mid-choice (WCAG 3.2.2).
 */
export function PreviewSwitcher({ current, types }: { current: string; types: { key: string; label: string }[] }) {
  return (
    <form action={setPreview} className="flex items-center gap-2">
      <label htmlFor="view-as" className="text-xs text-muted">
        צפייה כ
      </label>
      <select key={current} id="view-as" name="as" defaultValue={current} className={smallFieldClass}>
        <option value="admin">{ROLE_LABELS.admin} (אני)</option>
        <optgroup label="תפקיד">
          <option value="editor">{ROLE_LABELS.editor}</option>
          <option value="viewer">{ROLE_LABELS.viewer}</option>
        </optgroup>
        {types.length ? (
          <optgroup label="סוג משתמש">
            {types.map((t) => (
              <option key={t.key} value={`type:${t.key}`}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <button type="submit" className={buttonClass("quiet", "sm")}>
        החלה
      </button>
    </form>
  );
}
