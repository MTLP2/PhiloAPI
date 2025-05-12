# 2025-03-25 Add qty_reserved to order for know if the order is reserved
ALTER TABLE `order` ADD `qty_reserved` TINYINT(1) NULL DEFAULT NULL AFTER `is_gift`;

# 2025-03-26 Add surcharge_amount to production for know if the type of surcharge is selected
ALTER TABLE `production` ADD `surcharge_amount` VARCHAR(255) NULL DEFAULT NULL AFTER `is_billing`;

# 2025-04-02 Add description_top to vod
ALTER TABLE `vod` ADD `description_top` TEXT NULL DEFAULT NULL AFTER `description_fr_long`;

# 2025-04-08 Add password to vod and shop
ALTER TABLE `vod` ADD `password` VARCHAR(255) NULL DEFAULT NULL AFTER `todo`;
ALTER TABLE `shop` ADD `password` VARCHAR(255) NULL DEFAULT NULL AFTER `white_label`;

# 2025-04-23 Add name to category
ALTER TABLE `category` ADD `name` TEXT NULL DEFAULT NULL AFTER `code`;
ALTER TABLE `category` ADD `sub_title` TEXT NULL DEFAULT NULL AFTER `name_fr`;
ALTER TABLE `category` ADD `description` TEXT NULL DEFAULT NULL AFTER `sub_title_fr`;
ALTER TABLE `banner` ADD `titles` TEXT NULL DEFAULT NULL AFTER `title`;
ALTER TABLE `banner` ADD `sub_titles` TEXT NULL DEFAULT NULL AFTER `sub_title`;
ALTER TABLE `banner` ADD `buttons` TEXT NULL DEFAULT NULL AFTER `button`;
ALTER TABLE `banner` ADD `descriptions` TEXT NULL DEFAULT NULL AFTER `description`;
ALTER TABLE `shop` ADD `banner_mobile` VARCHAR(255) NULL DEFAULT NULL AFTER `banner`;

# 2025-04-28 Add graphic_id to vod
ALTER TABLE `vod` ADD `graphic_id` INT(11) NULL DEFAULT NULL AFTER `com_id`;

# 2025-05-12 Add feedback_comment to production
ALTER TABLE `production` ADD `feedback_comment` TEXT NULL DEFAULT NULL AFTER `comment`;
