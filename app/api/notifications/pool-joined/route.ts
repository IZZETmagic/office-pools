import { NextResponse } from 'next/server'

// =============================================================
// POST /api/notifications/pool-joined — RETIRED 2026-10-06 (N3)
// =============================================================
// This sent the join notices — a welcome to the joiner, "X joined" to the
// pool's admin — when the website's join screens called it from the browser
// after a join. The app never called it, so a join from the app welcomed
// nobody and told the admin nothing.
//
// The join now queues its own notices (lib/pools/join.ts), for every way into a
// pool, and the notification outbox sends them — once each, retried if a send
// fails. This route stays only so a page loaded before the deploy, which still
// calls it, gets an answer rather than an error. It sends nothing.
// =============================================================

export async function POST() {
  return NextResponse.json({ sent: false, reason: 'the join queues its own notices' })
}
