CREATE TABLE `regional_discoveries` (
	`collectible_id` text NOT NULL,
	`device_id` text NOT NULL,
	`region_code` text NOT NULL,
	`collected_at` integer NOT NULL,
	PRIMARY KEY(`collectible_id`, `device_id`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_regional_discoveries_device_region` ON `regional_discoveries` (`device_id`,`region_code`);