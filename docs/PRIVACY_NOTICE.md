# LCSign Privacy Notice (DRAFT)

> **Draft for the school and the adviser to review before use.** Written from
> what the app actually stores and sends as of version 1.2.0 (2026-11-22).
> Fill in everything in [square brackets]. This is not legal advice; the
> school's Data Protection Officer (or the person acting as one) should
> approve it. It follows the Data Privacy Act of 2012 (RA 10173).

## Who is responsible

LCSign is a sign-language learning app made for Liloan Central School by
[team names], BSIT students of [college], as a capstone project.

- Personal information controller: [Liloan Central School / name of school head]
- Contact for privacy questions: [name, email, phone]

## What LCSign keeps, and why

| What | Why | Who can see it |
|---|---|---|
| Name, email address, account type (student / teacher / admin), class | To log in, put students in the right class, and approve new accounts | The person, their teacher, the school's LCSign admins |
| Password | To log in. Stored only as a scrambled hash; nobody can read it | Nobody |
| Two-step sign-in (2FA) setup, if turned on | To check the code from the authenticator app | Nobody |
| Practice results: which signs were tried, how many times, passed or not, best score, when | Stars, progress and the teacher's class reports | The student, their teacher, admins |
| Lessons (modules) and word lists a teacher makes | To give the class its practice | The class and its teacher |
| Video call bookings, missed calls, and call notes (time, length, and the words the sign reader read during the call) | So students call at the booked time and the teacher can look back at the call | The teacher and student in that call, admins |
| App errors: what went wrong in the app, where, how many times, the app version, the kind of device and browser, and which account was signed in. Email addresses, log-in codes and computer user names are taken out first. Sent by the app by itself while someone is signed in (since version 1.2.0; database update 0019) | To find and fix problems on the school's computers and phones | The school's LCSign admins only. Deleted after 30 days, or straight away when the account is deleted |

**The camera:** the sign reader works on the device itself. Camera pictures
are **not recorded, saved or uploaded**. In a video call, the picture and
sound go straight to the other person in the call (through an encrypted
relay when the school network needs one) and are **not recorded**.

**Kept only on the device:** offline practice stars (no account), and
appearance and Translator settings. The device also keeps its last 30
errors for the error report; while someone is signed in, those same errors
go to the school's admins (the "App errors" row above), and errors from
before anyone signed in go with the next account that does. Nothing goes to
an outside error-reporting service.

## Services LCSign uses

| Service | What it receives | Why |
|---|---|---|
| Supabase (database and log-in) | The account and classroom data above | Where LCSign stores its data |
| Gmail (LCSign's own account) | The email address | To send sign-up and password-reset codes |
| MyMemory (translated.net) | The words to translate (e.g. a signed word, in English or Tagalog). No name or account | Translating between English and Tagalog |
| Have I Been Pwned | The first 5 characters of a scrambled form of a new password. Never the password itself | To warn about passwords that have leaked elsewhere |
| Metered (video call relay) | The encrypted call stream, when a direct connection isn't possible | So calls work across networks |

LCSign has no ads and no tracking. It doesn't sell or share data with
anyone else.

## How long it is kept

[Fill in the school's rule. Suggested: an account and its practice results
are kept while the student is enrolled in a class that uses LCSign, and
deleted within [30 days] after they leave or when a parent asks. Call notes
can be deleted by the teacher at any time. Database backups are kept for
[N days] in a private place.] App errors are always deleted after 30 days
(the database does this by itself), and admins can delete them sooner.

## Your rights

Under the Data Privacy Act, students and their parents or guardians can ask
to see the student's data, correct it, or have it deleted, and can withdraw
consent at any time. Ask [contact above]. Complaints can also go to the
National Privacy Commission (privacy.gov.ph).

---

# Parent / Guardian Consent Form (DRAFT)

I am the parent or guardian of ______________________________ (student),
Grade/Section ____________.

I have read the LCSign Privacy Notice above, or had it explained to me. I
agree that:

- [ ] my child may have an LCSign account with their name and an email
  address, and LCSign may keep their practice results as described;
- [ ] my child may use the camera in LCSign for the sign reader (nothing is
  recorded or uploaded);
- [ ] my child may take part in booked video calls with their teacher in
  LCSign (calls are not recorded; the teacher keeps the call notes described
  above).

I understand I can withdraw this consent at any time by telling
[contact], and that my child's data will then be deleted.

Name of parent/guardian: ______________________________

Signature: ______________________________   Date: ______________

Contact number: ______________________________
