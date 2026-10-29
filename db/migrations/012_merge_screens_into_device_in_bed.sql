-- 012_merge_screens_into_device_in_bed.sql
-- The athlete treats Garmin's "Screens Before Bed" and /log's "Phone in
-- bed" as the same question (29 Oct 2026, DASHBOARD_SPEC.md v1.40), so
-- v1.38's separate screens_before_bed column folds into device_in_bed.
--
-- Same merge rule sync.py applies (§6, v1.38): a yes from either source
-- counts; a "no" only fills a NULL. So device_in_bed becomes true if
-- either was true, false if it was NULL and screens said no, and is
-- otherwise left as it was. Then the column is dropped — every value it
-- held is now in device_in_bed, and Garmin still has the originals.
--
-- Applied by hand via MCP apply_migration.

update public.daily
set device_in_bed = true
where screens_before_bed is true and device_in_bed is distinct from true;

update public.daily
set device_in_bed = false
where screens_before_bed is false and device_in_bed is null;

alter table public.daily drop column screens_before_bed;
