CREATE TABLE `card_votes` (
	`card_id` text NOT NULL,
	`device_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`card_id`, `device_id`),
	FOREIGN KEY (`card_id`) REFERENCES `city_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_card_votes_card` ON `card_votes` (`card_id`);--> statement-breakpoint
CREATE TABLE `city_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`city` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`icon` text DEFAULT '✦' NOT NULL,
	`tone` text DEFAULT 'green' NOT NULL,
	`image_key` text,
	`latitude` real,
	`longitude` real,
	`unlock_radius_m` integer DEFAULT 50 NOT NULL,
	`challenge_distance_m` integer,
	`qr_code` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`author_device_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_city_cards_city_status` ON `city_cards` (`city`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_city_cards_qr_code` ON `city_cards` (`qr_code`);--> statement-breakpoint
CREATE TABLE `collected_cards` (
	`card_id` text NOT NULL,
	`device_id` text NOT NULL,
	`method` text NOT NULL,
	`collected_at` integer NOT NULL,
	PRIMARY KEY(`card_id`, `device_id`),
	FOREIGN KEY (`card_id`) REFERENCES `city_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_collected_cards_device` ON `collected_cards` (`device_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT 'Explorateur' NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `explored_circles` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`radius_m` integer DEFAULT 50 NOT NULL,
	`explored_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_explored_circles_device_time` ON `explored_circles` (`device_id`,`explored_at`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`distance_m` real NOT NULL,
	`circles_count` integer NOT NULL,
	`points_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_trips_device_started` ON `trips` (`device_id`,`started_at`);