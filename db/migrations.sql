# 2025-03-25 Add qty_reserved to order for know if the order is reserved
ALTER TABLE `order` ADD `qty_reserved` TINYINT(1) NULL DEFAULT NULL AFTER `is_gift`;

# 2025-03-26 Add surcharge_amount to production for know if the type of surcharge is selected
ALTER TABLE `production` ADD `surcharge_amount` VARCHAR(255) NULL DEFAULT NULL AFTER `is_billing`;

# 2025-04-02 Add description_top to vod
ALTER TABLE `vod` ADD `description_top` TEXT NULL DEFAULT NULL AFTER `description_fr_long`;

# 2025-04-08 Add password to vod and shop
ALTER TABLE `vod` ADD `password` VARCHAR(255) NULL DEFAULT NULL AFTER `todo`;

ALTER TABLE `shop`
ADD `password` VARCHAR(255) NULL DEFAULT NULL AFTER `white_label`;

# 2025-04-23 Add name to category
ALTER TABLE `category` ADD `name` TEXT NULL DEFAULT NULL AFTER `code`;

ALTER TABLE `category`
ADD `sub_title` TEXT NULL DEFAULT NULL AFTER `name_fr`;

ALTER TABLE `category`
ADD `description` TEXT NULL DEFAULT NULL AFTER `sub_title_fr`;

ALTER TABLE `banner`
ADD `titles` TEXT NULL DEFAULT NULL AFTER `title`;

ALTER TABLE `banner`
ADD `sub_titles` TEXT NULL DEFAULT NULL AFTER `sub_title`;

ALTER TABLE `banner`
ADD `buttons` TEXT NULL DEFAULT NULL AFTER `button`;

ALTER TABLE `banner`
ADD `descriptions` TEXT NULL DEFAULT NULL AFTER `description`;

ALTER TABLE `shop`
ADD `banner_mobile` VARCHAR(255) NULL DEFAULT NULL AFTER `banner`;

# 2025-04-28 Add graphic_id to vod
ALTER TABLE `vod` ADD `graphic_id` INT(11) NULL DEFAULT NULL AFTER `com_id`;

# 2025-05-12 Add feedback_comment to production
ALTER TABLE `production` ADD `feedback_comment` TEXT NULL DEFAULT NULL AFTER `comment`;

# 2025-05-12 Create contact_request table
CREATE TABLE `contact_request` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NULL DEFAULT NULL,
  `phone` VARCHAR(255) NULL DEFAULT NULL,
  `social` VARCHAR(255) NULL DEFAULT NULL,
  `email` VARCHAR(255) NULL DEFAULT NULL,
  `type` VARCHAR(255) NULL DEFAULT NULL,
  `country_id` VARCHAR(255) NULL DEFAULT NULL,
  `message` TEXT NULL DEFAULT NULL,
  `created_at` DATETIME NULL DEFAULT NULL,
  `updated_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

# 2025-05-13 Add role table
CREATE TABLE `role` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `type` varchar(255) NOT NULL,
  `project_id` int DEFAULT NULL,
  `artist_id` int DEFAULT NULL,
  `label_id` int DEFAULT NULL,
  `shop_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `role`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `user_id_2` (
    `user_id`,
    `type`,
    `project_id`
),
ADD KEY `user_id` (`user_id`),
ADD KEY `project_id` (`project_id`),
ADD KEY `artist_id` (`artist_id`),
ADD KEY `shop_id` (`shop_id`),
ADD KEY `label_id` (`label_id`);

ALTER TABLE `role`
ADD `product_id` INT NULL DEFAULT NULL AFTER `shop_id`;

ALTER TABLE `role` ADD INDEX (`product_id`);
