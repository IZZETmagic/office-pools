# Sport Pool — Comprehensive UAT Testing Script

**Application**: Sport Pool (FIFA World Cup 2026 Prediction Pool)
**Date**: 2026-04-01
**Version**: Current production build
**URL**: https://sportpool.io (or staging environment)

---

## Pre-Requisites

- [ ] Access to a clean test environment (staging preferred)
- [ ] At least 3 test user accounts (User A = pool creator/admin, User B = member, User C = late joiner)
- [ ] 1 super admin account (`is_super_admin = true`)
- [ ] Access to Supabase dashboard (to verify DB state)
- [ ] Access to Resend dashboard (to verify emails sent)
- [ ] CRON_SECRET value (for manual cron trigger testing)
- [ ] Mobile device or browser DevTools mobile emulation (for responsive/PWA tests)
- [ ] Multiple browser sessions (for real-time/community tests)

---

## Module 1: Authentication & Account Creation

### TC-1.1: Sign Up — Happy Path
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/signup` | Sign up form renders with Full Name, Username, Email, Password fields and Terms checkbox |
| 2 | Enter full name "Test User A" | Field accepts input |
| 3 | Enter username "testusera" | Green checkmark — username available (real-time check) |
| 4 | Enter valid email "testa@example.com" | Field accepts input |
| 5 | Enter password "Test123!" (6+ chars) | Field accepts input, password strength shown |
| 6 | Check "I agree to Terms & Privacy" | Checkbox enabled |
| 7 | Click "Sign Up" | Account created, redirected to `/dashboard` |
| 8 | Verify in Supabase `auth.users` | New auth user exists |
| 9 | Verify in `public.users` | Profile row with `username`, `full_name`, `auth_user_id` |
| 10 | Verify in `terms_agreements` | Row with `terms_version = "2026-03-01"` |

### TC-1.2: Sign Up — Duplicate Username
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/signup` | Form renders |
| 2 | Enter username "testusera" (already taken from TC-1.1) | Red indicator — "Username already taken" |
| 3 | Attempt to submit | Button disabled or submission rejected |

### TC-1.3: Sign Up — Invalid Inputs
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter username "ab" (too short) | Validation error: minimum 3 characters |
| 2 | Enter username "test user!" (special chars) | Validation error: letters, numbers, underscores only |
| 3 | Enter password "12345" (too short) | Validation error: minimum 6 characters |
| 4 | Leave Terms unchecked, submit | Submission blocked, terms required |

### TC-1.4: Login — Happy Path
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/login` | Login form renders |
| 2 | Enter valid email and password | Fields accept input |
| 3 | Click "Log In" | Redirected to `/dashboard` |
| 4 | Verify `last_login` updated in `public.users` | Timestamp updated to current time |

### TC-1.5: Login — Invalid Credentials
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter valid email, wrong password | Error: "Invalid login credentials" |
| 2 | Enter non-existent email | Error: "Invalid login credentials" (same message, no enumeration) |

### TC-1.6: Forgot Password Flow
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/forgot-password` | Email input form renders |
| 2 | Enter registered email, submit | Redirected to `/forgot-password/sent` |
| 3 | Check email inbox | Password reset email received |
| 4 | Click reset link | Redirected to `/reset-password` with valid token |
| 5 | Enter new password (6+ chars) | Accepted |
| 6 | Submit | Redirected to `/reset-password/success` |
| 7 | Log in with new password | Successful login |

### TC-1.7: Sign Out
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | While logged in, click sign out | Session cleared, redirected to `/` or `/login` |
| 2 | Navigate to `/dashboard` directly | Redirected to `/login` (protected route) |

---

## Module 2: Dashboard

### TC-2.1: Dashboard — Authenticated User
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in and navigate to `/dashboard` | Dashboard loads with sections: My Pools, Live Matches, Upcoming Matches, Activity Feed |
| 2 | Verify "My Pools" section | Shows pools user has joined (empty for new user) |
| 3 | Verify navigation elements | Top nav with links to Pools, Profile; user avatar/menu visible |

### TC-2.2: Dashboard — Unauthenticated Access
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear session/cookies | User logged out |
| 2 | Navigate to `/dashboard` | Redirected to `/login` |

---

## Module 3: Pool Creation

### TC-3.1: Create Pool — Full Tournament Mode
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to pool creation page | Form with: name, description, mode, privacy, deadline, max participants, max entries |
| 2 | Enter pool name "Test Pool Alpha" | Field accepts input |
| 3 | Enter description "UAT test pool" | Field accepts input |
| 4 | Select prediction mode: "Full Tournament" | Mode selected |
| 5 | Set privacy: Public | Toggle set |
| 6 | Set prediction deadline: future date | Date/time picker accepts value |
| 7 | Set max participants: 50 | Field accepts value |
| 8 | Set max entries per user: 3 | Field accepts value (1-10 range) |
| 9 | Submit | Pool created, redirected to pool detail page |
| 10 | Verify pool code auto-generated | Unique alphanumeric code displayed |
| 11 | Verify in `public.pools` | Row with correct `pool_name`, `prediction_mode = full_tournament`, `is_private = false` |
| 12 | Verify in `public.pool_members` | Creator has `role = admin` |
| 13 | Verify in `public.pool_settings` | Default scoring rules populated |

### TC-3.2: Create Pool — Progressive Mode
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create pool with mode "Progressive" | Pool created |
| 2 | Verify rounds tab visible in admin | Round management available |
| 3 | Verify group stage is first unlocked round | Only group matches available for prediction |

### TC-3.3: Create Pool — Bracket Picker Mode
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create pool with mode "Bracket Picker" | Pool created |
| 2 | Verify prediction UI shows group picker first | User picks 1st/2nd/3rd place per group |
| 3 | Verify knockout bracket available after group picks | Bracket slots populated from group picks |

### TC-3.4: Create Pool — Private Pool
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create pool with privacy: Private | Pool created |
| 2 | As User B, browse public pools | Private pool NOT visible in public listing |
| 3 | As User B, search with pool code | Pool found and joinable via code |

---

## Module 4: Joining a Pool

### TC-4.1: Join Public Pool
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As User B, navigate to `/pools` | Public pools listed |
| 2 | Find "Test Pool Alpha" | Pool visible with name, member count, mode |
| 3 | Click Join | User B added as member |
| 4 | Verify in `public.pool_members` | Row with `role = member` |
| 5 | Verify pool appears in User B's dashboard | Listed under "My Pools" |
| 6 | Check email (if opted in) | Pool joined confirmation email received |

### TC-4.2: Join via Pool Code
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As User C, search by pool code | Pool found |
| 2 | Click Join | User C added as member |

### TC-4.3: Join Pool — Max Participants Reached
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set pool max participants to current member count | Setting updated |
| 2 | As new user, attempt to join | Rejected: "Pool is full" |

### TC-4.4: Join Pool — Already a Member
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As User B (already joined), attempt to join again | Message: "Already a member" or Join button not shown |

---

## Module 5: Entry Creation & Predictions (Full Tournament Mode)

### TC-5.1: Create Entry
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As User B, navigate to pool detail | Pool page loads with tabs |
| 2 | Click "Create Entry" or equivalent | Entry creation prompt |
| 3 | Enter entry name "User B Entry 1" | Accepted |
| 4 | Submit | Entry created in `pool_entries` with `entry_number = 1`, `has_submitted_predictions = false` |

### TC-5.2: Create Multiple Entries (Max Entries = 3)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create second entry "User B Entry 2" | Created with `entry_number = 2` |
| 2 | Create third entry "User B Entry 3" | Created with `entry_number = 3` |
| 3 | Attempt to create fourth entry | Rejected: max entries per user reached |

### TC-5.3: Make Group Stage Predictions
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select Entry 1 | Prediction form loads with group stage matches |
| 2 | For each match, enter home score and away score | Score inputs accept non-negative integers |
| 3 | Enter negative score | Validation rejects negative values |
| 4 | Leave some matches blank | Allowed (partial predictions) |
| 5 | Verify auto-save | Navigate away and back — draft predictions preserved |
| 6 | Verify in `public.predictions` | Rows exist with `predicted_home_score`, `predicted_away_score` |

### TC-5.4: Make Knockout Stage Predictions
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to knockout predictions | R32 matches shown (teams derived from group predictions) |
| 2 | Predict R32 match scores | Accepted |
| 3 | If draw predicted in knockout, PSO fields appear | PSO winner selection available |
| 4 | Complete through Final | All knockout stages predicted |
| 5 | Verify bracket cascade | Changing group predictions updates which teams appear in R32 |

### TC-5.5: Submit Predictions
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Submit Predictions" | Confirmation dialog appears |
| 2 | Confirm submission | `has_submitted_predictions = true`, `predictions_submitted_at` set |
| 3 | Verify predictions are now read-only | Cannot edit after submission |
| 4 | Check email | Predictions submitted confirmation email received |

### TC-5.6: Submit Predictions — After Deadline
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set pool deadline to past time (admin) | Deadline updated |
| 2 | As User C, attempt to submit | Rejected: "Prediction deadline has passed" |

### TC-5.7: Delete Entry
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As User B, delete Entry 3 (before deadline) | Entry and associated predictions removed |
| 2 | Verify in `pool_entries` | Row deleted |

---

## Module 6: Predictions — Progressive Mode

### TC-6.1: Group Stage Round
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Join progressive mode pool | Pool page shows only group stage matches |
| 2 | Make group stage predictions | Accepted |
| 3 | Submit group stage | Locked for group stage |
| 4 | Verify R32 is NOT yet accessible | "Locked" or not displayed |

### TC-6.2: Round Unlock (Admin)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As pool admin, navigate to Rounds tab | Round management visible |
| 2 | Unlock R32 round | R32 predictions now available for members |
| 3 | As User B, verify R32 is accessible | R32 matches shown for prediction |

### TC-6.3: Auto-Complete Round
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | When all group stage matches are completed (by super admin) | Group stage auto-completes |
| 2 | Verify next round auto-unlocks (if configured) | R32 becomes available |

### TC-6.4: Auto-Submit at Round Deadline
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set round deadline to just passed | Deadline elapsed |
| 2 | Trigger cron: `GET /api/cron/auto-submit` with CRON_SECRET | Job runs |
| 3 | Verify incomplete round entries auto-submitted | `has_submitted_predictions` updated for round |
| 4 | Check email | Auto-submit notification sent (with warning about partial predictions) |

---

## Module 7: Predictions — Bracket Picker Mode

### TC-7.1: Group Picks
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Join bracket picker pool | Group picker UI renders |
| 2 | For each group, select 1st, 2nd place teams | Dropdown/selection UI |
| 3 | Select 3rd place qualifiers (best third-place teams) | Third-place ranking UI |
| 4 | Submit group picks | Saved to `bracket_picker_group_rankings` and `bracket_picker_third_place_rankings` |

### TC-7.2: Knockout Bracket Picks
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After group picks, bracket renders | R32 slots populated via Annex C mapping |
| 2 | Select winner for each R32 matchup | Winner advances to R16 slot |
| 3 | Complete through Final | All knockout winners selected |
| 4 | Submit bracket | Saved to `bracket_picker_knockout_picks` |

### TC-7.3: Bracket Validation
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to place same team in two group positions | Validation error |
| 2 | Verify Annex C calculation | R32 matchups follow FIFA rules for 3rd-place assignment |

---

## Module 8: Scoring & Leaderboard

### TC-8.1: Match Result Entry (Super Admin)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As super admin, navigate to `/admin/super` | Super admin dashboard loads |
| 2 | Go to Matches tab | All tournament matches listed |
| 3 | Select a group stage match | Edit form with home/away scores |
| 4 | Enter scores: Home 2 - Away 1 | Accepted |
| 5 | Mark match as completed | `is_completed = true`, `status = completed` |
| 6 | Verify in `public.matches` | Scores and completion status saved |

### TC-8.2: Scoring — Exact Score
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User B predicted Home 2 - Away 1 (exact match) | |
| 2 | Verify `match_scores` | `score_type` reflects exact score points per pool settings |
| 3 | Verify entry total points updated | `match_points` incremented in `pool_entries` |

### TC-8.3: Scoring — Correct Goal Difference
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User predicted Home 3 - Away 2 (correct GD, wrong scores) | |
| 2 | Verify points | `group_correct_difference` points awarded |

### TC-8.4: Scoring — Correct Result Only
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User predicted Home 1 - Away 0 (correct winner, wrong GD) | |
| 2 | Verify points | `group_correct_result` points awarded |

### TC-8.5: Scoring — Miss
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User predicted Home 0 - Away 1 (wrong winner) | |
| 2 | Verify points | 0 points awarded |

### TC-8.6: Scoring — Knockout Stage Multiplier
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter R16 match result | Match completed |
| 2 | Verify user's points for R16 match | Base points x R16 multiplier (default 1.5x) |

### TC-8.7: Scoring — PSO (Penalty Shootout)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure PSO scoring is enabled in pool settings | `pso_scoring_enabled = true` |
| 2 | Enter match result with PSO (e.g., 1-1 FT, PSO 4-3) | Scores saved with `home_score_pso`, `away_score_pso` |
| 3 | User predicted exact PSO: 4-3 | `pso_exact_score` points awarded |
| 4 | User predicted correct PSO winner but wrong score | `pso_correct_result` points awarded |

### TC-8.8: Bonus Points — Group Standings
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After all group matches completed | Group standings computed |
| 2 | User predicted both winner & runner-up correctly | `bonus_group_winner_and_runnerup` awarded |
| 3 | User predicted only winner | `bonus_group_winner_only` awarded |
| 4 | User predicted both qualifiers in swapped positions | `bonus_both_qualify_swapped` awarded |

### TC-8.9: Bonus Points — Overall Qualification
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After group stage complete | Qualification bonuses calculated |
| 2 | User got all 16 qualifiers correct | `bonus_all_16_qualified` awarded |
| 3 | User got 12-15 correct | `bonus_12_15_qualified` awarded |

### TC-8.10: Bonus Points — Tournament Outcome
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After Final completed | Tournament awards set |
| 2 | User predicted champion correctly | `bonus_champion_correct` awarded |
| 3 | User predicted runner-up correctly | `bonus_second_place_correct` awarded |

### TC-8.11: Leaderboard Display
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to pool leaderboard tab | All entries ranked |
| 2 | Verify rank order | Highest total points = rank 1 |
| 3 | Verify tiebreaker | Tied points → more exact scores wins |
| 4 | Verify previous rank shown | Delta arrows (up/down/same) |
| 5 | Verify last 5 predictions shown | Color-coded: exact/winner_gd/winner/miss |
| 6 | Verify streak indicator | Hot streak (fire) or cold streak (ice) |
| 7 | Verify XP level displayed | Level name and progress shown |

### TC-8.12: Leaderboard — Recalculate
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As pool admin, click "Recalculate Scores" | Recalculation triggered |
| 2 | Verify all entries re-scored | `match_scores` recomputed, `pool_entries` totals updated |
| 3 | Run recalculate again | Results identical (idempotent) |

---

## Module 9: XP, Badges & Analytics

### TC-9.1: XP Accumulation
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After scoring a match | XP earned: exact=120, winner_gd=60, winner=30, submitted=10 |
| 2 | Verify stage multiplier applied | Group=1x, R16=1.5x, QF=1.75x, SF=2x, Final=2.5x |
| 3 | Check XP total on leaderboard | Accumulated correctly |

### TC-9.2: Level Progression
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Accumulate XP past level threshold | Level advances (e.g., "Rookie" → next level) |
| 2 | Verify on profile and leaderboard | New level name and badge shown |

### TC-9.3: Badge Earned
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Achieve 2+ exact scores | "Sharpshooter" badge awarded |
| 2 | Achieve 5+ correct predictions in a row | "Prediction Prophet" badge awarded |
| 3 | Submit in final hour before deadline | "Last-Minute Legend" badge awarded |
| 4 | Verify badge appears in analytics/profile | Badge with rarity/tier displayed |

### TC-9.4: Superlatives
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to pool analytics | Superlatives section visible |
| 2 | Verify "Hottest Right Now" | User with longest current hot streak |
| 3 | Verify "Sharpshooter" | User with most exact scores |
| 4 | Verify "Biggest Climber" | User with most rank improvement |

### TC-9.5: Analytics — Accuracy by Stage
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to entry analytics | Accuracy breakdown by stage shown |
| 2 | Verify hit rate | Correct predictions / total predictions |
| 3 | Verify contrarian index | Difference from crowd consensus |

---

## Module 10: Community & Chat

### TC-10.1: Post Text Message
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to pool Community tab | Chat interface loads |
| 2 | Type message "Hello everyone!" | Input field accepts text |
| 3 | Send message | Message appears in chat with username and timestamp |
| 4 | Open pool in second browser (User B) | Message visible to User B in real-time |

### TC-10.2: @Mention User
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type "@testusera great picks!" | Autocomplete suggests matching usernames |
| 2 | Select user and send | Message posted with highlighted mention |
| 3 | Verify User A receives notification | Email notification (if opted in for Community topic) |

### TC-10.3: Emoji Reactions
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover/tap on a message | Reaction picker appears |
| 2 | Select emoji reaction | Reaction appears under message with count |
| 3 | As another user, add same emoji | Count increments |
| 4 | Click own reaction again | Reaction removed (toggle behavior) |

### TC-10.4: Reply to Message
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click reply on a message | Reply context shown in input area |
| 2 | Type reply and send | Message posted as reply, linked to parent |
| 3 | Verify threading | Reply visually connected to parent message |

### TC-10.5: Share Prediction Card
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Share a prediction in chat | Prediction card renders with match, scores, result |
| 2 | Verify other members see card | Card visible with correct data |

### TC-10.6: Badge Flex
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Earn a badge | Option to share/"flex" in chat |
| 2 | Share badge | Badge flex card posted as system event |

### TC-10.7: Pin Message (Admin)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As pool admin, pin a message | Message pinned with announcement styling |
| 2 | Verify pin visible to all members | Pinned message shown at top of chat or highlighted |
| 3 | As non-admin, attempt to pin | Option not available |

### TC-10.8: Online Presence
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open pool in two browsers (two users) | Both users appear in online members list |
| 2 | Close one browser | User removed from online list (after timeout) |

---

## Module 11: Pool Admin Features

### TC-11.1: Edit Pool Settings
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As pool admin, navigate to Admin tab → Settings | Settings form loads |
| 2 | Change pool name to "Updated Pool Name" | Saved successfully |
| 3 | Change status to Closed | Pool no longer accepting new members |
| 4 | Change privacy to Private | Pool removed from public listing |
| 5 | Change deadline to new date | Deadline updated, members notified (email) |
| 6 | Change max participants | Saved, validated against current count |

### TC-11.2: Remove Member
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As pool admin, navigate to Members tab | All members listed |
| 2 | Remove User C | User C's membership deleted |
| 3 | Verify User C's entries removed | Entries and predictions cleaned up |
| 4 | Verify email sent to User C | Member removed notification (if opted in) |
| 5 | Verify audit log | "member_removed" action logged |

### TC-11.3: Adjust Points
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As pool admin, select User B's entry | Point adjustment UI |
| 2 | Add +5 bonus points with reason "Tiebreaker award" | Adjustment saved |
| 3 | Verify `point_adjustment` in `pool_entries` | Value = 5 |
| 4 | Verify leaderboard reflects adjustment | Total points include adjustment |
| 5 | Delete adjustment | Points reverted |
| 6 | Verify audit log | Both add and delete logged |

### TC-11.4: Unlock Predictions
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User B has submitted predictions | `has_submitted_predictions = true` |
| 2 | As admin, unlock User B's entry | `has_submitted_predictions = false` |
| 3 | As User B, verify predictions are editable | Can modify and re-submit |

### TC-11.5: Configure Scoring Rules
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Scoring tab in admin | Full scoring configuration form |
| 2 | Change `group_exact_score` from default to 10 | Saved |
| 3 | Change R16 multiplier to 2.0 | Saved |
| 4 | Toggle PSO scoring on/off | Saved |
| 5 | Recalculate scores | All entries rescored with new rules |
| 6 | Verify email notification | Scoring update email sent to members |

### TC-11.6: Pool Admin — Cannot Access Other Pools
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As Pool Alpha admin, attempt to access Pool Beta admin panel | Access denied or panel not shown |

---

## Module 12: Super Admin Features

### TC-12.1: Access Super Admin Dashboard
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as super admin | Dashboard accessible |
| 2 | Navigate to `/admin/super` | Dashboard loads with Stats, Matches, Users, Pools, Audit Log tabs |
| 3 | As regular user, navigate to `/admin/super` | Access denied / redirect |

### TC-12.2: Stats Tab
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View Stats tab | Total users, pools, matches, predictions displayed |
| 2 | Verify counts match Supabase | Numbers accurate |

### TC-12.3: Edit Match (Super Admin)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to Matches tab | All matches listed with filters |
| 2 | Select match, enter scores | Scores saved |
| 3 | Mark completed | `is_completed = true` |
| 4 | Verify scoring triggered | Affected pool entries rescored |
| 5 | Edit already-completed match | Scores updated, rescoring triggered |

### TC-12.4: Advance Teams in Bracket
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After group stage complete, click "Advance Teams" | Teams populated in R32 match slots |
| 2 | Verify `winner_team_id` set on group matches | Correct teams advanced |
| 3 | Verify R32 `home_team_id`/`away_team_id` populated | Matchups follow FIFA rules |

### TC-12.5: Manage Users (Super Admin)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to Users tab | User list with search |
| 2 | Search for "testusera" | User found |
| 3 | Toggle super admin flag | Flag toggled, audit logged |
| 4 | Deactivate user | User cannot log in |
| 5 | Reactivate user | User can log in again |

### TC-12.6: Manage Pools (Super Admin)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to Pools tab | All pools listed |
| 2 | Click "Recalculate" on a pool | All entries in pool rescored |
| 3 | Verify audit log | Recalculation logged |

### TC-12.7: Send Announcement (Super Admin)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compose announcement | Title and body fields |
| 2 | Send to all users | Emails queued |
| 3 | Verify in Resend dashboard | Batch email sent |

### TC-12.8: Audit Log (Super Admin)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to Audit Log tab | All admin actions listed |
| 2 | Filter by action type (e.g., "match_updated") | Filtered results |
| 3 | Verify each action shows: who, what, when, changes | All fields populated |

---

## Module 13: Email Notifications

### TC-13.1: Pool Joined Email
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User joins a pool | Email sent: "Welcome to {poolName}" |
| 2 | Verify CTA links to pool | Link opens pool detail page |

### TC-13.2: Predictions Submitted Email
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User submits predictions | Email: "Predictions Locked" with match count |

### TC-13.3: Auto-Submit Email
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Entry auto-submitted by cron | Email: "Predictions Auto-Submitted" with partial prediction warning |

### TC-13.4: Deadline Reminder Email
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Within 24 hours of deadline, user has unsubmitted entry | Email: deadline reminder with unsubmitted entries listed |

### TC-13.5: Member Removed Email
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Admin removes member | Removed user receives notification email |

### TC-13.6: Deadline Changed Email
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Admin changes deadline | All pool members receive email with new deadline |

### TC-13.7: Mention Email
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User @mentioned in chat | Email with message preview and link to chat |

### TC-13.8: Scoring Update Email
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Admin changes scoring rules | Members receive scoring update email |

### TC-13.9: Notification Preferences
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Profile → Notification Preferences | All 6 topics shown with toggles |
| 2 | Disable "Community" topic | Saved, synced with Resend |
| 3 | Get @mentioned in chat | No email sent (Community disabled) |
| 4 | Re-enable "Community" topic | Saved |
| 5 | Get @mentioned again | Email received |

---

## Module 14: Profile & Account Management

### TC-14.1: View Profile
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/profile` | Profile page loads |
| 2 | Verify account info | Username, full name, email, member since date displayed |
| 3 | Verify statistics | Total pools, best rank, total points shown |

### TC-14.2: View Predictions Across Pools
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Predictions tab on profile | All predictions grouped by pool/entry |
| 2 | Verify prediction details | Match, predicted scores, actual scores, points earned |

### TC-14.3: Delete Account
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to account settings | Delete account option visible |
| 2 | Click delete | Confirmation dialog with warning |
| 3 | Confirm deletion | Account deleted |
| 4 | Verify in `auth.users` | Auth user removed |
| 5 | Verify in `public.users` | User row removed |
| 6 | Verify entries/predictions cleaned up | Associated data removed |
| 7 | Redirected to `/account-deleted` | Confirmation page shown |
| 8 | Attempt to log in with deleted credentials | Fails — account does not exist |

---

## Module 15: Cron Jobs & Automated Tasks

### TC-15.1: Auto-Submit Cron — Manual Trigger
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set pool deadline to 1 minute ago | Deadline passed |
| 2 | Ensure User C has unsubmitted entry | Draft predictions exist |
| 3 | Call `GET /api/cron/auto-submit` with header `Authorization: Bearer {CRON_SECRET}` | 200 OK |
| 4 | Verify User C's entry auto-submitted | `has_submitted_predictions = true` |
| 5 | Verify auto-submit email sent | Email received |

### TC-15.2: Auto-Complete Progressive Rounds
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In progressive pool, complete all group stage matches | All matches `is_completed = true` |
| 2 | Trigger cron | Auto-complete detects group stage done |
| 3 | Verify next round unlocked | R32 predictions available |

### TC-15.3: Auto-Archive Pools
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pool's tournament is fully completed | All matches done, champion declared |
| 2 | Trigger cron | Pool status changed to archived |

### TC-15.4: Cron — Invalid Secret
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `/api/cron/auto-submit` without CRON_SECRET | 401 Unauthorized |
| 2 | Call with wrong secret | 401 Unauthorized |

---

## Module 16: Static Pages & Legal

### TC-16.1: Landing Page
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/` | Landing page renders with app description, CTA to sign up/login |

### TC-16.2: FAQ Page
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/faq` | FAQ content renders, accordion/expandable sections work |

### TC-16.3: Terms of Service
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/terms` | Full terms of service displayed |

### TC-16.4: Privacy Policy
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/privacy` | Full privacy policy displayed |

### TC-16.5: Contact Form
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/contact` | Contact form renders |
| 2 | Fill in fields and submit | Success message shown |
| 3 | Submit empty form | Validation errors |

---

## Module 17: Responsive Design & PWA

### TC-17.1: Mobile Viewport
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open app at 375px width (iPhone) | Layout adapts — no horizontal scroll |
| 2 | Verify navigation | Mobile nav (hamburger or bottom tabs) |
| 3 | Verify pool detail page | Tabs stack or scroll horizontally |
| 4 | Verify prediction form | Inputs usable on small screen |
| 5 | Verify leaderboard | Columns scroll or collapse gracefully |
| 6 | Verify chat | Messages and input usable on mobile |

### TC-17.2: Tablet Viewport
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open app at 768px width (iPad) | Layout adapts appropriately |
| 2 | Verify key pages render correctly | No overlapping elements |

### TC-17.3: PWA Install
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open app in mobile Safari/Chrome | Install prompt available (or "Add to Home Screen") |
| 2 | Install to home screen | App icon appears |
| 3 | Open from home screen | App opens in standalone mode (no browser chrome) |
| 4 | Verify manifest | Name, icons, theme color correct |

---

## Module 18: Edge Cases & Error Handling

### TC-18.1: Session Expiry
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in, wait for session to expire (or clear cookies manually) | |
| 2 | Attempt to submit predictions | Redirected to login, not a raw error |
| 3 | After re-login, return to previous page | Session restored gracefully |

### TC-18.2: Concurrent Edits
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open same entry in two browser tabs | Both load |
| 2 | Edit predictions in Tab A, save | Saved |
| 3 | Edit different predictions in Tab B, save | Saved (last write wins) or conflict warning |

### TC-18.3: Network Failure During Prediction Save
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter predictions | |
| 2 | Disable network (DevTools offline mode) | |
| 3 | Attempt to save | Error message: "Unable to save. Check your connection." |
| 4 | Re-enable network | |
| 5 | Retry save | Predictions saved successfully |

### TC-18.4: Large Pool (Performance)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pool with 50+ members, multiple entries each | |
| 2 | Load leaderboard | Loads within 3 seconds |
| 3 | Load community chat with 100+ messages | Loads with pagination/infinite scroll |

### TC-18.5: Empty States
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | New user with no pools | Dashboard shows "No pools yet" with CTA to join/create |
| 2 | Pool with no messages | Chat shows "No messages yet" prompt |
| 3 | Pool with no completed matches | Leaderboard shows "Waiting for results" |

### TC-18.6: URL Manipulation
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/pools/nonexistent-id` | 404 or "Pool not found" message |
| 2 | As User B, navigate to pool admin URL for pool they don't own | Access denied |
| 3 | Navigate to `/admin/super` as non-super-admin | Access denied / redirect |

---

## Module 19: Cross-Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome (Desktop) | Latest | [ ] Pass / [ ] Fail |
| Safari (Desktop) | Latest | [ ] Pass / [ ] Fail |
| Firefox (Desktop) | Latest | [ ] Pass / [ ] Fail |
| Chrome (Android) | Latest | [ ] Pass / [ ] Fail |
| Safari (iOS) | Latest | [ ] Pass / [ ] Fail |
| Edge (Desktop) | Latest | [ ] Pass / [ ] Fail |

**Per browser, verify:**
- [ ] Login/signup works
- [ ] Predictions can be submitted
- [ ] Leaderboard renders correctly
- [ ] Chat messages send/receive
- [ ] Date/time pickers functional
- [ ] No console errors on critical pages

---

## Module 20: Security Verification

### TC-20.1: Authorization Checks
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call pool admin API without admin role | 403 Forbidden |
| 2 | Call super admin API without super admin flag | 403 Forbidden |
| 3 | Access another user's predictions via API | Blocked by RLS |
| 4 | Modify pool settings via API as non-admin | 403 Forbidden |

### TC-20.2: Input Sanitization
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter `<script>alert('xss')</script>` as pool name | Script not executed, text escaped |
| 2 | Enter SQL injection in search: `'; DROP TABLE users;--` | Query parameterized, no effect |
| 3 | Enter extremely long string (10,000 chars) in message | Truncated or rejected with length error |

### TC-20.3: API Rate Limiting / Abuse
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Rapid-fire API calls (e.g., 100 requests in 10 seconds) | Rate limited or handled gracefully |

---

## Sign-Off

| Module | Tester | Date | Status | Notes |
|--------|--------|------|--------|-------|
| 1. Authentication | | | | |
| 2. Dashboard | | | | |
| 3. Pool Creation | | | | |
| 4. Joining a Pool | | | | |
| 5. Predictions (Full Tournament) | | | | |
| 6. Predictions (Progressive) | | | | |
| 7. Predictions (Bracket Picker) | | | | |
| 8. Scoring & Leaderboard | | | | |
| 9. XP, Badges & Analytics | | | | |
| 10. Community & Chat | | | | |
| 11. Pool Admin | | | | |
| 12. Super Admin | | | | |
| 13. Email Notifications | | | | |
| 14. Profile & Account | | | | |
| 15. Cron Jobs | | | | |
| 16. Static Pages | | | | |
| 17. Responsive & PWA | | | | |
| 18. Edge Cases | | | | |
| 19. Cross-Browser | | | | |
| 20. Security | | | | |

**Overall UAT Status**: [ ] PASS / [ ] FAIL

**Sign-off by**: ___________________________  **Date**: _______________
