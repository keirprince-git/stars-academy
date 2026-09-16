# Brief: attendance audit trail + date guard

Two independent changes to the Stars Academy app. Do them one at a time, in order, as separate commits. Follow the repo's usual commit/push convention. Terse commit messages, no emojis.

Background: on 9 Sep 2026 Tuesday's register (8 Sep) was saved twice — first with the form's default date (that day, a Wednesday), then again correctly dated 8 Sep. The duplicate survived because `recordAttendance` only replaces rows for the date being saved. Nothing in `attendance_log` records who saved it. The 9 Sep session is being deleted by hand via the app; these changes stop it recurring and make the next one traceable.

Relevant files: `lib/db.ts` (schema, migrations, `recordAttendance`, `getRecentSessions`, `getSessionAttendance`), `app/attendance/page.tsx` (record form, history table, session view), `lib/auth.ts` (`requireAuth`, `getOptionalAuth`).

---

## Change 1: record who saved each attendance session

### Schema

Add `recorded_by INTEGER REFERENCES users(id)` to `attendance_log`. Use the existing idempotent migration pattern in `lib/db.ts` (PRAGMA table_info, then ALTER TABLE ADD COLUMN if missing — see the `categorised_by` migration on `bank_transactions` for the template). Also add it to the CREATE TABLE IF NOT EXISTS block so fresh databases get it. Existing rows stay NULL; do not backfill.

### Write path

`recordAttendance(sessionDate, sessionDay, attendedPlayerIds)` gains a fourth parameter `recordedBy: number` and writes it on every inserted row. Note the function deletes and re-inserts all rows for the date, so `recorded_by` and `created_at` always reflect the last save of that session, not the first. That is the intended meaning — document it in the function comment.

In `handleRecord` (server action in `app/attendance/page.tsx`), obtain the user inside the action by calling `requireAuth()` again rather than closing over the component's `auth` variable, and pass `userId`.

`changeSessionDate` (UPDATE session_date only) and `deleteAttendanceSession` need no change. `scripts/seed.py` and `app/api/attendance-overview` need no change.

### Read path / display

- `getRecentSessions`: add `recorded_by_name` (LEFT JOIN users; all rows for a date share the same `recorded_by`, so `MAX(u.username)` or equivalent within the GROUP BY is fine) and `recorded_at` (MAX(created_at)).
- History table (`view=history`): add a "Recorded by" column after Rate, showing the username or an em dash for legacy NULLs.
- Session view (`view=session`): under the heading, one line: "Recorded by {username} on {created_at}" (or "Recorded by: unknown (before audit trail)" when NULL).

Keep styling consistent with the existing table/heading classes. No other UI changes.

### Verify

1. Start the dev server against the local db; confirm the migration runs once and is a no-op on restart (no error, column present).
2. Record a session as admin, then as a recorder user; history shows the right names.
3. Edit an existing session as a different user; `recorded_by` changes to the editor.
4. Legacy sessions show the em dash / unknown text, no crash.
5. `/api/attendance-overview` output unchanged.

---

## Change 2: stop sessions being saved on the wrong date

Sessions are only on Tuesdays and Fridays. The form currently defaults the date to today and the Session Day dropdown is not validated against it (`recordAttendance` ignores `sessionDay` entirely).

### Form defaults (`view=record`, new session only — leave the edit path's `editDate` behaviour as is)

- Default date = the most recent Tuesday or Friday on or before today, computed in Asia/Amman time (not `new Date().toISOString()`, which is UTC). Recording the day after training then needs no date edit.
- Default Session Day = the weekday of that default date.
- When editing (`editDate` present), default Session Day = weekday of `editDate` if it is Tuesday or Friday, otherwise "Other".

### Dropdown

Add a third option "Other (one-off session)" to `session_day`. Tuesday and Friday remain the normal choices.

### Server-side guard (in `handleRecord`, before `recordAttendance`)

If `session_day` is Tuesday or Friday and the weekday of `session_date` does not match, do not save. Redirect back to the record view with `error=day_mismatch&date=...&day=...` and show an inline error in the form: "{d MMM yyyy} is a {Weekday}, but Session Day is {Tuesday|Friday}. Fix the date, or choose Other for a one-off session." Preserve the entered date in the form on return so the user only has to correct it.

If `session_day` is Other, save without checking. Never silently change the date.

### Verify

1. On a Wednesday (or by mocking the date), open Record New: date defaults to the preceding Tuesday, day = Tuesday.
2. Set date to a Wednesday with day Tuesday, save: refused, error shown, date preserved, no rows written.
3. Same date with day Other: saves.
4. Edit an existing Friday session: day dropdown shows Friday; saving works.
5. Edit a legacy odd-date session (if any): dropdown shows Other; saving works.

Out of scope: the Session Day value is still not stored. Leave that alone.
