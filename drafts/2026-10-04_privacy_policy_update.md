# Privacy Policy update — draft for approval (2026-10-04)

> **✅ APPLIED 2026-10-04.** Ryan chose **(b)** for Q1. Migration 163 (an answered invite forgets
> its address) is applied to production, and `app/privacy/page.tsx` carries this text. Two
> departures from the draft below: invites have **no expiry**, so the crew wording says "accepted,
> declined or withdrawn, or the crew closes" rather than "or expires"; and the "Last updated" date
> is set to 4 Oct, which should move if the push lands later.

**File:** `app/privacy/page.tsx` · **Last content change:** `9b96fea8`, 7 Sep 2026
**Why now:** App Store submission of 1.3.0. Since 7 Sep we shipped message deletion (148), GIFs
from KLIPY (150), report + block (158), Banter photos (159–162) and Crews (154–156). The policy
says the opposite of what the app does in five places, and the 1.3.0 camera prompt ("…take photos
for your pool's chat") contradicts the policy's "no photo is ever captured" on the same device.

Every factual claim below was checked against the code or migration named beside it.

## Summary

| # | Section | Change | Source of truth |
|---|---|---|---|
| 1 | Header | Last updated → the ship date | — |
| 2 | §2 Banter | Add photos + GIFs to what we store; **replace "cannot be deleted"** | 148, 150, 159 |
| 3 | §2 new | **Photos in Banter** | `mobile/lib/photos.ts`, `community/photos.ts`, 159, 160, 161 |
| 4 | §2 new | **GIFs in Banter** (KLIPY) | `lib/banter/klipy.ts`, `mobile/lib/klipy.ts`, 150 |
| 5 | §2 new | **Reporting and Blocking** | 158, `app/api/banter/report/route.ts` |
| 6 | §2 Camera | **Rewrite** — camera now takes photos; photo picker | `app.json`, `mobile/lib/photos.ts` |
| 7 | §2 new | **Crews** — emails of people who aren't members yet | 154, 155 |
| 8 | §3 | Three use bullets | — |
| 9 | §5 | **Add KLIPY**; Supabase stores photos; Resend sends crew invites | as above |
| 10 | §6 | **Replace "no one can remove a message"** | 148, 158 |
| 11 | §8 | **Replace "deleting your account is the only way"**; what's kept | 148, 158, 160, 154 |
| 12 | §9 | Camera bullet; add delete / report / block | — |

---

## 1 · Header

> Last updated: **October [day], 2026** — the day this deploys, not the day it's written.

## 2 · §2 Banter (Pool Chat)

**Paragraph 1 — replace with:**

> Every pool has a group chat called Banter. When you take part, we store the text of your
> messages, any photos and GIFs you send, who sent them and when, which pool they belong to, any
> members you @mention, the message you were replying to, emoji reactions and who added them,
> messages an admin has pinned, and how far through the conversation you have read.

**Paragraph 2** (share cards) — unchanged.

**Paragraph 3 — currently** *"Banter messages cannot be edited or deleted — by you, by your pool
admin, or by us through the app…"* **— replace with:**

> **You can delete any message you sent, and a pool admin can delete any message in their pool.**
> We can also remove any message. Deleting a message removes everything in it (its text, any
> photo or GIF, its @mentions and its reactions) and leaves the words "Message deleted" in its
> place, so replies to it still make sense. We record who deleted it and when. Messages cannot be
> edited. A deleted message disappears from every member's chat straight away, but anyone who
> saw it before then may have read it or saved a copy, so please still think before you post.

**Paragraph 4** (history visible to current members; leaving keeps your messages) — unchanged.

## 3 · §2 new sub-section, after Banter — "Photos in Banter"

> You can send a photo to a pool's chat, either by taking one with your camera or by choosing one
> you already have. Before a photo is uploaded, your device shrinks it to at most 1,600 pixels on
> its longest side and saves it as a new image. **This removes the details your camera embeds in
> the original, including the location where it was taken, the device that took it, and the
> date.**
>
> Photos are kept in private storage, not at a public address. Only members of that pool and
> SportPool staff can open them. Staff open them to review reports. Each time a photo is shown,
> the app gets a link to it that stops working after one hour.
>
> When a photo message is deleted (by you, by a pool admin, by us, or because the account or pool
> it belongs to is deleted), the photo file itself is removed from storage, normally within
> seconds and at most within an hour. If a photo was uploaded but never posted, for example
> because sending failed, it is removed within about a day.

## 4 · §2 new sub-section — "GIFs in Banter"

> GIFs in Banter are provided by **KLIPY**. When you open the GIF picker or search for a GIF, your
> device sends KLIPY your search words and an identifier we derive from your account. That
> identifier is not your name, email address, username or SportPool account ID, and KLIPY cannot
> use it to work out who you are. When you send a GIF, we tell KLIPY which one was sent and the
> search that found it. GIFs load directly from KLIPY's servers, so KLIPY also receives your
> device's IP address when you search and when a GIF appears in a chat you have open. We ask
> KLIPY for its strictest content filter. With your message we store the GIF's KLIPY address,
> title and dimensions.

## 5 · §2 new sub-section — "Reporting and Blocking"

> **Reporting.** You can report any message in a pool you belong to. A report stores who filed
> it, the reason and any detail you add, and a copy of the message as it was when you reported
> it. The copy is kept even if the message is later deleted, so the report can still be reviewed.
> Reports are emailed to our support team and can be read only by SportPool staff. Pool admins
> cannot see them, and **the member you report is never told who reported them.**
>
> **Blocking.** You can block another member. Blocking applies to every pool you share: their
> Banter messages are hidden from you, they stop counting towards your unread messages, and you
> stop getting push notifications for them. A block is private. **The person you block is not told
> and cannot find out.** You can unblock them at any time in the mobile app, under Settings → Blocked members.

## 6 · §2 "Camera Access (Mobile App Only)" — rename to "Camera and Photos (Mobile App)" and replace with:

> The mobile app uses your camera for two things, each only when you choose it.
>
> **Scanning an invite QR code.** The camera image is read in memory and only the invite code is
> taken from it. No photo or video is saved or sent anywhere, and the camera is switched off as
> soon as you leave the scanner.
>
> **Taking a photo for Banter.** The photo is uploaded only if you send it, and is then handled as
> described under *Photos in Banter*.
>
> To send a photo you already have, the app opens your device's own photo picker, **which gives
> the app only the photo you pick.** The app cannot browse the rest of your photo library. You can
> join pools by typing a code and use Banter without photos, so you never have to grant camera
> access, and you can turn it off at any time in your device settings.

## 7 · §2 new sub-section — "Crews"

> A crew is a group that plays pools together, season after season. You are in a crew because
> you played in one of its pools, or because its captain or co-captain added you and you
> accepted. Other members of a crew can see who is in it.
>
> A captain or co-captain can add someone by their exact username or email address. If the
> address doesn't belong to a SportPool account, we store it with the invite and send that address
> one email containing a link that works only once. We use the address only to send that invite.
> [**⚠ OPEN — see Q1 before approving**: the address currently stays with the invite record until
> the crew is deleted.]

## 8 · §3 How We Use Your Information

- **Replace** "Deliver community features such as Banter chat, reactions, @mentions, and online
  presence" **with** "Deliver community features such as Banter chat, photos, GIFs, reactions,
  @mentions, crews, and online presence".
- **Add** after it: "Review reports of objectionable content and act on them, and apply the
  blocks you set".
- **Add**: "Send a crew invite to an email address a crew captain or co-captain has added".

## 9 · §5 Third-Party Services

- **Supabase**, append: "Photos sent in Banter are stored in Supabase's private file storage."
- **Resend**, change "notifications, deadline reminders, and contact form messages" to
  "notifications, deadline reminders, crew invites, and contact form messages".
- **Add, after Resend:**

> **KLIPY** — Provides GIFs in Banter. Your device sends KLIPY your GIF searches and an identifier
> derived from your account (never your name, email address, username or account ID), we tell
> KLIPY when a GIF is sent, and GIFs load directly from KLIPY's servers, which therefore receive
> your device's IP address. See Section 2.

## 10 · §6 Data Sharing

**Paragraph on Banter visibility** — change "Messages, reactions, pins, and @mentions" to
"Messages, photos, GIFs, reactions, pins, and @mentions".

**Currently** *"Pool admins and SportPool super admins can read chat content. To be clear about
what that does and does not mean: an admin can pin a message, but no one using the app can edit
or remove a message once it is sent. If something in a pool's chat needs to come down, please
contact us…"* **— replace with:**

> Pool admins and SportPool super admins can read chat content. A pool admin can pin or delete any
> message in their pool, and SportPool can delete any message. If something in a chat needs to
> come down, report it from the message itself or [contact us]. Reports are seen only by SportPool
> staff. They are never shared with the member you reported or with pool admins.

## 11 · §8 Data Retention

**The deletion list** — change "your Banter messages and reactions" to "your Banter messages,
photos and reactions, the blocks you have set, the reports you have filed".

**Currently** *"Deleting your account is the only way to remove Banter messages you have posted,
and it removes them from every pool at once…"* **— replace with:**

> Deleting your account removes your Banter messages and photos from every pool at once. Photo
> files are removed from storage within an hour. You can also delete individual messages at any
> time (see Section 2). Leaving a single pool does not remove the messages you posted there.

**"Two things are kept after deletion" → "Three things"**, adding:

> If another member reported one of your messages, the report, including its copy of that
> message, is kept so our moderation record stays complete, but it is no longer linked to your
> account.

**Add a paragraph** (wording depends on Q1):

> If a crew captain invited you by email and you never created an account, your address is kept
> with that invite [until the crew is deleted / until the invite is answered or expires]. To have
> it removed sooner, [contact us].

## 12 · §9 Your Rights

- **Replace** "Revoke camera permission for QR scanning…" **with** "**Revoke** camera permission,
  used for QR scanning and Banter photos, at any time in your device's system settings".
- **Add**: "**Delete** any Banter message you have sent".
- **Add**: "**Report** messages and **block** members in Banter".

---

## Open questions for Ryan

1. **⚠ Crew invite emails are never purged.** `crew_invites.invitee_email` is kept after the
   invite is accepted, declined or expires, and is only removed if the crew is deleted (FK
   cascade, 154). This is someone who never signed up, so storing their address indefinitely is
   the weakest point in the policy. Either **(a)** say so plainly (the draft above already does),
   or **(b)** clear the address when the invite resolves, and say "until the invite is answered
   or expires". **I recommend (b).** It's a small server change, but it's still a code change, so
   it's your call.
2. **Ship date.** The new "Last updated" date should be the day this reaches sportpool.io. The
   policy only goes live when you push, and Apple will read the live page.

## Not changed (checked, still true)

- §2 Entry-Fee Tracking, Purchases, Presence, Push, Sentry, Video Cards.
- The Terms and the FAQ don't claim messages are permanent (grepped), so nothing else needs to
  change to stay consistent with this.
