# 2025-03-25 Add qty_reserved to order for know if the order is reserved
ALTER TABLE `order` ADD `qty_reserved` TINYINT(1) NULL DEFAULT NULL AFTER `is_gift`;
