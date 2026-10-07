CREATE TABLE `lumo_conversations` (
	`id` varchar(36) NOT NULL,
	`ownerKey` varchar(64) NOT NULL,
	`title` varchar(160) NOT NULL,
	`depthLevel` int NOT NULL DEFAULT 1,
	`depthTopic` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lumo_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lumo_memories` (
	`id` varchar(36) NOT NULL,
	`ownerKey` varchar(64) NOT NULL,
	`kind` enum('preference','fact','project','summary','knowledge') NOT NULL,
	`content` text NOT NULL,
	`tags` varchar(500),
	`importance` int NOT NULL DEFAULT 50,
	`isActive` int NOT NULL DEFAULT 1,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lumo_memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lumo_messages` (
	`id` varchar(36) NOT NULL,
	`conversationId` varchar(36) NOT NULL,
	`sequence` int NOT NULL,
	`role` enum('user','assistant','system','tool') NOT NULL,
	`content` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lumo_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lumo_settings` (
	`id` varchar(36) NOT NULL,
	`ownerKey` varchar(64) NOT NULL,
	`settingKey` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lumo_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `lumo_settings_owner_setting_unique` UNIQUE(`ownerKey`,`settingKey`)
);
--> statement-breakpoint
CREATE INDEX `lumo_conversations_owner_updated_idx` ON `lumo_conversations` (`ownerKey`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `lumo_memories_owner_active_idx` ON `lumo_memories` (`ownerKey`,`isActive`);--> statement-breakpoint
CREATE INDEX `lumo_messages_conversation_sequence_idx` ON `lumo_messages` (`conversationId`,`sequence`);