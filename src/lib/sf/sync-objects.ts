import type { PgTableWithColumns } from "drizzle-orm/pg-core";
import { sfCase, sfCaseHistory, sfRecordType, sfUser } from "@/lib/db/schema";
import { saveCaseLabels } from "@/lib/foi/from-salesforce";
import type { SfDescribe } from "./types";

export type SfRecord = Record<string, unknown>;

export interface SyncObjectDef {
  /** Salesforce API name. */
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>;
  /** Monotonic field the incremental sync resumes from. */
  cursorField: "SystemModstamp" | "CreatedDate";
  /** Extra SOQL filter, applied to every query for this object. */
  where?: string;
  /** Only these fields (intersected with what the org has). Omit for all fields. */
  include?: string[];
  /** Fields never copied — bulky free text no metric uses. */
  exclude?: string[];
  /** Has IsDeleted, so deletions can be picked up from the recycle bin. */
  hasIsDeleted: boolean;
  /** Nightly id comparison to catch records purged from the recycle bin. */
  reconcile: boolean;
  /** Skip quietly when the integration user cannot see the object. */
  optional?: boolean;
  /** Also select `<Relationship>.Name` for lookups to these objects (any custom object too), so names travel with ids. */
  lookupNames?: string[];
  /**
   * Reload everything when the set of selected fields changes — e.g. a permission
   * newly lets the integration user see a field — so existing rows pick it up too.
   */
  reloadOnFieldChange?: boolean;
  /** Runs with each fresh describe (the Case field labels are kept for the request mapping). */
  onDescribe?: (describe: SfDescribe) => Promise<void>;
  toRow(record: SfRecord): Record<string, unknown>;
}

const str = (r: SfRecord, f: string): string | null => {
  const v = r[f];
  return typeof v === "string" && v !== "" ? v : v == null ? null : String(v);
};

const bool = (r: SfRecord, f: string): boolean => r[f] === true;

/** Salesforce datetimes end in "+0000", which not every Date parser accepts. */
export function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
}

const date = (r: SfRecord, f: string) => toDate(r[f]);

/**
 * Synced in this order: lookups first. An information request is a Case; the
 * Movement's custom fields (dates, refusal grounds, petition, publications) are
 * all Case fields, so Case is copied with every field.
 */
export const SYNC_OBJECTS: SyncObjectDef[] = [
  {
    name: "RecordType",
    table: sfRecordType,
    cursorField: "SystemModstamp",
    include: ["Id", "SobjectType", "DeveloperName", "Name", "IsActive", "SystemModstamp"],
    hasIsDeleted: false,
    reconcile: false,
    toRow: (r) => ({
      id: str(r, "Id"),
      sobjectType: str(r, "SobjectType"),
      developerName: str(r, "DeveloperName"),
      name: str(r, "Name"),
      isActive: bool(r, "IsActive"),
      systemModstamp: date(r, "SystemModstamp"),
    }),
  },
  {
    name: "User",
    table: sfUser,
    cursorField: "SystemModstamp",
    include: ["Id", "Name", "Email", "IsActive", "SystemModstamp"],
    hasIsDeleted: false,
    reconcile: false,
    optional: true,
    toRow: (r) => ({
      id: str(r, "Id"),
      name: str(r, "Name"),
      email: str(r, "Email")?.toLowerCase() ?? null,
      isActive: bool(r, "IsActive"),
      systemModstamp: date(r, "SystemModstamp"),
    }),
  },
  {
    name: "Case",
    table: sfCase,
    cursorField: "SystemModstamp",
    hasIsDeleted: true,
    reconcile: true,
    // "שם הארגון אליו מופנת הבקשה", "המטפל בבקשה" and the owner are lookups: the dashboard needs their names.
    lookupNames: ["Account", "Contact", "User", "Group"],
    reloadOnFieldChange: true,
    onDescribe: saveCaseLabels,
    toRow: (r) => ({
      id: str(r, "Id"),
      caseNumber: str(r, "CaseNumber"),
      recordTypeId: str(r, "RecordTypeId"),
      status: str(r, "Status"),
      ownerId: str(r, "OwnerId"),
      createdDate: date(r, "CreatedDate"),
      closedDate: date(r, "ClosedDate"),
      systemModstamp: date(r, "SystemModstamp"),
      isDeleted: bool(r, "IsDeleted"),
      data: r,
    }),
  },
  {
    name: "CaseHistory",
    table: sfCaseHistory,
    cursorField: "CreatedDate",
    include: ["Id", "CaseId", "Field", "OldValue", "NewValue", "DataType", "CreatedDate", "CreatedById"],
    // Status and owner changes only; Subject/Description history would copy free text for no metric.
    where: "Field IN ('Status', 'Owner', 'created')",
    hasIsDeleted: false,
    reconcile: false,
    optional: true,
    toRow: (r) => ({
      id: str(r, "Id"),
      caseId: str(r, "CaseId"),
      field: str(r, "Field"),
      oldValue: str(r, "OldValue"),
      newValue: str(r, "NewValue"),
      dataType: str(r, "DataType"),
      createdDate: date(r, "CreatedDate"),
      createdById: str(r, "CreatedById"),
    }),
  },
];
