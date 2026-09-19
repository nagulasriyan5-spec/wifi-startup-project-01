CREATE TABLE `analytics` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`merchantId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`date` timestamp NOT NULL DEFAULT (now()),
	`totalSessions` int DEFAULT 0,
	`totalRevenue` decimal(10,2) DEFAULT '0.00',
	`totalDataUsedMb` decimal(10,2) DEFAULT '0.00',
	`avgSessionDuration` int DEFAULT 0,
	`peakHour` int,
	`uniqueDevices` int DEFAULT 0,
	`ticketsGenerated` int DEFAULT 0,
	`ticketsUsed` int DEFAULT 0,
	`failedConnections` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned,
	`merchantId` bigint unsigned,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(50),
	`entityId` bigint unsigned,
	`details` json,
	`ipAddress` varchar(45),
	`userAgent` text,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blockchain_ledger` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`transactionHash` varchar(255) NOT NULL,
	`nonce` varchar(64),
	`payloadHash` varchar(64),
	`chainSignature` varchar(64),
	`blockNumber` bigint unsigned,
	`entityType` enum('ticket','session','payment','merchant','user') NOT NULL,
	`entityId` bigint unsigned NOT NULL,
	`action` varchar(50) NOT NULL,
	`data` json,
	`previousHash` varchar(255),
	`merkleRoot` varchar(255),
	`validatedBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blockchain_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `blockchain_ledger_transactionHash_unique` UNIQUE(`transactionHash`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`merchantId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`city` varchar(100),
	`state` varchar(100),
	`routerBrand` varchar(50),
	`routerModel` varchar(100),
	`routerIp` varchar(50),
	`ssid` varchar(100),
	`internetSource` enum('router_wifi','phone_hotspot') NOT NULL DEFAULT 'router_wifi',
	`gatewayMode` enum('captive_portal','phone_token_bridge') NOT NULL DEFAULT 'captive_portal',
	`hotspotSsid` varchar(100),
	`hotspotDeviceName` varchar(100),
	`hotspotOwnerPhone` varchar(20),
	`bandwidthMbps` int DEFAULT 100,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`merchantId` bigint unsigned NOT NULL,
	`code` varchar(50) NOT NULL,
	`discountType` enum('percentage','fixed_amount') NOT NULL,
	`discountValue` decimal(10,2) NOT NULL,
	`maxUses` int DEFAULT 1,
	`usedCount` int DEFAULT 0,
	`validFrom` timestamp NOT NULL DEFAULT (now()),
	`validUntil` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`businessName` varchar(255) NOT NULL,
	`businessType` enum('tea_shop','restaurant','hotel','pg_hostel','library','school','college','coworking','hospital','railway_station','bus_station','apartment','marriage_hall','government_office','public_wifi','shopping_mall','corporate_office','airport','other') NOT NULL,
	`gstNumber` varchar(50),
	`address` text,
	`city` varchar(100),
	`state` varchar(100),
	`pincode` varchar(10),
	`logo` text,
	`primaryColor` varchar(7) DEFAULT '#6366f1',
	`upiId` varchar(120),
	`settlementAccountName` varchar(255),
	`settlementPhone` varchar(20),
	`settlementVerified` boolean NOT NULL DEFAULT false,
	`isVerified` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`subscriptionPlan` enum('free','basic','pro','enterprise') NOT NULL DEFAULT 'free',
	`subscriptionExpiry` timestamp,
	`walletBalance` decimal(10,2) NOT NULL DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `merchants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('info','success','warning','error') NOT NULL DEFAULT 'info',
	`channel` enum('push','sms','whatsapp','email','in_app') NOT NULL DEFAULT 'in_app',
	`isRead` boolean NOT NULL DEFAULT false,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`merchantId` bigint unsigned,
	`userId` bigint unsigned,
	`ticketId` bigint unsigned,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'INR',
	`paymentMethod` enum('upi','card','wallet','cash','subscription') NOT NULL,
	`upiProvider` enum('phonepe','gpay','paytm','other'),
	`transactionId` varchar(255),
	`status` enum('pending','success','failed','refunded') NOT NULL DEFAULT 'pending',
	`gstAmount` decimal(10,2) DEFAULT '0.00',
	`gstPercentage` decimal(5,2) DEFAULT '18.00',
	`invoiceNumber` varchar(50),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `queues` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`merchantId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`userId` bigint unsigned,
	`deviceFingerprint` varchar(255),
	`status` enum('waiting','priority','active','completed','expired') NOT NULL DEFAULT 'waiting',
	`priority` int DEFAULT 0,
	`estimatedWaitMinutes` int DEFAULT 0,
	`position` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `queues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`unionId` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`avatar` text,
	`phone` varchar(20),
	`role` enum('user','merchant','admin','super_admin') NOT NULL DEFAULT 'user',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_unionId_unique` UNIQUE(`unionId`)
);
--> statement-breakpoint
CREATE TABLE `wifi_sessions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ticketId` bigint unsigned NOT NULL,
	`merchantId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`userId` bigint unsigned,
	`deviceFingerprint` varchar(255),
	`macAddress` varchar(17),
	`ipAddress` varchar(45),
	`status` enum('active','paused','expired','disconnected') NOT NULL DEFAULT 'active',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`pausedAt` timestamp,
	`resumedAt` timestamp,
	`dataUsedMb` decimal(10,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wifi_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wifi_tickets` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`merchantId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned,
	`ticketCode` varchar(50) NOT NULL,
	`type` enum('qr','otp') NOT NULL,
	`status` enum('active','used','expired','revoked') NOT NULL DEFAULT 'active',
	`durationMinutes` int NOT NULL DEFAULT 60,
	`dataLimitMb` int,
	`speedLimitMbps` int,
	`maxDevices` int DEFAULT 1,
	`price` decimal(10,2) NOT NULL DEFAULT '0.00',
	`currency` varchar(3) DEFAULT 'INR',
	`deviceFingerprint` varchar(255),
	`macAddress` varchar(17),
	`usedAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wifi_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `wifi_tickets_ticketCode_unique` UNIQUE(`ticketCode`)
);
--> statement-breakpoint
CREATE INDEX `analytics_merchant_created_idx` ON `analytics` (`merchantId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `analytics_branch_created_idx` ON `analytics` (`merchantId`,`branchId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_user_created_idx` ON `audit_logs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_merchant_created_idx` ON `audit_logs` (`merchantId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_entity_created_idx` ON `audit_logs` (`entityType`,`entityId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ledger_created_idx` ON `blockchain_ledger` (`createdAt`);--> statement-breakpoint
CREATE INDEX `ledger_entity_created_idx` ON `blockchain_ledger` (`entityType`,`entityId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ledger_type_created_idx` ON `blockchain_ledger` (`entityType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `branches_merchant_idx` ON `branches` (`merchantId`);--> statement-breakpoint
CREATE INDEX `branches_merchant_active_idx` ON `branches` (`merchantId`,`isActive`);--> statement-breakpoint
CREATE INDEX `branches_gateway_idx` ON `branches` (`internetSource`,`gatewayMode`);--> statement-breakpoint
CREATE INDEX `coupons_merchant_active_idx` ON `coupons` (`merchantId`,`isActive`,`validUntil`);--> statement-breakpoint
CREATE INDEX `merchants_user_idx` ON `merchants` (`userId`);--> statement-breakpoint
CREATE INDEX `merchants_active_plan_idx` ON `merchants` (`isActive`,`subscriptionPlan`);--> statement-breakpoint
CREATE INDEX `merchants_city_state_idx` ON `merchants` (`city`,`state`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_created_idx` ON `notifications` (`userId`,`isRead`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payments_merchant_created_idx` ON `payments` (`merchantId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payments_merchant_status_created_idx` ON `payments` (`merchantId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payments_ticket_status_idx` ON `payments` (`ticketId`,`status`);--> statement-breakpoint
CREATE INDEX `payments_transaction_idx` ON `payments` (`transactionId`);--> statement-breakpoint
CREATE INDEX `queues_merchant_status_priority_idx` ON `queues` (`merchantId`,`status`,`priority`);--> statement-breakpoint
CREATE INDEX `queues_branch_status_idx` ON `queues` (`branchId`,`status`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_active_idx` ON `users` (`role`,`isActive`);--> statement-breakpoint
CREATE INDEX `sessions_ticket_status_idx` ON `wifi_sessions` (`ticketId`,`status`);--> statement-breakpoint
CREATE INDEX `sessions_ticket_device_status_idx` ON `wifi_sessions` (`ticketId`,`deviceFingerprint`,`status`);--> statement-breakpoint
CREATE INDEX `sessions_merchant_status_started_idx` ON `wifi_sessions` (`merchantId`,`status`,`startedAt`);--> statement-breakpoint
CREATE INDEX `sessions_branch_status_started_idx` ON `wifi_sessions` (`branchId`,`status`,`startedAt`);--> statement-breakpoint
CREATE INDEX `tickets_merchant_created_idx` ON `wifi_tickets` (`merchantId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `tickets_merchant_status_created_idx` ON `wifi_tickets` (`merchantId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `tickets_branch_status_idx` ON `wifi_tickets` (`branchId`,`status`);--> statement-breakpoint
CREATE INDEX `tickets_status_expires_idx` ON `wifi_tickets` (`status`,`expiresAt`);