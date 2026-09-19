ALTER TABLE `users` ADD `passwordHash` varchar(255);
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordResetTokenHash` varchar(64);
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordResetExpiresAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `users_reset_token_idx` ON `users` (`passwordResetTokenHash`);
