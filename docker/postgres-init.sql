-- Local/CI only: extra empty databases next to the application database.
-- mindcare_test   disposable database for `pnpm test:db` (wiped on every run)
-- mindcare_shadow shadow database for `pnpm db:drift`
CREATE DATABASE mindcare_test;
CREATE DATABASE mindcare_shadow;
