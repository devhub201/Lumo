CREATE TABLE `lumo_action_grants` (
  `id` varchar(64) NOT NULL,
  `ownerKey` varchar(64) NOT NULL,
  `action` varchar(120) NOT NULL,
  `resourceHash` varchar(64),
  `tokenHash` varchar(64) NOT NULL,
  `nonce` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lumo_action_grants_pk` PRIMARY KEY (`id`),
  CONSTRAINT `lumo_action_grants_token_unique` UNIQUE (`tokenHash`),
  CONSTRAINT `lumo_action_grants_nonce_unique` UNIQUE (`nonce`)
);
--> statement-breakpoint
CREATE INDEX `lumo_action_grants_consume_idx` ON `lumo_action_grants` (`ownerKey`,`action`,`tokenHash`,`expiresAt`);
--> statement-breakpoint
CREATE TABLE `lumo_action_audits` (
  `id` varchar(64) NOT NULL,
  `ownerKey` varchar(64) NOT NULL,
  `action` varchar(120) NOT NULL,
  `resourceHash` varchar(64),
  `grantId` varchar(64),
  `outcome` enum('issued','consumed','rejected','expired','replayed') NOT NULL,
  `reason` varchar(300) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lumo_action_audits_pk` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE INDEX `lumo_action_audits_owner_created_idx` ON `lumo_action_audits` (`ownerKey`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `lumo_owner_migration_runs` (
  `id` varchar(64) NOT NULL,
  `legacyOwnerKey` varchar(64) NOT NULL,
  `targetOwnerKey` varchar(64) NOT NULL,
  `verified` int NOT NULL,
  `mode` enum('dry_run','apply','rollback') NOT NULL,
  `status` enum('planned','applied','rolled_back','blocked') NOT NULL,
  `report` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp,
  CONSTRAINT `lumo_owner_migration_runs_pk` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `lumo_owner_migration_items` (
  `id` varchar(64) NOT NULL,
  `runId` varchar(64) NOT NULL,
  `sourceKind` varchar(80) NOT NULL,
  `recordId` varchar(255) NOT NULL,
  `beforeChecksum` varchar(64) NOT NULL,
  `afterChecksum` varchar(64),
  `restoredAt` timestamp,
  CONSTRAINT `lumo_owner_migration_items_pk` PRIMARY KEY (`id`),
  CONSTRAINT `lumo_owner_migration_run_item_unique` UNIQUE (`runId`,`sourceKind`,`recordId`)
);
