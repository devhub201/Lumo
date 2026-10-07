ALTER TABLE `lumo_conversations` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `lumo_conversations` ADD `summaryUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `lumo_memories` MODIFY COLUMN `kind` enum('user_profile','preference','important_fact','fact','project','recurring_context','conversation_summary','summary','knowledge') NOT NULL;
