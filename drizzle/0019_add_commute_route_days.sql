ALTER TABLE `commute_routes`
ADD `days` text DEFAULT '["monday","tuesday","wednesday","thursday","friday"]' NOT NULL;
--> statement-breakpoint
UPDATE `commute_routes`
SET `days` = CASE
  WHEN EXISTS (
    SELECT 1
    FROM `commute_days`
    WHERE `commute_days`.`user_id` = `commute_routes`.`user_id`
  )
  THEN (
    SELECT json_group_array(`day`)
    FROM (
      SELECT `day`
      FROM `commute_days`
      WHERE `commute_days`.`user_id` = `commute_routes`.`user_id`
      ORDER BY CASE `day`
        WHEN 'monday' THEN 1
        WHEN 'tuesday' THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4
        WHEN 'friday' THEN 5
        WHEN 'saturday' THEN 6
        WHEN 'sunday' THEN 7
      END
    )
  )
  ELSE '[]'
END;
