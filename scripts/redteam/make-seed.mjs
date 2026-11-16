// Writes seed.sql for the test project from creds.json (after create-users.mjs).
// Paste it into the test project's SQL editor (it runs as postgres).
import { writeFileSync } from "node:fs";
import { creds } from "./lib.mjs";
const c = creds();
const A = "00000000-0000-4000-b000-0000000000aa", B = "00000000-0000-4000-b000-0000000000bb";
const sql = `-- red-team seed (TEST project only)
update public.profiles set approved = true, superadmin = true where id = '${c.sa.id}';
update public.profiles set approved = true where id in ('${c.ad.id}','${c.t1.id}','${c.t2.id}','${c.s1.id}','${c.s2.id}','${c.s3.id}');
insert into public.classes (id, name, teacher_id) values ('${A}','RT Class A','${c.t1.id}'), ('${B}','RT Class B','${c.t2.id}');
update public.profiles set class_id = '${A}' where id = '${c.s1.id}';
update public.profiles set class_id = '${B}' where id = '${c.s2.id}';
insert into public.modules (id, class_id, title, language, sign_group) values ('00000000-0000-4000-c000-0000000000aa','${A}','A module','asl','words'), ('00000000-0000-4000-c000-0000000000bb','${B}','B module','asl','words');
insert into public.module_signs (module_id, sign) values ('00000000-0000-4000-c000-0000000000bb','hello');
insert into public.class_word_plans (class_id, language, signs) values ('${B}','asl','{hello,bye}');
insert into public.lesson_progress (student_id, language, sign_group, sign, attempts, passes, best_confidence) values ('${c.s2.id}','asl','words','hello',3,1,0.9);
insert into public.call_notes (class_id, teacher_id, student_id, started_at, duration_seconds, teacher_text, student_text) values ('${B}','${c.t2.id}','${c.s2.id}', now() - interval '1 day', 120, 'private teacher B note', 'private student B words');
insert into public.call_bookings (class_id, teacher_id, student_id, starts_at, ends_at) values ('${A}','${c.t1.id}','${c.s1.id}', now() - interval '10 minutes', now() + interval '50 minutes'), ('${B}','${c.t2.id}','${c.s2.id}', now() + interval '1 day', now() + interval '1 day 30 minutes');
`;
writeFileSync(new URL("./seed.sql", import.meta.url), sql);
console.log("wrote seed.sql");
