-- Class learning plans, part 2 (Nov 2026): a teacher can switch whole sign
-- groups off for a class - e.g. a class that only learns ASL, or skips
-- numbers. Before this, overall progress always averaged all six groups
-- (ASL and FSL letters, numbers and words), so a student who had learned
-- everything their class teaches could still show 17%.
--
--  - groups_off: the groups ('letters', 'numbers', 'words') of this row's
--    language the class doesn't learn. The client leaves them out of every
--    progress figure and hides them from students (curriculum.ts planSigns).
--  - signs may now be NULL = every word, so a row can switch a group off
--    without freezing the word list (new words from a retrained model still
--    show up). Clients from before this migration read NULL as "no plan",
--    which is the same thing, and ignore groups_off.
--
-- Same table, same policies (0012). Run after 0014_account_approval.sql.

alter table public.class_word_plans
  alter column signs drop not null,
  add column groups_off text[] not null default '{}'
    check (groups_off <@ array['letters', 'numbers', 'words']::text[]);

comment on column public.class_word_plans.signs is
  'Planned words of this language; NULL = every word the model has.';
comment on column public.class_word_plans.groups_off is
  'Sign groups of this language the class does not learn (letters, numbers, words).';
