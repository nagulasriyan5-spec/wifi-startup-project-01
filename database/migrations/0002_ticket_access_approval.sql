ALTER TABLE `wifi_tickets` ADD `accessApprovalStatus` enum('auto_approved','waiting_merchant','approved','rejected') NOT NULL DEFAULT 'auto_approved';
--> statement-breakpoint
ALTER TABLE `wifi_tickets` ADD `accessApprovedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `wifi_tickets` ADD `accessRejectedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `wifi_tickets` ADD `accessDecisionReason` text;
--> statement-breakpoint
CREATE INDEX `tickets_approval_status_idx` ON `wifi_tickets` (`merchantId`,`accessApprovalStatus`,`createdAt`);
