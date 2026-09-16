import { StackedBars, type StackCategory } from "@/components/charts/StackedBars";
import { ORDINAL } from "@/components/charts/palette";
import { BarList } from "@/components/dashboard/BarList";
import { Card, StatCard, Table } from "@/components/ui";
import { EXPLAIN } from "@/lib/dashboard/explain";
import { formatDay } from "@/lib/dashboard/params";
import type { Filters } from "@/lib/foi/filters";
import { BUCKETS, COMPLETENESS, FORMATS, groupScores, refusalGrounds, requestKpis, requestList, type Dim, type GroupScore } from "@/lib/foi/metrics";
import { fmtInt } from "@/lib/format";

export const TIMELINESS_CATEGORIES: StackCategory[] = [
  { key: "נענה במועד", color: "var(--color-series-3)" },
  { key: "נענה בחריגה", color: "var(--color-series-2)" },
  { key: "בקשה פתוחה", color: "var(--color-series-4)" },
  { key: "נסגרה ללא מענה מלא", color: "var(--color-series-other)" },
];

export const BUCKET_CATEGORIES: StackCategory[] = BUCKETS.map((b, i) => ({ key: b, label: b.replace(/^\d\. /, ""), color: ORDINAL[i]! }));
export const COMPLETENESS_CATEGORIES: StackCategory[] = COMPLETENESS.map((c, i) => ({ key: c, color: [ORDINAL[1], ORDINAL[3], "var(--color-series-8)"][i]! }));
export const FORMAT_CATEGORIES: StackCategory[] = FORMATS.map((c, i) => ({ key: c, color: [ORDINAL[1], ORDINAL[3], "var(--color-series-8)"][i]! }));

const pct = (n: number) => `${Math.round(n * 100)}%`;
const score = (n: number) => n.toFixed(2);
const days = (n: number) => `${fmtInt(Math.round(n))} ימים`;

function timelinessRows(groups: GroupScore[]) {
  return groups.map((g) => ({
    label: g.label,
    counts: { "נענה במועד": g.onTime, "נענה בחריגה": g.late, "בקשה פתוחה": g.open, "נסגרה ללא מענה מלא": g.closedWithoutResponse },
  }));
}

/** Best and worst by a score, among groups with enough requests for the score to mean something. */
function extremes(groups: GroupScore[], pick: (g: GroupScore) => number | null, n = 6) {
  const scored = groups.flatMap((g) => {
    const v = pick(g);
    return v == null ? [] : [{ label: g.label, value: v }];
  });
  const sorted = [...scored].sort((a, b) => b.value - a.value);
  return { best: sorted.slice(0, n), worst: sorted.slice(-n).reverse() };
}

const DIM_NOUN: Partial<Record<Dim, string>> = { organization: "רשות", authorityType: "סוג רשות", topic: "תחום", year: "שנה" };

/**
 * The request metrics of the Looker "רשויות" / "סוגי רשויות" / "תחומי פעילות" pages,
 * for any grouping dimension: timeliness against the law, days to answer,
 * completeness and format of the response, and refusal grounds.
 */
export async function GroupMetrics({ filters, dim, limit = 15, minForRanking = 5, showOverdue = false }: { filters: Filters; dim: Dim; limit?: number; minForRanking?: number; showOverdue?: boolean }) {
  const noun = DIM_NOUN[dim] ?? "קבוצה";
  const [kpis, groups, allGroups, grounds, overdue] = await Promise.all([
    requestKpis(filters),
    groupScores(filters, dim, limit),
    groupScores(filters, dim, 500, minForRanking),
    refusalGrounds(filters),
    showOverdue ? requestList(filters, { order: "overdue", limit: 12, onlyOverdue: true }) : Promise.resolve(null),
  ]);
  const answered = kpis.onTime + kpis.late;
  const onTime = extremes(allGroups, (g) => (g.onTime + g.late >= minForRanking ? g.onTimeRate : null));
  const completeness = extremes(allGroups, (g) => (Object.values(g.completeness).reduce((s, n) => s + n, 0) >= 3 ? g.completenessScore : null), 5);
  const format = extremes(allGroups, (g) => (Object.values(g.formats).reduce((s, n) => s + n, 0) >= 3 ? g.formatScore : null), 5);

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="מדדים מרכזיים" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="בקשות שהוגשו" value={fmtInt(kpis.submitted)} info={EXPLAIN.submitted} />
        <StatCard label="נענו במועד" value={answered ? pct(kpis.onTime / answered) : "—"} hint={`${fmtInt(kpis.onTime)} מתוך ${fmtInt(answered)} שנענו`} info={EXPLAIN.onTimeRate} />
        <StatCard
          label="ימים עד מענה"
          value={kpis.avgDaysToAnswer == null ? "—" : fmtInt(kpis.avgDaysToAnswer)}
          hint={kpis.medianDaysToAnswer == null ? undefined : `חציון ${fmtInt(kpis.medianDaysToAnswer)}`}
          info={EXPLAIN.daysToAnswer}
        />
        <StatCard label="בקשות פתוחות" value={fmtInt(kpis.open)} info={EXPLAIN.openRequests} />
        <StatCard label="עתירות" value={fmtInt(kpis.petitions)} info={EXPLAIN.petitions} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title={`האם מועד המענה תאם את הוראות החוק · לפי ${noun}`}>
          <StackedBars rows={timelinessRows(groups)} categories={TIMELINESS_CATEGORIES} caption={`עמידה במועדים לפי ${noun}`} />
        </Card>
        <Card title={`זמן עד מענה מלא · לפי ${noun}`}>
          <StackedBars rows={groups.map((g) => ({ label: g.label, counts: g.buckets }))} categories={BUCKET_CATEGORIES} caption={`זמן עד מענה לפי ${noun}`} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="דירוג מועד מענה · הטובים">
          <p className="mb-3 text-xs text-muted">אחוז הבקשות שנענו במועד, ל{noun} עם {minForRanking} בקשות שנענו לפחות.</p>
          <BarList items={onTime.best} caption="הכי עומדים במועדים" format={pct} max={1} valueHead="במועד" />
        </Card>
        <Card title="דירוג מועד מענה · החלשים">
          <p className="mb-3 text-xs text-muted">אותו מדד, מהנמוך.</p>
          <BarList items={onTime.worst} caption="הכי פחות עומדים במועדים" format={pct} max={1} valueHead="במועד" />
        </Card>
        <Card title="אורח חיי הבקשה (ממוצע ימים)">
          <p className="mb-3 text-xs text-muted">{EXPLAIN.lifecycle}</p>
          <BarList
            items={[...groups].filter((g) => g.avgLifecycle != null).sort((a, b) => b.avgLifecycle! - a.avgLifecycle!).slice(0, 8).map((g) => ({ label: g.label, value: Math.round(g.avgLifecycle!) }))}
            caption={`ממוצע ימים לפי ${noun}`}
            format={days}
            valueHead="ימים"
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="האם התייחסו לכל הפריטים שהתבקשו">
          <StackedBars rows={groups.map((g) => ({ label: g.label, counts: g.completeness }))} categories={COMPLETENESS_CATEGORIES} caption={`שלמות המענה לפי ${noun}`} />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-bold">דירוג התייחסות · גבוה</h3>
              <BarList items={completeness.best} caption="דירוג התייחסות גבוה" format={score} max={3} valueHead="ציון (1–3)" />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold">דירוג התייחסות · נמוך</h3>
              <BarList items={completeness.worst} caption="דירוג התייחסות נמוך" format={score} max={3} valueHead="ציון (1–3)" />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{EXPLAIN.completenessScore}</p>
        </Card>
        <Card title="כיצד מסרו מידע טבלאי">
          <StackedBars rows={groups.map((g) => ({ label: g.label, counts: g.formats }))} categories={FORMAT_CATEGORIES} caption={`פורמט המענה לפי ${noun}`} />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-bold">דירוג פורמט · גבוה</h3>
              <BarList items={format.best} caption="דירוג פורמט גבוה" format={score} max={3} valueHead="ציון (0–3)" />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold">דירוג פורמט · נמוך</h3>
              <BarList items={format.worst} caption="דירוג פורמט נמוך" format={score} max={3} valueHead="ציון (0–3)" />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{EXPLAIN.formatScore}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="אחוז דחיות לפי נימוק">
          <p className="mb-3 text-xs text-muted">{EXPLAIN.refusalGrounds}</p>
          <BarList items={grounds.grounds.slice(0, 12).map((g) => ({ label: g.ground, value: g.share, note: `${fmtInt(g.count)} בקשות` }))} caption="נימוקי סירוב" format={(n) => `${(n * 100).toFixed(1)}%`} valueHead="שיעור" />
        </Card>
        <Card title={`מספר בקשות · לפי ${noun}`}>
          <BarList items={groups.map((g) => ({ label: g.label, value: g.total }))} caption={`בקשות לפי ${noun}`} showShareOf={kpis.submitted} />
        </Card>
      </div>

      {overdue ? (
        <Card title="הבקשות עם החריגה הגדולה ביותר">
          <p className="mb-3 text-xs text-muted">{EXPLAIN.overdue}</p>
          <Table caption="בקשות בחריגה" head={["מספר", "שם הבקשה", "רשות", "הוגשה", "אורח חיים", "ימי חריגה", "מצב"]} empty={overdue.rows.length ? undefined : "אין בקשות בחריגה בסינון הזה"}>
            {overdue.rows.map((r) => (
              <tr key={r.caseNumber}>
                <td className="px-3 py-2 tabular-nums">{r.caseNumber}</td>
                <td className="px-3 py-2">{r.name ?? "—"}</td>
                <td className="px-3 py-2">{r.organization ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDay(r.submittedOn)}</td>
                <td className="px-3 py-2 tabular-nums">{r.lifecycleDays == null ? "—" : fmtInt(r.lifecycleDays)}</td>
                <td className="px-3 py-2 font-bold tabular-nums">{r.lifecycleDays == null ? "—" : fmtInt(r.lifecycleDays - r.allowedDays)}</td>
                <td className="px-3 py-2 text-xs">{r.timeliness}</td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
