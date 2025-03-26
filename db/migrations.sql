# 2025-03-25 Add qty_reserved to order for know if the order is reserved
ALTER TABLE `order` ADD `qty_reserved` TINYINT(1) NULL DEFAULT NULL AFTER `is_gift`;

# 2025-03-26 Add surcharge_amount to production for know if the type of surcharge is selected
ALTER TABLE `production` ADD `surcharge_amount` VARCHAR(255) NULL DEFAULT NULL AFTER `is_billing`;