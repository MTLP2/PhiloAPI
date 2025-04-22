# 2025-03-25 Add qty_reserved to order for know if the order is reserved
ALTER TABLE `order` ADD `qty_reserved` TINYINT(1) NULL DEFAULT NULL AFTER `is_gift`;

# 2025-03-26 Add surcharge_amount to production for know if the type of surcharge is selected
ALTER TABLE `production` ADD `surcharge_amount` VARCHAR(255) NULL DEFAULT NULL AFTER `is_billing`;

# 2025-04-02 Add description_top to vod
ALTER TABLE `vod` ADD `description_top` TEXT NULL DEFAULT NULL AFTER `description_fr_long`;

# 2025-04-08 Add password to vod and shop
ALTER TABLE `vod` ADD `password` VARCHAR(255) NULL DEFAULT NULL AFTER `todo`;
ALTER TABLE `shop` ADD `password` VARCHAR(255) NULL DEFAULT NULL AFTER `white_label`;