import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  decimal,
  boolean,
  json,
  index,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────
export const users = mysqlTable(
  "users",
  {
    id: serial("id").primaryKey(),
    unionId: varchar("unionId", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    email: varchar("email", { length: 320 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    passwordResetTokenHash: varchar("passwordResetTokenHash", { length: 64 }),
    passwordResetExpiresAt: timestamp("passwordResetExpiresAt"),
    emailVerifiedAt: timestamp("emailVerifiedAt"),
    avatar: text("avatar"),
    phone: varchar("phone", { length: 20 }),
    role: mysqlEnum("role", ["user", "merchant", "admin", "super_admin"])
      .default("user")
      .notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
  },
  table => [
    index("users_email_idx").on(table.email),
    index("users_reset_token_idx").on(table.passwordResetTokenHash),
    index("users_role_active_idx").on(table.role, table.isActive),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Merchants ───────────────────────────────────────────────────────
export const merchants = mysqlTable(
  "merchants",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    businessName: varchar("businessName", { length: 255 }).notNull(),
    businessType: mysqlEnum("businessType", [
      "tea_shop",
      "restaurant",
      "hotel",
      "pg_hostel",
      "library",
      "school",
      "college",
      "coworking",
      "hospital",
      "railway_station",
      "bus_station",
      "apartment",
      "marriage_hall",
      "government_office",
      "public_wifi",
      "shopping_mall",
      "corporate_office",
      "airport",
      "other",
    ]).notNull(),
    gstNumber: varchar("gstNumber", { length: 50 }),
    address: text("address"),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 100 }),
    pincode: varchar("pincode", { length: 10 }),
    logo: text("logo"),
    primaryColor: varchar("primaryColor", { length: 7 }).default("#6366f1"),
    upiId: varchar("upiId", { length: 120 }),
    settlementAccountName: varchar("settlementAccountName", { length: 255 }),
    settlementPhone: varchar("settlementPhone", { length: 20 }),
    settlementVerified: boolean("settlementVerified").default(false).notNull(),
    isVerified: boolean("isVerified").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    subscriptionPlan: mysqlEnum("subscriptionPlan", [
      "free",
      "basic",
      "pro",
      "enterprise",
    ])
      .default("free")
      .notNull(),
    subscriptionExpiry: timestamp("subscriptionExpiry"),
    walletBalance: decimal("walletBalance", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("merchants_user_idx").on(table.userId),
    index("merchants_active_plan_idx").on(
      table.isActive,
      table.subscriptionPlan
    ),
    index("merchants_city_state_idx").on(table.city, table.state),
  ]
);

export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;

// ─── Branches ────────────────────────────────────────────────────────
export const branches = mysqlTable(
  "branches",
  {
    id: serial("id").primaryKey(),
    merchantId: bigint("merchantId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    address: text("address"),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 100 }),
    routerBrand: varchar("routerBrand", { length: 50 }),
    routerModel: varchar("routerModel", { length: 100 }),
    routerIp: varchar("routerIp", { length: 50 }),
    controllerType: mysqlEnum("controllerType", [
      "mikrotik",
      "openwrt",
      "freeradius",
      "cloud_agent",
      "manual",
    ])
      .default("manual")
      .notNull(),
    controllerEndpoint: varchar("controllerEndpoint", { length: 255 }),
    ssid: varchar("ssid", { length: 100 }),
    internetSource: mysqlEnum("internetSource", [
      "router_wifi",
      "phone_hotspot",
    ])
      .default("router_wifi")
      .notNull(),
    gatewayMode: mysqlEnum("gatewayMode", [
      "captive_portal",
      "phone_token_bridge",
    ])
      .default("captive_portal")
      .notNull(),
    hotspotSsid: varchar("hotspotSsid", { length: 100 }),
    hotspotDeviceName: varchar("hotspotDeviceName", { length: 100 }),
    hotspotOwnerPhone: varchar("hotspotOwnerPhone", { length: 20 }),
    bandwidthMbps: int("bandwidthMbps").default(100),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("branches_merchant_idx").on(table.merchantId),
    index("branches_merchant_active_idx").on(table.merchantId, table.isActive),
    index("branches_gateway_idx").on(table.internetSource, table.gatewayMode),
    index("branches_controller_idx").on(table.controllerType, table.isActive),
  ]
);

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;

// ─── WiFi Tickets ────────────────────────────────────────────────────
export const wifiTickets = mysqlTable(
  "wifi_tickets",
  {
    id: serial("id").primaryKey(),
    merchantId: bigint("merchantId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    branchId: bigint("branchId", { mode: "number", unsigned: true }),
    ticketCode: varchar("ticketCode", { length: 50 }).notNull().unique(),
    type: mysqlEnum("type", ["qr", "otp"]).notNull(),
    status: mysqlEnum("status", ["active", "used", "expired", "revoked"])
      .default("active")
      .notNull(),
    durationMinutes: int("durationMinutes").default(60).notNull(),
    dataLimitMb: int("dataLimitMb"),
    speedLimitMbps: int("speedLimitMbps"),
    maxDevices: int("maxDevices").default(1),
    price: decimal("price", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    currency: varchar("currency", { length: 3 }).default("INR"),
    accessApprovalStatus: mysqlEnum("accessApprovalStatus", [
      "auto_approved",
      "waiting_merchant",
      "approved",
      "rejected",
    ])
      .default("auto_approved")
      .notNull(),
    accessApprovedAt: timestamp("accessApprovedAt"),
    accessRejectedAt: timestamp("accessRejectedAt"),
    accessDecisionReason: text("accessDecisionReason"),
    deviceFingerprint: varchar("deviceFingerprint", { length: 255 }),
    macAddress: varchar("macAddress", { length: 17 }),
    usedAt: timestamp("usedAt"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("tickets_merchant_created_idx").on(table.merchantId, table.createdAt),
    index("tickets_merchant_status_created_idx").on(
      table.merchantId,
      table.status,
      table.createdAt
    ),
    index("tickets_branch_status_idx").on(table.branchId, table.status),
    index("tickets_approval_status_idx").on(
      table.merchantId,
      table.accessApprovalStatus,
      table.createdAt
    ),
    index("tickets_status_expires_idx").on(table.status, table.expiresAt),
  ]
);

export type WiFiTicket = typeof wifiTickets.$inferSelect;
export type InsertWiFiTicket = typeof wifiTickets.$inferInsert;

// ─── WiFi Sessions ───────────────────────────────────────────────────
export const wifiSessions = mysqlTable(
  "wifi_sessions",
  {
    id: serial("id").primaryKey(),
    ticketId: bigint("ticketId", { mode: "number", unsigned: true }).notNull(),
    merchantId: bigint("merchantId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    branchId: bigint("branchId", { mode: "number", unsigned: true }),
    userId: bigint("userId", { mode: "number", unsigned: true }),
    deviceFingerprint: varchar("deviceFingerprint", { length: 255 }),
    macAddress: varchar("macAddress", { length: 17 }),
    ipAddress: varchar("ipAddress", { length: 45 }),
    status: mysqlEnum("status", ["active", "paused", "expired", "disconnected"])
      .default("active")
      .notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    endedAt: timestamp("endedAt"),
    pausedAt: timestamp("pausedAt"),
    resumedAt: timestamp("resumedAt"),
    dataUsedMb: decimal("dataUsedMb", { precision: 10, scale: 2 }).default(
      "0.00"
    ),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("sessions_ticket_status_idx").on(table.ticketId, table.status),
    index("sessions_ticket_device_status_idx").on(
      table.ticketId,
      table.deviceFingerprint,
      table.status
    ),
    index("sessions_merchant_status_started_idx").on(
      table.merchantId,
      table.status,
      table.startedAt
    ),
    index("sessions_branch_status_started_idx").on(
      table.branchId,
      table.status,
      table.startedAt
    ),
  ]
);

export type WiFiSession = typeof wifiSessions.$inferSelect;
export type InsertWiFiSession = typeof wifiSessions.$inferInsert;

// Payment-only connectivity sessions for adaptive UPI/payment rescue flows.
export const paymentConnectivitySessions = mysqlTable(
  "payment_connectivity_sessions",
  {
    id: serial("id").primaryKey(),
    publicId: varchar("publicId", { length: 64 }).notNull().unique(),
    merchantId: bigint("merchantId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    branchId: bigint("branchId", { mode: "number", unsigned: true }),
    paymentId: bigint("paymentId", { mode: "number", unsigned: true }),
    routerId: varchar("routerId", { length: 100 }),
    sessionTokenHash: varchar("sessionTokenHash", { length: 64 }).notNull(),
    deviceFingerprint: varchar("deviceFingerprint", { length: 255 }),
    macAddress: varchar("macAddress", { length: 17 }),
    status: mysqlEnum("status", [
      "created",
      "mobile_sufficient",
      "offered",
      "authorized",
      "payment_pending",
      "payment_verified",
      "destroyed",
      "expired",
      "failed",
      "rejected",
    ])
      .default("created")
      .notNull(),
    networkDecision: mysqlEnum("networkDecision", [
      "use_mobile",
      "offer_payment_connectivity",
      "force_payment_connectivity",
    ])
      .default("offer_payment_connectivity")
      .notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    gatewayProvider: mysqlEnum("gatewayProvider", [
      "razorpay",
      "phonepe",
      "cashfree",
    ]),
    allowedHosts: json("allowedHosts"),
    expiresAt: timestamp("expiresAt").notNull(),
    authorizedAt: timestamp("authorizedAt"),
    destroyedAt: timestamp("destroyedAt"),
    lastSeenAt: timestamp("lastSeenAt"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("payment_conn_public_idx").on(table.publicId),
    index("payment_conn_merchant_status_idx").on(
      table.merchantId,
      table.status,
      table.createdAt
    ),
    index("payment_conn_branch_status_idx").on(table.branchId, table.status),
    index("payment_conn_payment_idx").on(table.paymentId),
    index("payment_conn_expiry_idx").on(table.status, table.expiresAt),
  ]
);

export type PaymentConnectivitySession =
  typeof paymentConnectivitySessions.$inferSelect;
export type InsertPaymentConnectivitySession =
  typeof paymentConnectivitySessions.$inferInsert;

// ─── Payments ────────────────────────────────────────────────────────
export const payments = mysqlTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    merchantId: bigint("merchantId", { mode: "number", unsigned: true }),
    userId: bigint("userId", { mode: "number", unsigned: true }),
    ticketId: bigint("ticketId", { mode: "number", unsigned: true }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    paymentMethod: mysqlEnum("paymentMethod", [
      "upi",
      "card",
      "wallet",
      "cash",
      "subscription",
    ]).notNull(),
    upiProvider: mysqlEnum("upiProvider", [
      "phonepe",
      "gpay",
      "paytm",
      "other",
    ]),
    gatewayProvider: mysqlEnum("gatewayProvider", [
      "razorpay",
      "phonepe",
      "cashfree",
    ]),
    gatewayOrderId: varchar("gatewayOrderId", { length: 255 }),
    gatewayPaymentId: varchar("gatewayPaymentId", { length: 255 }),
    transactionId: varchar("transactionId", { length: 255 }),
    status: mysqlEnum("status", ["pending", "success", "failed", "refunded"])
      .default("pending")
      .notNull(),
    gstAmount: decimal("gstAmount", { precision: 10, scale: 2 }).default(
      "0.00"
    ),
    gstPercentage: decimal("gstPercentage", { precision: 5, scale: 2 }).default(
      "18.00"
    ),
    invoiceNumber: varchar("invoiceNumber", { length: 50 }),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("payments_merchant_created_idx").on(
      table.merchantId,
      table.createdAt
    ),
    index("payments_merchant_status_created_idx").on(
      table.merchantId,
      table.status,
      table.createdAt
    ),
    index("payments_ticket_status_idx").on(table.ticketId, table.status),
    index("payments_transaction_idx").on(table.transactionId),
    index("payments_gateway_order_idx").on(
      table.gatewayProvider,
      table.gatewayOrderId
    ),
    index("payments_gateway_payment_idx").on(
      table.gatewayProvider,
      table.gatewayPaymentId
    ),
  ]
);

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// PM-WANI compliance records for PDO/PDOA deployments where applicable.
export const pmWaniCompliance = mysqlTable(
  "pm_wani_compliance",
  {
    id: serial("id").primaryKey(),
    merchantId: bigint("merchantId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    branchId: bigint("branchId", { mode: "number", unsigned: true }),
    role: mysqlEnum("role", ["pdo", "pdoa", "app_provider", "not_applicable"])
      .default("not_applicable")
      .notNull(),
    status: mysqlEnum("status", [
      "not_applicable",
      "pending",
      "ready",
      "approved",
      "expired",
      "blocked",
    ])
      .default("pending")
      .notNull(),
    cdoRegistrationNumber: varchar("cdoRegistrationNumber", { length: 100 }),
    pdoaRegistrationNumber: varchar("pdoaRegistrationNumber", { length: 100 }),
    kycReference: varchar("kycReference", { length: 100 }),
    publicDataOfficeName: varchar("publicDataOfficeName", { length: 255 }),
    termsAccepted: boolean("termsAccepted").default(false).notNull(),
    userKycRequired: boolean("userKycRequired").default(true).notNull(),
    retentionDays: int("retentionDays").default(365).notNull(),
    lastAuditAt: timestamp("lastAuditAt"),
    nextAuditAt: timestamp("nextAuditAt"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("pm_wani_merchant_status_idx").on(table.merchantId, table.status),
    index("pm_wani_branch_idx").on(table.branchId),
  ]
);

export type PmWaniCompliance = typeof pmWaniCompliance.$inferSelect;
export type InsertPmWaniCompliance = typeof pmWaniCompliance.$inferInsert;

// ─── Blockchain Ledger ───────────────────────────────────────────────
export const blockchainLedger = mysqlTable(
  "blockchain_ledger",
  {
    id: serial("id").primaryKey(),
    transactionHash: varchar("transactionHash", { length: 255 })
      .notNull()
      .unique(),
    nonce: varchar("nonce", { length: 64 }),
    payloadHash: varchar("payloadHash", { length: 64 }),
    chainSignature: varchar("chainSignature", { length: 64 }),
    blockNumber: bigint("blockNumber", { mode: "number", unsigned: true }),
    entityType: mysqlEnum("entityType", [
      "ticket",
      "session",
      "payment",
      "merchant",
      "user",
    ]).notNull(),
    entityId: bigint("entityId", { mode: "number", unsigned: true }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    data: json("data"),
    previousHash: varchar("previousHash", { length: 255 }),
    merkleRoot: varchar("merkleRoot", { length: 255 }),
    validatedBy: varchar("validatedBy", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("ledger_created_idx").on(table.createdAt),
    index("ledger_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt
    ),
    index("ledger_type_created_idx").on(table.entityType, table.createdAt),
  ]
);

export type BlockchainLedger = typeof blockchainLedger.$inferSelect;
export type InsertBlockchainLedger = typeof blockchainLedger.$inferInsert;

// ─── Analytics ───────────────────────────────────────────────────────
export const analytics = mysqlTable(
  "analytics",
  {
    id: serial("id").primaryKey(),
    merchantId: bigint("merchantId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    branchId: bigint("branchId", { mode: "number", unsigned: true }),
    date: timestamp("date").defaultNow().notNull(),
    totalSessions: int("totalSessions").default(0),
    totalRevenue: decimal("totalRevenue", { precision: 10, scale: 2 }).default(
      "0.00"
    ),
    totalDataUsedMb: decimal("totalDataUsedMb", {
      precision: 10,
      scale: 2,
    }).default("0.00"),
    avgSessionDuration: int("avgSessionDuration").default(0),
    peakHour: int("peakHour"),
    uniqueDevices: int("uniqueDevices").default(0),
    ticketsGenerated: int("ticketsGenerated").default(0),
    ticketsUsed: int("ticketsUsed").default(0),
    failedConnections: int("failedConnections").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("analytics_merchant_created_idx").on(
      table.merchantId,
      table.createdAt
    ),
    index("analytics_branch_created_idx").on(
      table.merchantId,
      table.branchId,
      table.createdAt
    ),
  ]
);

export type Analytics = typeof analytics.$inferSelect;
export type InsertAnalytics = typeof analytics.$inferInsert;

// ─── Notifications ───────────────────────────────────────────────────
export const notifications = mysqlTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    type: mysqlEnum("type", ["info", "success", "warning", "error"])
      .default("info")
      .notNull(),
    channel: mysqlEnum("channel", [
      "push",
      "sms",
      "whatsapp",
      "email",
      "in_app",
    ])
      .default("in_app")
      .notNull(),
    isRead: boolean("isRead").default(false).notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("notifications_user_read_created_idx").on(
      table.userId,
      table.isRead,
      table.createdAt
    ),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Coupons ─────────────────────────────────────────────────────────
export const coupons = mysqlTable(
  "coupons",
  {
    id: serial("id").primaryKey(),
    merchantId: bigint("merchantId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    discountType: mysqlEnum("discountType", [
      "percentage",
      "fixed_amount",
    ]).notNull(),
    discountValue: decimal("discountValue", {
      precision: 10,
      scale: 2,
    }).notNull(),
    maxUses: int("maxUses").default(1),
    usedCount: int("usedCount").default(0),
    validFrom: timestamp("validFrom").defaultNow().notNull(),
    validUntil: timestamp("validUntil"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("coupons_merchant_active_idx").on(
      table.merchantId,
      table.isActive,
      table.validUntil
    ),
  ]
);

export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;

// ─── Audit Logs ──────────────────────────────────────────────────────
export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }),
    merchantId: bigint("merchantId", { mode: "number", unsigned: true }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entityType", { length: 50 }),
    entityId: bigint("entityId", { mode: "number", unsigned: true }),
    details: json("details"),
    ipAddress: varchar("ipAddress", { length: 45 }),
    userAgent: text("userAgent"),
    severity: mysqlEnum("severity", ["low", "medium", "high", "critical"])
      .default("low")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_user_created_idx").on(table.userId, table.createdAt),
    index("audit_merchant_created_idx").on(table.merchantId, table.createdAt),
    index("audit_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt
    ),
  ]
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Queue ───────────────────────────────────────────────────────────
export const queues = mysqlTable(
  "queues",
  {
    id: serial("id").primaryKey(),
    merchantId: bigint("merchantId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    branchId: bigint("branchId", { mode: "number", unsigned: true }),
    userId: bigint("userId", { mode: "number", unsigned: true }),
    deviceFingerprint: varchar("deviceFingerprint", { length: 255 }),
    status: mysqlEnum("status", [
      "waiting",
      "priority",
      "active",
      "completed",
      "expired",
    ])
      .default("waiting")
      .notNull(),
    priority: int("priority").default(0),
    estimatedWaitMinutes: int("estimatedWaitMinutes").default(0),
    position: int("position").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("queues_merchant_status_priority_idx").on(
      table.merchantId,
      table.status,
      table.priority
    ),
    index("queues_branch_status_idx").on(table.branchId, table.status),
  ]
);

export type Queue = typeof queues.$inferSelect;
export type InsertQueue = typeof queues.$inferInsert;
