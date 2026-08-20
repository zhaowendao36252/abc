CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text DEFAULT 'expense' NOT NULL,
	`merchant` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category` text NOT NULL,
	`transaction_date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`source_text` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
