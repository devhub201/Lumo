CREATE TABLE `lumo_provider_connections` (
  `id` varchar(64) NOT NULL,
  `ownerKey` varchar(64) NOT NULL,
  `provider` enum('github','google') NOT NULL,
  `providerAccountId` varchar(255) NOT NULL,
  `providerLogin` varchar(320),
  `accessTokenCiphertext` text NOT NULL,
  `refreshTokenCiphertext` text,
  `tokenKeyVersion` int NOT NULL,
  `accessTokenExpiresAt` timestamp,
  `scopes` json NOT NULL,
  `state` enum('connected','expired','revoked','error') NOT NULL DEFAULT 'connected',
  `lastRefreshAt` timestamp,
  `lastValidatedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lumo_provider_connections_pk` PRIMARY KEY (`id`),
  CONSTRAINT `lumo_provider_connections_owner_provider_unique` UNIQUE (`ownerKey`,`provider`)
);
--> statement-breakpoint
CREATE INDEX `lumo_provider_connections_owner_state_idx` ON `lumo_provider_connections` (`ownerKey`,`state`);
--> statement-breakpoint
CREATE TABLE `lumo_oauth_states` (
  `id` varchar(64) NOT NULL,
  `stateHash` varchar(64) NOT NULL,
  `ownerKey` varchar(64) NOT NULL,
  `provider` enum('github','google') NOT NULL,
  `pkceVerifierCiphertext` text,
  `keyVersion` int,
  `redirectUri` varchar(2048) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lumo_oauth_states_pk` PRIMARY KEY (`id`),
  CONSTRAINT `lumo_oauth_states_state_unique` UNIQUE (`stateHash`)
);
--> statement-breakpoint
CREATE INDEX `lumo_oauth_states_consume_idx` ON `lumo_oauth_states` (`stateHash`,`provider`,`expiresAt`);
--> statement-breakpoint
CREATE INDEX `lumo_oauth_states_owner_idx` ON `lumo_oauth_states` (`ownerKey`);
