-- マスター権限: admins can do everything in the admin area, but only a master can manage admins
-- (assign roles, set their PINs). The first master is promoted with `npm run db:set-role`.
alter table staff drop constraint staff_role_check;
alter table staff add constraint staff_role_check check (role in ('master', 'admin', 'staff'));
