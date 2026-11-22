# Family Gym 🏋️

A simple workout app for the family, with profiles for **Papa**, **Mummy** and **Himanshu**.
Each profile shows today's session, how to do each exercise (photos, steps, common mistakes) and a set logger with weight and reps.
It also has a rest timer, progress history and CSV export. It works offline and installs on the phone like an app (PWA).

**Compete:** each History page has a LeetCode-style calendar of workout days with current and best streaks, and the 🏆 **Board** ranks the family by week, month or all time.
Week and month use *consistency* (planned workout days done), so 5-day and 6-day plans compete fairly; rest days never break a streak.

**Live:** https://himanshusurya.github.io/family-gym/

## Android app

Download the APK from [Releases](https://github.com/himanshusurya/family-gym/releases/latest) and install it (allow "Install unknown apps" once).
The APK is a thin native shell (`android/`) around the live site, so **plan and app fixes still arrive without reinstalling**. You only need a new APK when the shell itself changes.
It needs internet once on first launch; after that it works offline.

Build: `cd android; .\gradlew.bat assembleRelease`. Signing needs `android/key.properties` (not committed) pointing at `family-gym-release.jks`.
Always sign with that same keystore, or installed phones won't accept the update. Bump `versionCode`/`versionName` in `android/app/build.gradle.kts` on every release.

## Change a workout without updating the app

All workouts are plain JSON in [`plans/`](plans). To change one:

1. Open the file on github.com (for example `plans/papa.json`) and click ✏️.
2. Edit it and commit. The **Validate & deploy** action checks the plan. A broken plan is rejected, so phones keep the last good one.
3. About a minute later the new plan is live, and each phone picks it up the next time the app opens.

| You want to… | Edit |
|---|---|
| Move a session to another day | `weekly` → `"mon": "A1"` (use `null` for a rest day) |
| Change sets, reps, rest or notes | the item in `sessions.<KEY>.items` (`sets`, `reps` like `"10-12"`, `rest` in seconds, `note`) |
| Swap an exercise | the item's `ex`. Use any `id` from `exercises/catalog.json` |
| Offer alternatives (a "swap" chip in the app) | `"alt": ["other-id"]` |
| Bodyweight or timed moves | `"load": "bw"`, `"unit": "sec hold"` / `"reps/leg"` / `"sec/side"` / `"steps"` |
| Add a new exercise to the library | add it to `tools/build_catalog.py` and run `python tools/build_catalog.py` |

Check locally with `node tools/validate.mjs`.

## Data (Supabase)

Supabase stores **only** the logged sets in a single `set_log` table (profile, day, exercise, set, kg, reps).
Plans and media are served from GitHub Pages. Every set is saved on the phone first and synced when online.
Several phones can share data: everyone signs in once with the 8-digit **family code**.

To set it up (one time): `.\supabase\setup.ps1 -AccessToken sbp_… -FamilyEmail <email>`. Then commit `config.js` and add the repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the keep-alive action.
Without `config.js` settings the app runs in **demo mode** and stores logs on the phone only. (Cloud sync is live since 2026-11-22.)

## Credits

* Exercise photos and base instructions: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain, Unlicense).
* UX inspired by [openGym](https://github.com/DuarteSantos8/openGym). No code or media is copied from it (its media is licensed from Gym Visual and may not be reused).
* "Common mistakes" text and the plans were written for this family. This app is not medical advice.
