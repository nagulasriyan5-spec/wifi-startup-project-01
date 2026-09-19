import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { pmWaniCompliance } from "@db/schema";
import { appendLedgerEntry } from "./queries/ledger";
import { publishRealtimeEvent } from "./realtime";

const roleSchema = z.enum(["pdo", "pdoa", "app_provider", "not_applicable"]);
const statusSchema = z.enum(["not_applicable", "pending", "ready", "approved", "expired", "blocked"]);

function getChecklist(input?: typeof pmWaniCompliance.$inferSelect | null) {
  const notApplicable = !input || input.role === "not_applicable" || input.status === "not_applicable";
  return [
    {
      key: "registration",
      label: "PM-WANI registration details",
      done: notApplicable || Boolean(input?.cdoRegistrationNumber || input?.pdoaRegistrationNumber),
    },
    {
      key: "kyc",
      label: "PDO/PDOA KYC reference",
      done: notApplicable || Boolean(input?.kycReference),
    },
    {
      key: "retention",
      label: "User/session log retention configured",
      done: notApplicable || Number(input?.retentionDays ?? 0) >= 365,
    },
    {
      key: "terms",
      label: "Subscriber terms and lawful-use notice accepted",
      done: notApplicable || Boolean(input?.termsAccepted),
    },
    {
      key: "audit",
      label: "Operational audit scheduled",
      done: notApplicable || Boolean(input?.nextAuditAt),
    },
  ];
}

export const complianceRouter = createRouter({
  getPmWani: authedQuery
    .input(z.object({ merchantId: z.number(), branchId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.branchId
        ? and(
            eq(pmWaniCompliance.merchantId, input.merchantId),
            eq(pmWaniCompliance.branchId, input.branchId),
          )
        : eq(pmWaniCompliance.merchantId, input.merchantId);
      const rows = await db.select()
        .from(pmWaniCompliance)
        .where(where)
        .limit(1);
      const compliance = rows.at(0) ?? null;

      return {
        compliance,
        checklist: getChecklist(compliance),
      };
    }),

  savePmWani: authedQuery
    .input(
      z.object({
        id: z.number().optional(),
        merchantId: z.number(),
        branchId: z.number().optional(),
        role: roleSchema,
        status: statusSchema,
        cdoRegistrationNumber: z.string().max(100).optional(),
        pdoaRegistrationNumber: z.string().max(100).optional(),
        kycReference: z.string().max(100).optional(),
        publicDataOfficeName: z.string().max(255).optional(),
        termsAccepted: z.boolean().default(false),
        userKycRequired: z.boolean().default(true),
        retentionDays: z.number().int().min(0).max(3650).default(365),
        nextAuditAt: z.date().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const values = {
        merchantId: input.merchantId,
        branchId: input.branchId,
        role: input.role,
        status: input.status,
        cdoRegistrationNumber: input.cdoRegistrationNumber,
        pdoaRegistrationNumber: input.pdoaRegistrationNumber,
        kycReference: input.kycReference,
        publicDataOfficeName: input.publicDataOfficeName,
        termsAccepted: input.termsAccepted,
        userKycRequired: input.userKycRequired,
        retentionDays: input.retentionDays,
        nextAuditAt: input.nextAuditAt,
      };

      let complianceId = input.id;
      if (input.id) {
        await db.update(pmWaniCompliance)
          .set(values)
          .where(eq(pmWaniCompliance.id, input.id));
      } else {
        const result = await db.insert(pmWaniCompliance).values(values);
        complianceId = Number(result[0].insertId);
      }

      await appendLedgerEntry({
        entityType: "merchant",
        entityId: input.merchantId,
        action: "PM_WANI_COMPLIANCE_SAVED",
        merchantId: input.merchantId,
        data: {
          complianceId,
          branchId: input.branchId ?? null,
          role: input.role,
          status: input.status,
        },
      });

      publishRealtimeEvent({
        topic: "merchant",
        action: "pm_wani_compliance_saved",
        merchantId: input.merchantId,
        entityId: complianceId,
        data: { role: input.role, status: input.status },
      });

      return { success: true, complianceId };
    }),
});
