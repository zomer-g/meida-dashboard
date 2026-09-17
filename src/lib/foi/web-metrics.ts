import { desc, eq, sql } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { addDays, israelDay } from "@/lib/dashboard/params";
import { getDb } from "@/lib/db/client";
import { gaChannelDaily, gaPageDaily, smoovCampaigns, smoovCampaignStats, smoovLists } from "@/lib/db/schema";
import type { Filters } from "./filters";

/** Site traffic (GA4 mirror) and mailings (SMOOV mirror) for /web. "All" means the last 365 days here. */
export function webMetrics(f: Filters) {
  const from = f.from ?? addDays(israelDay(), -364);
  const to = f.to ?? israelDay();
  return cached(`webMetrics:${from}:${to}`, async () => {
    const db = getDb();
    const inRange = (col: typeof gaChannelDaily.date | typeof gaPageDaily.date) => sql`${col} between ${from} and ${to}`;
    const [totals] = await db
      .select({
        sessions: sql<number>`coalesce(sum(${gaChannelDaily.sessions}), 0)::int`,
        newUsers: sql<number>`coalesce(sum(${gaChannelDaily.newUsers}), 0)::int`,
        engaged: sql<number>`coalesce(sum(${gaChannelDaily.engagedSessions}), 0)::int`,
      })
      .from(gaChannelDaily)
      .where(inRange(gaChannelDaily.date));
    const channels = await db
      .select({ label: gaChannelDaily.channelGroup, n: sql<number>`sum(${gaChannelDaily.sessions})::int` })
      .from(gaChannelDaily)
      .where(inRange(gaChannelDaily.date))
      .groupBy(gaChannelDaily.channelGroup)
      .orderBy(desc(sql`2`));
    const monthly = await db
      .select({ day: sql<string>`${gaChannelDaily.date}::text`, label: gaChannelDaily.channelGroup, n: sql<number>`sum(${gaChannelDaily.sessions})::int` })
      .from(gaChannelDaily)
      .where(inRange(gaChannelDaily.date))
      .groupBy(sql`1`, gaChannelDaily.channelGroup);
    const pages = await db
      .select({ path: gaPageDaily.pagePath, title: sql<string>`max(${gaPageDaily.pageTitle})`, views: sql<number>`sum(${gaPageDaily.views})::int` })
      .from(gaPageDaily)
      .where(inRange(gaPageDaily.date))
      .groupBy(gaPageDaily.pagePath)
      .orderBy(desc(sql`3`))
      .limit(15);
    const [pageViews] = await db
      .select({ n: sql<number>`coalesce(sum(${gaPageDaily.views}), 0)::int` })
      .from(gaPageDaily)
      .where(inRange(gaPageDaily.date));
    const campaigns = await db
      .select({ campaign: smoovCampaigns, stats: smoovCampaignStats })
      .from(smoovCampaigns)
      .leftJoin(smoovCampaignStats, eq(smoovCampaignStats.campaignId, smoovCampaigns.id))
      .where(eq(smoovCampaigns.active, true))
      .orderBy(desc(smoovCampaignStats.sentAt));
    const [lists] = await db.select({ n: sql<number>`count(*)::int`, contacts: sql<number>`coalesce(sum(${smoovLists.contactsCount}), 0)::int` }).from(smoovLists);

    return {
      from,
      to,
      sessions: totals?.sessions ?? 0,
      newUsers: totals?.newUsers ?? 0,
      engaged: totals?.engaged ?? 0,
      pageViews: pageViews?.n ?? 0,
      channels,
      overTime: monthly.map((m) => ({ day: m.day, label: m.label, n: Number(m.n) })),
      pages,
      campaigns,
      lists: lists?.n ?? 0,
      contacts: lists?.contacts ?? 0,
    };
  });
}
