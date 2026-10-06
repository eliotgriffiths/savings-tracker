# Changelog

All changes to Vault (`index.html`), newest first.

Version numbers follow [Semantic Versioning](https://semver.org/) and were assigned retroactively from the git history. The footer showed different numbers at the time, so each entry also lists the version it used to show ("was"). The first 11 releases came before the footer existed. Commits that kept the same footer version are grouped into one release.

- **Major:** breaks compatibility. Older data, backup or sync files no longer load without a migration, a storage or data format changes, or a feature is removed.
- **Minor:** adds a feature or user-visible capability without breaking anything.
- **Patch:** bug fixes, small tweaks, styling or wording changes.

The first release is v1.0.0. A major bump resets minor and patch to 0, a minor bump resets patch to 0, and patch rolls over into the next minor after .99. Types marked \* are judgement calls, explained in [Notes](#notes) at the end.

## v6.10.0 — Unreleased

Minor · was v5.11.10

- Fixed the transaction list jumping to another year or month after adding or editing a transaction
- Sort order is remembered and syncs across devices

## v6.9.0 — 2026-10-06

Minor · was v5.11.9 · `e5c2912`

- Savings goals
- Customisable Home layout (reorder and hide sections)
- FX impact and currency exposure
- Activity calendar, milestones, records and last-month recap
- Search from Home
- Filter reports by account

## v6.8.0 — 2026-07-14

Minor · was v5.5.61 · `8eec5d9`

- Home dashboard: overview, this month, trend, projection, interest earned, savings streak, upcoming and comparisons
- Account colours
- Deleting an account syncs across devices
- When deleting an account, move its transactions or delete them
- Print charts

## v6.7.1 — 2026-05-08

Patch · was v5.4.93 · `076066c`

- Fixed duplicate transaction IDs that made deleted or recurring transactions reappear

## v6.7.0 — 2026-05-07

Minor · was v5.4.92 · `2effa99`

- Transaction list is paginated
- Recurring rule history, with the option to re-add skipped dates
- Edit or delete "this only" or "all in series"
- Warning when browser storage is full

## v6.6.8 — 2026-04-23

Patch · was v5.4.59 · `5a65b73`

- SVG files skip image conversion

## v6.6.7 — 2026-04-23

Patch · was v5.4.58 · `cf87bd4`

- Retries when the AI returns no transactions

## v6.6.6 — 2026-04-23

Patch · was v5.4.57 · `3caf97e`

- SVG imports send only the text content

## v6.6.5 — 2026-04-23

Patch · was v5.4.56 · `e8dd2f3`

- AI import interest rule tweak

## v6.6.4 — 2026-04-23

Patch · was v5.4.55 · `b463ee9`

- Fixed Grok request format

## v6.6.3 — 2026-04-23

Patch · was v5.4.54 · `9ee771f`

- PDF import works with Grok

## v6.6.2 — 2026-04-23

Patch · was v5.4.53 · `35bfedd`

- Progress bar animation restyled

## v6.6.1 — 2026-04-23

Patch · was v5.4.52 · `e69213c`

- Progress bar code tidy-up

## v6.6.0 — 2026-04-23

Minor\* · was v5.4.51 · `1c15985`

- AI import accepts TXT and SVG files
- Images converted automatically for providers that only accept JPG/PNG
- Fallback for Numbers files that can't be read directly

## v6.5.16 — 2026-04-22

Patch · was v5.4.49 · `f961a39`

- Removed AI keys are no longer restored by sync

## v6.5.15 — 2026-04-22

Patch · was v5.4.48 · `346f0b9`

- Stray spaces trimmed from AI keys

## v6.5.14 — 2026-04-22

Patch · was v5.4.42 · `dafc875`, `1df2439`, `9ce5523`, `83dfd55`

- Smoother per-file import progress
- Backup reminder hidden when cloud sync is active
- Clearer AI provider errors
- Updated Grok model and API

## v6.5.13 — 2026-04-21

Patch · was v5.4.39 · `8bb308f`

- AI import handles statements with separate Debit and Credit columns

## v6.5.12 — 2026-04-21

Patch · was v5.4.38 · `2b11c30`

- AI import prompt wording tweak

## v6.5.11 — 2026-04-20

Patch · was v5.4.37 · `e0c304d`

- AI import detects pending transactions

## v6.5.10 — 2026-04-20

Patch · was v5.4.36 · `a718b9f`

- Spreadsheet imports read every sheet, not just the first

## v6.5.9 — 2026-04-20

Patch · was v5.4.35 · `02ad970`

- AI import no longer skips rows just because they mention interest

## v6.5.8 — 2026-04-20

Patch · was v5.4.34 · `dfe54d2`

- AI import is stricter about what counts as interest

## v6.5.7 — 2026-04-20

Patch · was v5.4.33 · `02a2d73`

- Switched to Gemini 2.5 Flash-Lite

## v6.5.6 — 2026-04-20

Patch · was v5.4.32 · `0601f28`

- Switched to Gemini 2.0 Flash
- Combined retry handling for busy and rate-limited responses

## v6.5.5 — 2026-04-20

Patch · was v5.4.31 · `876e5e7`

- AI retries back off gradually
- Animated import progress bar

## v6.5.4 — 2026-04-20

Patch · was v5.4.29 · `7d0f43c`

- Hidden export shortcut restored as Ctrl+Shift+X

## v6.5.3 — 2026-04-20

Patch · was v5.4.28 · `845d0d6`

- Hidden export shortcut removed
- Gemini test model changed

## v6.5.2 — 2026-04-20

Patch · was v5.4.27 · `9e024ef`

- Hidden shortcut to export AI import results as JSON

## v6.5.1 — 2026-04-20

Patch · was v5.4.26 · `72194fa`

- Retries when the AI provider is overloaded

## v6.5.0 — 2026-04-20

Minor · was v5.4.25 · `3e7f6c0`

- Import (AI) added to the menu

## v6.4.4 — 2026-04-20

Patch · was v5.4.24 · `4d6edce`

- AI connection test falls back to the main model if the test model is retired

## v6.4.3 — 2026-04-20

Patch · was v5.4.22 · `7445e21`

- Clearer AI quota error
- Error messages stay on screen longer

## v6.4.2 — 2026-04-20

Patch · was v5.4.21 · `1258dbb`

- Saved AI keys are shown collapsed
- Billing hint on AI quota errors

## v6.4.1 — 2026-04-20

Patch · was v5.4.19 · `b442641`

- AI connection test no longer retries when rate-limited

## v6.4.0 — 2026-04-19 to 2026-04-20

Minor · was v5.4.18 · `d4be840`, `6752b71`

- Multiple savings accounts, each with its own currency
- AI provider settings and AI statement import (not yet in the menu)
- Drive sign-in handled by a server so no secret is stored in the app
- Fixed a loop when resolving a currency mismatch
- Mobile table layout fixes

## v6.3.0 — 2026-04-07

Minor · was v4.7.7 · `5fadbe4`

- Choose your currency, with conversion at live exchange rates
- Interest transaction type
- About page
- Edit or delete all transactions created by a recurring rule

## v6.2.1 — 2026-04-05

Patch · was v4.4.5 · `1b40334`

- Save-status guide made more compact

## v6.2.0 — 2026-04-05

Minor · was v4.4.2 · `b5c8325`

- Privacy Policy page
- Tap the save-status indicator for a guide to what each status means

## v6.1.4 — 2026-04-04

Patch · was v4.2.1 · `a81bb12`

- New home-screen icon for iPhone and iPad

## v6.1.3 — 2026-04-04

Patch · was v4.2.0 · `970f53e`

- Linking a local file offers the same merge/overwrite choice as Drive
- Unused code removed

## v6.1.2 — 2026-04-04

Patch · was v4.1.7 · `f1470b1`

- Deleted recurring rules no longer come back after syncing
- New favicon

## v6.1.1 — 2026-04-04

Patch · was v4.1.5 · `36a6a41`

- Merge choice is kept when switching to Drive (survives the sign-in redirect)

## v6.1.0 — 2026-04-04

Minor\* · was v4.1.3 · `3756b69`

- Add, edit and delete recurring rules in dialogs
- Choose to merge or overwrite when a backup location already has a Vault file
- Confirmation before switching backup location
- Manual Drive Load and Save now buttons removed (sync is automatic)

## v6.0.1 — 2026-04-03

Patch · was v3.8.2 · `89c80c7`

- Desktop menu grouped into sections
- PDF preview restyled

## v6.0.0 — 2026-04-03

Major\* · was v3.7.7 · `d399360`

- **Breaking:** migration for pre-v5.0.0 data removed
- transactions without IDs are skipped when merging or syncing
- Edit recurring rules (amount, frequency, next date, end date)

## v5.0.10 — 2026-04-01

Patch · was v3.5.0 · `415c385`

- Prevents migration duplicates when connecting Drive on a new device

## v5.0.9 — 2026-04-01

Patch · was v3.4.8 · `33a7375`

- Removes duplicate transactions created when two devices migrated old data separately

## v5.0.8 — 2026-03-31

Patch · was v3.4.7 · `a796f8b`

- Fixed Drive sign-in token exchange

## v5.0.7 — 2026-03-31

Patch · was v3.4.6 · `a80d406`

- Clearer Drive sign-in errors

## v5.0.6 — 2026-03-31

Patch\* · was v3.4.5 · `5f4c55b`

- First-run welcome screen turned off (storage options remain in the menu)

## v5.0.5 — 2026-03-31

Patch · was v3.4.4 · `008b246`

- Further fix for the welcome screen appearing during Drive sign-in
- Drive connection remembered across sessions

## v5.0.4 — 2026-03-31

Patch · was v3.4.3 · `912e0a1`

- Further fix for the welcome screen appearing during Drive sign-in

## v5.0.3 — 2026-03-31

Patch · was v3.4.2 · `c6e1026`

- Further fix for the welcome screen appearing during Drive sign-in

## v5.0.2 — 2026-03-31

Patch · was v3.4.1 · `9cd4f27`

- Welcome screen no longer appears during the Drive sign-in redirect

## v5.0.1 — 2026-03-31

Patch · was v3.4.0 · `88cdec2`

- Drive sign-in redirect moved to vaultsavings.app

## v5.0.0 — 2026-03-31

Major · was v3.3.9 · `9e42abe`

- **Breaking:** transactions now carry an ID and timestamp
- existing data is migrated automatically
- **Breaking:** backup files are wrapped in a new format that also stores deletions and settings
- Google Drive backup is back, plus network location (NAS/WebDAV) backup
- Charts
- Search with amount filter
- Auto-lock screen
- Warning when Vault is open in two tabs

## v4.2.1 — 2026-03-29

Patch · was v2.9.3 · `040bed8`, `49ec3f7`

- Linked-file panel wording and styling

## v4.2.0 — 2026-03-29

Minor · was v2.9.2 · `07533b1`

- Export Spreadsheet and Print in the menu
- Banner for browsers that can't auto-save to a file
- Reminder to back up after several changes

## v4.1.1 — 2026-03-29

Patch · was v2.8.6 · `f2e1099`

- Clearing browser data no longer overwrites the linked file with empty data

## v4.1.0 — 2026-03-29

Minor · was v2.8.5 · `8feba2e`

- First-run welcome screen: save to a file, load a file, or use browser storage
- Prompt to encrypt when choosing a file
- Clear all browser data option

## v4.0.2 — 2026-03-29

Patch · was v2.8.1 · `13b92db`

- Sync & Backup renamed Storage & Backup
- Layout tweaks

## v4.0.1 — 2026-03-29

Patch · was v2.7.8 · `bcc9e29`

- Save-status indicator in the header

## v4.0.0 — 2026-03-29

Major · was v2.7.5 · `88541c9`

- **Breaking:** Google Drive sync removed, replaced by automatic saving to a local file you choose
- Encryption moved to its own menu
- Setup tutorial and sync-status popup removed

## v3.0.2 — 2026-03-28

Patch · was v2.6.8 · `512ac5e`

- Sync & Backup screen reorganised into cards

## v3.0.1 — 2026-03-28

Patch · was v2.6.7 · `d75e157`

- Restored the Google script needed to connect Drive

## v3.0.0 — 2026-03-28

Major\* · was v2.6.6 · `53d3635`

- **Breaking:** Google sign-in screen and Log Out removed
- Save to and load from a local file

## v2.5.0 — 2026-03-28

Minor · was v2.6.3 · `cf58a31`

- Optional password encryption for the Drive backup, with a downloadable recovery key
- Menu item renamed Sync & Backup

## v2.4.0 — 2026-03-28

Minor · was v2.5.5 · `704aab9`

- Disconnecting Drive asks whether to keep or clear local data

## v2.3.0 — 2026-03-28

Minor · was v2.5.3 · `9fec064`

- When connecting Drive and a Vault file already exists, choose to load it or start fresh

## v2.2.0 — 2026-03-28

Minor · was v2.5.0 · `26918f4`

- Log Out option that syncs to Drive first
- Menu reachable on phones in landscape

## v2.1.1 — 2026-03-28

Patch · was v2.4.8 · `b5ad691`

- Code clean-up
- Table fills the full width
- Row hover style

## v2.1.0 — 2026-03-28

Minor\* · was v2.4.6 · `33a7fb6`

- Recurring transactions (weekly to yearly)
- Calendar-year or financial-year mode with a custom FY start date
- Excel spreadsheet export (replaces CSV export)
- Desktop Add Transaction dialog
- Transactions are filed into the correct year automatically

## v2.0.2 — 2026-03-26

Patch · was v1.3.3 · `4c82836`

- Clearer error when creating the Drive file fails

## v2.0.1 — 2026-03-26

Patch · was v1.3.2 · `0d742f0`

- Drive sync only uploads local data when the Drive file doesn't exist yet
- Clearer Drive error messages

## v2.0.0 — 2026-03-26

Major · was v1.3.1 · `763c284`

- **Breaking:** Google Sheets sync removed and replaced by Google Drive sync (`vault-data.json`)
- the Apps Script URL setting is gone
- All tab showing deposits and withdrawals together
- Deposit/withdrawal toggle when adding on mobile
- Setup tutorial, desktop menu and sync-status popup

## v1.4.2 — 2026-03-26

Patch · was v1.0.0 · `4694978`

- Version number shown in the footer

## v1.4.1 — 2026-03-26

Patch · no version shown · `9246f7a`

- Sign-in is remembered for 30 days instead of per session
- Sidebar layout fix

## v1.4.0 — 2026-03-26

Minor · no version shown · `ce6e50b`

- Export any report range to CSV (replaces the per-year Export CSV button)
- Report moved to a sidebar button

## v1.3.0 — 2026-03-26

Minor · no version shown · `e18bd62`

- Report tab with totals for any date range and quick presets (all time, this FY, this year, this month)
- Mobile menu

## v1.2.1 — 2026-03-26

Patch\* · no version shown · `3563e99`

- Saves to the Sheet include a write token that must match the Apps Script

## v1.2.0 — 2026-03-26

Minor\* · no version shown · `bc4c267`

- Google sign-in screen (restricted to one account)
- Tap a transaction to edit or delete it
- Sortable columns
- Collapsible sidebar
- Debug button removed

## v1.1.0 — 2026-03-26

Minor · no version shown · `e1100e4`

- Renamed to Vault with a new design
- Mobile layout with slide-up sheets for adding transactions and picking years
- Background sync picks up changes made on other devices

## v1.0.4 — 2026-03-26

Patch · no version shown · `b247aff`

- Saves are sent by POST with a JSONP fallback, fixing timeouts on large data

## v1.0.3 — 2026-03-26

Patch\* · no version shown · `e84d990`

- Debug log panel for troubleshooting sync

## v1.0.2 — 2026-03-26

Patch · no version shown · `58027d2`

- Changes are saved to the Sheet immediately

## v1.0.1 — 2026-03-26

Patch · no version shown · `0147752`

- Google Sheets sync uses JSONP to avoid CORS errors

## v1.0.0 — 2026-03-26

Initial release · no version shown · `170f013`

- First version: track deposits and withdrawals grouped by financial year
- Sync to Google Sheets via an Apps Script, or use local-only mode
- Export to CSV

## Notes

These classifications were judgement calls:

- **v1.0.3, Patch:** the debug log panel is a troubleshooting tool, not a feature. It would be Minor if the visible Debug button counts. For the same reason, removing it in v1.2.0 and the hidden export shortcut in v6.5.2 to v6.5.4 aren't treated as feature changes.
- **v1.2.0, Minor:** the sign-in screen only let one Google account in. It would be Major if anyone else was using the app.
- **v1.2.1, Patch:** an Apps Script that enforces the new write token rejects older app versions, which could count as a sync break (Major).
- **v2.1.0, Minor:** CSV export was replaced by Excel export. It would be Major if losing CSV counts as removing a feature.
- **v3.0.0, Major:** removes sign-in and Log Out, which is a feature removal. But no data is affected, and the sign-in only ever let one account in, so Minor is arguable.
- **v5.0.6, Patch:** the welcome screen was turned off, but every option on it is still in the menu. A strict "feature removed" reading would make it Major.
- **v6.0.0, Major:** only affects data that was never opened by v5.0.0 or later, and choosing Replace (rather than Merge) when loading a file still loads it.
- **v6.1.0, Minor:** the manual Drive Load and Save now buttons were removed, but automatic sync covers what they did.
- **v6.6.0, Minor:** adds new import file types. It could be Patch if that's too small to count as a feature.

If v3.0.0 and v6.0.0 were Minor instead, the current release would be v4.11.0 rather than v6.10.0.
