'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { useStandaloneMode } from '@/hooks/useStandaloneMode'
import type { MemberData } from '../types'
import type {
  CommunityTabProps,
  Message,
  MessageWithReactions,
  ReplyPreview,
  MemberWithLevel,
  FeedItem,
  SystemEvent,
} from './types'
import { ChatMessage, DayHeader } from './ChatMessage'
import { MessageInput } from './MessageInput'
import { SystemEventCard } from './SystemEventCard'
import { PinnedMessageCard } from './PinnedMessageCard'
import { PinMessageModal } from './PinMessageModal'
import { QuickActions } from './QuickActions'
import { PredictionShareCard } from './PredictionShareCard'
import { BadgeFlexCard } from './BadgeFlexCard'
import { StandingsDropCard } from './StandingsDropCard'
import { SharePredictionModal } from './SharePredictionModal'
import { TypingIndicator } from './TypingIndicator'
import { DesktopSidebar } from './DesktopSidebar'
import { OnlineMembersStrip } from './OnlineMembersStrip'
import { usePresence } from './usePresence'
import { formatDayHeader, generateSystemEvents } from './helpers'
import { computeFullXPBreakdown } from '../analytics/xpSystem'
import type { EarnedBadge } from '../analytics/xpSystem'
import { computeFullBPXPBreakdown } from '../analytics/bracketPickerXpSystem'
import { matchScoresToPredictionResults, computeCrowdPredictions, computeStreaks } from '../analytics/analyticsHelpers'
import type { PoolSettings } from '../results/points'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import type { GroupStanding, Team } from '@/lib/tournament'
import type { MatchWithResult } from '@/lib/bracketPickerScoring'
import type { PinnedMessage, BadgeFlexMetadata, StandingsDropMetadata, ReactionCount } from './types'

export function CommunityTab({
  poolId,
  poolName,
  currentUserId,
  members,
  isAdmin,
  matches,
  teams,
  allPredictions,
  userEntries,
  settings,
  conductData,
  predictionMode,
  matchScores,
  onShowHowToPlay,
  allBPGroupRankings = [],
  allBPThirdPlaceRankings = [],
  allBPKnockoutPicks = [],
  poolCreatedAt = '',
  initialLastReadAt,
}: CommunityTabProps) {
  // =====================
  // STATE
  // =====================
  const [messages, setMessages] = useState<MessageWithReactions[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [replyingTo, setReplyingTo] = useState<MessageWithReactions | null>(null)
  const [replyPreviews, setReplyPreviews] = useState<Map<string, ReplyPreview>>(new Map())
  const [showPinModal, setShowPinModal] = useState(false)
  const [editingPin, setEditingPin] = useState<PinnedMessage | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [unseenCount, setUnseenCount] = useState(0)
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const newDividerRef = useRef<HTMLDivElement>(null)
  // Use the pre-fetched last_read_at from useUnreadBanter (captured before markAsRead runs)
  const lastReadAtRef = useRef<string | null>(initialLastReadAt ?? null)
  // If the prop arrives after initial render (async fetch completed), update the ref once
  if (initialLastReadAt && !lastReadAtRef.current) {
    lastReadAtRef.current = initialLastReadAt
  }
  const wasNearBottomRef = useRef(true)
  const supabaseRef = useRef(createClient())
  const chatWrapperRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileHeight, setMobileHeight] = useState<number | null>(null)
  const [desktopChatHeight, setDesktopChatHeight] = useState<number | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const isStandalone = useStandaloneMode()

  // =====================
  // PRESENCE
  // =====================
  const currentMember = useMemo(() => members.find(m => m.user_id === currentUserId), [members, currentUserId])
  const { onlineUsers, typingUsers, setIsTyping } = usePresence(poolId, {
    user_id: currentUserId,
    username: currentMember?.users.username ?? '',
    full_name: currentMember?.users.full_name ?? '',
  })

  // =====================
  // MEMBER LEVEL COMPUTATION (memoized)
  // =====================
  const memberLevels = useMemo(() => {
    const map = new Map<string, MemberWithLevel>()
    const isBP = predictionMode === 'bracket_picker'

    // Pre-compute bracket picker tournament data once (shared across all members)
    let bpActualGroupStandings: Map<string, GroupStanding[]> | null = null
    let bpActualThirdPlaceQualifierTeamIds: Set<string> | null = null
    let bpCompletedMatches: MatchWithResult[] = []

    if (isBP) {
      // Actual scores for group standings
      const actualScores = new Map<string, { home: number; away: number }>()
      for (const m of matches) {
        if (m.stage === 'group' && (m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
          actualScores.set(m.match_id, { home: m.home_score_ft, away: m.away_score_ft })
        }
      }

      const tournamentTeams: Team[] = teams.map(t => ({
        team_id: t.team_id, country_name: t.country_name, country_code: t.country_code,
        group_letter: t.group_letter, fifa_ranking_points: t.fifa_ranking_points, flag_url: t.flag_url,
      }))
      const tournamentMatches = matches.map(m => ({
        match_id: m.match_id, match_number: m.match_number, stage: m.stage, group_letter: m.group_letter,
        match_date: m.match_date, venue: m.venue, status: m.status, home_team_id: m.home_team_id,
        away_team_id: m.away_team_id, home_team_placeholder: m.home_team_placeholder,
        away_team_placeholder: m.away_team_placeholder,
        home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
        away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
      }))
      const groupMatches = tournamentMatches.filter(m => m.stage === 'group')

      bpActualGroupStandings = new Map<string, GroupStanding[]>()
      for (const letter of GROUP_LETTERS) {
        const gMatches = groupMatches.filter(m => m.group_letter === letter)
        bpActualGroupStandings.set(letter, calculateGroupStandings(letter, gMatches, actualScores, tournamentTeams, conductData))
      }

      const rankedThirds = rankThirdPlaceTeams(bpActualGroupStandings)
      bpActualThirdPlaceQualifierTeamIds = new Set(rankedThirds.slice(0, 8).map(t => t.team_id))

      bpCompletedMatches = matches
        .filter(m => m.stage !== 'group' && m.is_completed)
        .map(m => ({
          match_id: m.match_id, match_number: m.match_number, stage: m.stage,
          group_letter: m.group_letter, match_date: m.match_date, venue: m.venue,
          status: m.status, home_team_id: m.home_team_id, away_team_id: m.away_team_id,
          home_team_placeholder: m.home_team_placeholder, away_team_placeholder: m.away_team_placeholder,
          home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
          away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
          is_completed: m.is_completed, home_score_ft: m.home_score_ft, away_score_ft: m.away_score_ft,
          home_score_pso: m.home_score_pso, away_score_pso: m.away_score_pso, winner_team_id: m.winner_team_id,
        }))
    }

    const defaultLevel = (userId: string, username: string, fullName: string, rank: number | null): MemberWithLevel => ({
      user_id: userId, username, full_name: fullName, level: 1, level_name: 'Rookie', total_xp: 0, current_rank: rank, badges: [],
    })

    for (const member of members) {
      const entries = member.entries ?? []
      const bestEntry = entries.length > 0
        ? entries.reduce((best, e) => (e.total_points > best.total_points ? e : best), entries[0])
        : null

      if (!bestEntry) {
        map.set(member.user_id, defaultLevel(member.user_id, member.users.username, member.users.full_name, null))
        continue
      }

      try {
        if (isBP && bpActualGroupStandings && bpActualThirdPlaceQualifierTeamIds) {
          // Bracket picker mode: use BP XP system
          const entryGroupRankings = allBPGroupRankings.filter(r => r.entry_id === bestEntry.entry_id)
          const entryThirdPlaceRankings = allBPThirdPlaceRankings.filter(r => r.entry_id === bestEntry.entry_id)
          const entryKnockoutPicks = allBPKnockoutPicks.filter(r => r.entry_id === bestEntry.entry_id)

          if (entryGroupRankings.length === 0 && entryKnockoutPicks.length === 0) {
            map.set(member.user_id, defaultLevel(member.user_id, member.users.username, member.users.full_name, bestEntry.current_rank ?? null))
            continue
          }

          const bpBreakdown = computeFullBPXPBreakdown({
            groupRankings: entryGroupRankings,
            thirdPlaceRankings: entryThirdPlaceRankings,
            knockoutPicks: entryKnockoutPicks,
            actualGroupStandings: bpActualGroupStandings,
            actualThirdPlaceQualifierTeamIds: bpActualThirdPlaceQualifierTeamIds,
            completedMatches: bpCompletedMatches,
            matches,
            teams,
            submittedAt: bestEntry.predictions_submitted_at ?? null,
            poolCreatedAt,
          })

          map.set(member.user_id, {
            user_id: member.user_id,
            username: member.users.username,
            full_name: member.users.full_name,
            level: bpBreakdown.currentLevel.level,
            level_name: bpBreakdown.currentLevel.name,
            total_xp: bpBreakdown.totalXP,
            current_rank: bestEntry.current_rank ?? null,
            badges: bpBreakdown.earnedBadges,
          })
        } else {
          // Standard mode: use regular XP system
          const entryPreds = allPredictions.filter(p => p.entry_id === bestEntry.entry_id)
          const entryMatchScores = matchScores.filter(ms => ms.entry_id === bestEntry.entry_id)

          if (entryPreds.length === 0 && entryMatchScores.length === 0) {
            map.set(member.user_id, defaultLevel(member.user_id, member.users.username, member.users.full_name, bestEntry.current_rank ?? null))
            continue
          }

          const predResults = matchScoresToPredictionResults(entryMatchScores)
          const streakData = computeStreaks(predResults)
          const crowdData = computeCrowdPredictions(matches, allPredictions, entryPreds, members)

          const xpBreakdown = computeFullXPBreakdown({
            predictionResults: predResults,
            matches,
            crowdData,
            streaks: streakData,
            entryPredictions: entryPreds,
            entryRank: bestEntry.current_rank,
            totalMatches: matches.length,
          })

          map.set(member.user_id, {
            user_id: member.user_id,
            username: member.users.username,
            full_name: member.users.full_name,
            level: xpBreakdown.currentLevel.level,
            level_name: xpBreakdown.currentLevel.name,
            total_xp: xpBreakdown.totalXP,
            current_rank: bestEntry.current_rank ?? null,
            badges: xpBreakdown.earnedBadges,
          })
        }
      } catch {
        map.set(member.user_id, defaultLevel(member.user_id, member.users.username, member.users.full_name, bestEntry.current_rank ?? null))
      }
    }

    return map
  }, [members, allPredictions, matches, settings, teams, conductData, predictionMode, allBPGroupRankings, allBPThirdPlaceRankings, allBPKnockoutPicks, poolCreatedAt])

  // =====================
  // STORED SCORE MAP (single source of truth from DB)
  // =====================
  const computedScoreMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const member of members) {
      for (const entry of member.entries ?? []) {
        const matchPts = entry.match_points ?? 0
        const bonusPts = entry.bonus_points ?? 0
        const adjustment = entry.point_adjustment ?? 0
        map.set(entry.entry_id, entry.scored_total_points ?? (matchPts + bonusPts + adjustment))
      }
    }
    return map
  }, [members])

  // =====================
  // SYSTEM EVENTS (memoized)
  // =====================
  const systemEvents = useMemo(() => {
    return generateSystemEvents(matches, members, memberLevels)
  }, [matches, members, memberLevels])

  // =====================
  // SCROLL HELPERS
  // =====================
  const isNearBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current
      return el.scrollHeight - el.scrollTop - el.clientHeight < 100
    }
    return true
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current
      el.scrollTo({ top: el.scrollHeight, behavior })
    }
    setShowNewMessagesPill(false)
    setUnseenCount(0)
  }, [])

  // =====================
  // LOAD MESSAGES
  // =====================
  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true)

      const { data } = await supabaseRef.current
        .from('pool_messages')
        .select('*')
        .eq('pool_id', poolId)
        .order('created_at', { ascending: false })
        .limit(40)

      if (data) {
        const msgs: MessageWithReactions[] = data.reverse().map(m => ({
          ...m,
          message_type: m.message_type ?? 'text',
          reply_to_message_id: m.reply_to_message_id ?? null,
          metadata: m.metadata ?? {},
          reactions: [],
        }))
        setMessages(msgs)
        setHasMore(data.length === 40)

        // Load reply previews
        const replyIds = msgs
          .map(m => m.reply_to_message_id)
          .filter((id): id is string => id !== null)

        if (replyIds.length > 0) {
          const { data: replyMsgs } = await supabaseRef.current
            .from('pool_messages')
            .select('message_id, content, user_id')
            .in('message_id', replyIds)

          if (replyMsgs) {
            const previews = new Map<string, ReplyPreview>()
            for (const rm of replyMsgs) {
              const author = members.find(m => m.user_id === rm.user_id)
              previews.set(rm.message_id, {
                message_id: rm.message_id,
                content: rm.content.slice(0, 60) + (rm.content.length > 60 ? '...' : ''),
                author_name: author?.users.full_name || author?.users.username || 'Unknown',
              })
            }
            setReplyPreviews(previews)
          }
        }
      }
      setLoading(false)
      // Scroll to new messages divider if it exists, otherwise bottom
      requestAnimationFrame(() => {
        if (newDividerRef.current) {
          newDividerRef.current.scrollIntoView({ behavior: 'instant', block: 'center' })
        } else {
          scrollToBottom('instant')
        }
        setTimeout(() => {
          if (newDividerRef.current) {
            newDividerRef.current.scrollIntoView({ behavior: 'instant', block: 'center' })
          } else {
            scrollToBottom('instant')
          }
        }, 100)
      })
    }
    loadMessages()
  }, [poolId, scrollToBottom, members])

  // =====================
  // REALTIME SUBSCRIPTION
  // =====================
  // Set Realtime auth token from the current session (WebSocket doesn't use cookies)
  useEffect(() => {
    const supabase = supabaseRef.current
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token)
      }
    })
    // Keep Realtime token in sync when session refreshes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.access_token) {
          supabase.realtime.setAuth(session.access_token)
        }
      }
    )
    return () => authSub.unsubscribe()
  }, [])

  useEffect(() => {
    const supabase = supabaseRef.current
    const channel = supabase
      .channel(`pool-community-${poolId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pool_messages',
          filter: `pool_id=eq.${poolId}`,
        },
        (payload) => {
          console.log('[Realtime] INSERT received:', payload.new)
          const newMsg: MessageWithReactions = {
            ...(payload.new as Message),
            message_type: (payload.new as any).message_type ?? 'text',
            reply_to_message_id: (payload.new as any).reply_to_message_id ?? null,
            metadata: (payload.new as any).metadata ?? {},
            reactions: [],
          }
          wasNearBottomRef.current = isNearBottom()

          // Show new messages pill if scrolled up and not own message
          if (!wasNearBottomRef.current && newMsg.user_id !== currentUserId) {
            setUnseenCount(prev => prev + 1)
            setShowNewMessagesPill(true)
          }

          setMessages(prev =>
            prev.some(m => m.message_id === newMsg.message_id)
              ? prev
              : [...prev, newMsg]
          )
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] pool-community status:', status, err ?? '')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [poolId, isNearBottom, currentUserId])

  // Auto-scroll when new message arrives
  useEffect(() => {
    if (wasNearBottomRef.current) {
      scrollToBottom()
    }
  }, [messages.length, scrollToBottom])

  // =====================
  // MOBILE VIEWPORT
  // =====================
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isMobile) {
      setMobileHeight(null)
      return
    }

    const vv = window.visualViewport

    const prevOverflow = document.body.style.overflow
    const prevPosition = document.body.style.position
    const prevWidth = document.body.style.width
    const prevTop = document.body.style.top

    window.scrollTo(0, 0)

    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    document.body.style.top = '0'

    const initialHeight = window.innerHeight
    let rafId: number
    const recalc = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (!chatWrapperRef.current) return
        const topOffset = chatWrapperRef.current.getBoundingClientRect().top
        const viewportH = vv ? vv.height : window.innerHeight
        const bottomNav = document.querySelector('nav.fixed.bottom-0')
        const bottomOffset = bottomNav ? bottomNav.getBoundingClientRect().height : 0
        setMobileHeight(Math.max(0, viewportH - topOffset - bottomOffset))
        setKeyboardOpen(viewportH < initialHeight * 0.75)
      })
    }

    recalc()

    if (vv) {
      vv.addEventListener('resize', recalc)
      vv.addEventListener('scroll', recalc)
    }
    window.addEventListener('resize', recalc)

    return () => {
      cancelAnimationFrame(rafId)
      if (vv) {
        vv.removeEventListener('resize', recalc)
        vv.removeEventListener('scroll', recalc)
      }
      window.removeEventListener('resize', recalc)

      document.body.style.overflow = prevOverflow
      document.body.style.position = prevPosition
      document.body.style.width = prevWidth
      document.body.style.top = prevTop
    }
  }, [isMobile])

  useEffect(() => {
    if (!isMobile || mobileHeight === null) return
    if (wasNearBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom('instant'))
    }
  }, [mobileHeight, isMobile, scrollToBottom])

  // Measure available desktop chat wrapper height (viewport minus wrapper top offset minus footer)
  useEffect(() => {
    if (isMobile) return
    const measure = () => {
      const el = chatWrapperRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      const footer = document.querySelector('footer')
      const footerH = footer ? footer.getBoundingClientRect().height : 0
      setDesktopChatHeight(window.innerHeight - top - footerH)
    }
    // Measure after layout settles
    requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isMobile, loading])

  // Prevent body scrolling on desktop — chat has its own scroll container
  useEffect(() => {
    if (isMobile) return
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [isMobile])

  // Track scroll position
  useEffect(() => {
    if (!scrollContainerRef.current) return
    const el = scrollContainerRef.current
    const handleScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
      wasNearBottomRef.current = nearBottom
      setShowScrollDown(!nearBottom)
      if (nearBottom) {
        setShowNewMessagesPill(false)
        setUnseenCount(0)
      }
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // =====================
  // REACTION LOADING + REALTIME
  // =====================
  const loadReactionsForMessages = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) return
    const { data: reactions } = await supabaseRef.current
      .from('pool_message_reactions')
      .select('message_id, emoji, user_id')
      .in('message_id', messageIds)

    if (!reactions) return

    const reactionMap = new Map<string, Map<string, { count: number; users: Set<string> }>>()
    for (const r of reactions) {
      if (!reactionMap.has(r.message_id)) reactionMap.set(r.message_id, new Map())
      const emojiMap = reactionMap.get(r.message_id)!
      if (!emojiMap.has(r.emoji)) emojiMap.set(r.emoji, { count: 0, users: new Set() })
      const entry = emojiMap.get(r.emoji)!
      entry.count++
      entry.users.add(r.user_id)
    }

    setMessages(prev => prev.map(msg => {
      const emojiMap = reactionMap.get(msg.message_id)
      if (!emojiMap) return msg
      const reactionCounts: ReactionCount[] = Array.from(emojiMap.entries()).map(([emoji, { count, users }]) => ({
        emoji,
        count,
        reacted_by_me: users.has(currentUserId),
      }))
      return { ...msg, reactions: reactionCounts }
    }))
  }, [currentUserId])

  useEffect(() => {
    const ids = messages.map(m => m.message_id)
    if (ids.length > 0) loadReactionsForMessages(ids)
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = supabaseRef.current
    const channel = supabase
      .channel(`pool-reactions-${poolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pool_message_reactions',
        },
        () => {
          const ids = messages.map(m => m.message_id)
          loadReactionsForMessages(ids)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [poolId, messages.length, loadReactionsForMessages]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const msg = messages.find(m => m.message_id === messageId)
    if (!msg) return

    const existing = msg.reactions.find(r => r.emoji === emoji)
    const hasReacted = existing?.reacted_by_me ?? false

    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.message_id !== messageId) return m
      let newReactions: ReactionCount[]
      if (hasReacted) {
        newReactions = m.reactions
          .map(r => r.emoji === emoji ? { ...r, count: r.count - 1, reacted_by_me: false } : r)
          .filter(r => r.count > 0)
      } else {
        const found = m.reactions.find(r => r.emoji === emoji)
        if (found) {
          newReactions = m.reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, reacted_by_me: true } : r)
        } else {
          newReactions = [...m.reactions, { emoji, count: 1, reacted_by_me: true }]
        }
      }
      return { ...m, reactions: newReactions }
    }))

    if (hasReacted) {
      await supabaseRef.current
        .from('pool_message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', currentUserId)
        .eq('emoji', emoji)
    } else {
      await supabaseRef.current
        .from('pool_message_reactions')
        .insert({ message_id: messageId, user_id: currentUserId, emoji })
    }
  }, [messages, currentUserId])

  // =====================
  // LOAD OLDER MESSAGES
  // =====================
  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)

    const oldestMessage = messages[0]
    const { data } = await supabaseRef.current
      .from('pool_messages')
      .select('*')
      .eq('pool_id', poolId)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(40)

    if (data) {
      const older: MessageWithReactions[] = data.reverse().map(m => ({
        ...m,
        message_type: m.message_type ?? 'text',
        reply_to_message_id: m.reply_to_message_id ?? null,
        metadata: m.metadata ?? {},
        reactions: [],
      }))
      setMessages(prev => [...older, ...prev])
      setHasMore(data.length === 40)
    }
    setLoadingMore(false)
  }, [loadingMore, hasMore, messages, poolId])

  // =====================
  // SEND MESSAGE
  // =====================
  const handleSendMessage = useCallback(async (
    content: string,
    mentions: string[],
    replyToId: string | null,
  ) => {
    console.log('[Mention DEBUG] handleSendMessage called:', { content, mentions, replyToId })

    const { data, error } = await supabaseRef.current
      .from('pool_messages')
      .insert({
        pool_id: poolId,
        user_id: currentUserId,
        content,
        mentions,
        message_type: 'text',
        reply_to_message_id: replyToId,
        metadata: {},
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to send message:', error)
      return
    }

    if (data) {
      const newMsg: MessageWithReactions = {
        ...data,
        message_type: data.message_type ?? 'text',
        reply_to_message_id: data.reply_to_message_id ?? null,
        metadata: data.metadata ?? {},
        reactions: [],
      }
      wasNearBottomRef.current = true
      setMessages(prev =>
        prev.some(m => m.message_id === newMsg.message_id)
          ? prev
          : [...prev, newMsg]
      )

      // Fire-and-forget push notification to all pool members (every message)
      fetch('/api/notifications/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: poolId,
          message_content: content,
        }),
        keepalive: true,
      }).catch(err => console.error('[MessagePush] fetch failed:', err))

      console.log('[Mention DEBUG] mentions array:', mentions, 'length:', mentions.length)

      if (mentions.length > 0) {
        console.log('[Mention DEBUG] Firing notification fetch...')
        const mentionPayload = JSON.stringify({
          pool_id: poolId,
          message_content: content,
          mentioned_user_ids: mentions,
        })

        // Send with keepalive so the request survives component unmount / navigation
        const sendMentionNotification = async (attempt = 1): Promise<void> => {
          try {
            const res = await fetch('/api/notifications/mention', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: mentionPayload,
              keepalive: true,
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              console.error(`[Mention notification] API error (attempt ${attempt}):`, res.status, body)
              if (attempt < 2) {
                await new Promise(r => setTimeout(r, 1500))
                return sendMentionNotification(attempt + 1)
              }
            }
          } catch (err) {
            console.error(`[Mention notification] fetch failed (attempt ${attempt}):`, err)
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1500))
              return sendMentionNotification(attempt + 1)
            }
          }
        }

        sendMentionNotification()
      }
    }
  }, [poolId, currentUserId])

  // =====================
  // TYPING
  // =====================
  const handleTyping = useCallback(() => {
    setIsTyping(true)
  }, [setIsTyping])

  // =====================
  // ACTION HANDLERS
  // =====================
  const handleReply = useCallback((message: MessageWithReactions) => {
    setReplyingTo(message)
  }, [])

  const handleReact = useCallback((_message: MessageWithReactions, emoji: string) => {
    handleToggleReaction(_message.message_id, emoji)
  }, [handleToggleReaction])

  const handlePin = useCallback((_message: MessageWithReactions) => {
    setEditingPin(null)
    setShowPinModal(true)
  }, [])

  const handleEditPin = useCallback((pinned: PinnedMessage) => {
    setEditingPin(pinned)
    setShowPinModal(true)
  }, [])

  const handleShareBoldCall = useCallback(() => {
    setShowShareModal(true)
  }, [])

  const handleFlexBadges = useCallback(async () => {
    const myLevel = memberLevels.get(currentUserId)
    if (!myLevel) return

    const metadata: BadgeFlexMetadata = {
      badges: myLevel.badges.map(b => ({
        id: b.id,
        emoji: b.emoji,
        name: b.name,
        tier: b.tier,
        rarity: b.rarity,
        xpBonus: b.xpBonus,
      })),
      level: myLevel.level,
      level_name: myLevel.level_name,
      total_xp: myLevel.total_xp,
    }

    const { data, error } = await supabaseRef.current.from('pool_messages').insert({
      pool_id: poolId,
      user_id: currentUserId,
      content: `🏆 Flexing my badges — Level ${myLevel.level} ${myLevel.level_name} with ${myLevel.badges.length} badge${myLevel.badges.length !== 1 ? 's' : ''}!`,
      mentions: [],
      message_type: 'badge_flex',
      reply_to_message_id: null,
      metadata,
    }).select().single()

    if (!error && data) {
      wasNearBottomRef.current = true
      setMessages(prev =>
        prev.some(m => m.message_id === data.message_id)
          ? prev
          : [...prev, { ...data, message_type: data.message_type ?? 'badge_flex', reply_to_message_id: null, metadata: data.metadata ?? {}, reactions: [] }]
      )
    }
  }, [memberLevels, currentUserId, poolId])

  const handleDropStandings = useCallback(async () => {
    const ranked = members
      .flatMap(m => (m.entries ?? []).map(e => ({
        user_id: m.user_id,
        full_name: m.users.full_name || m.users.username,
        rank: e.current_rank ?? 999,
        points: computedScoreMap.get(e.entry_id) ?? e.total_points,
        delta: e.previous_rank !== null && e.current_rank !== null
          ? e.previous_rank - e.current_rank
          : 0,
      })))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5)

    if (ranked.length === 0) return

    const metadata: StandingsDropMetadata = {
      entries: ranked,
      pool_name: poolName,
      timestamp: new Date().toISOString(),
    }

    const { data, error } = await supabaseRef.current.from('pool_messages').insert({
      pool_id: poolId,
      user_id: currentUserId,
      content: `📊 Current standings — ${ranked[0]?.full_name} leads with ${ranked[0]?.points.toLocaleString()} pts!`,
      mentions: [],
      message_type: 'standings_drop',
      reply_to_message_id: null,
      metadata,
    }).select().single()

    if (!error && data) {
      wasNearBottomRef.current = true
      setMessages(prev =>
        prev.some(m => m.message_id === data.message_id)
          ? prev
          : [...prev, { ...data, message_type: data.message_type ?? 'standings_drop', reply_to_message_id: null, metadata: data.metadata ?? {}, reactions: [] }]
      )
    }
  }, [members, poolName, poolId, currentUserId, computedScoreMap])

  const sharedCallsCount = useMemo(() => {
    return messages.filter(m => m.message_type === 'prediction_share').length
  }, [messages])

  // =====================
  // BUILD FEED
  // =====================
  const feedItems = useMemo(() => {
    const items: FeedItem[] = []

    for (const msg of messages) {
      items.push({ type: 'message', data: msg })
    }

    for (const event of systemEvents) {
      items.push({ type: 'system_event', data: event })
    }

    items.sort((a, b) => {
      const getTime = (item: FeedItem) =>
        item.type === 'message' ? item.data.created_at
        : item.type === 'system_event' ? item.data.timestamp
        : ''
      return new Date(getTime(a)).getTime() - new Date(getTime(b)).getTime()
    })

    // Insert day headers
    const withHeaders: FeedItem[] = []
    let lastDay = ''
    for (const item of items) {
      const timestamp = item.type === 'message' ? item.data.created_at : item.type === 'system_event' ? item.data.timestamp : ''
      const dayText = formatDayHeader(timestamp)
      if (dayText !== lastDay) {
        withHeaders.push({ type: 'day_header', data: { text: dayText, key: `day-${timestamp}` } })
        lastDay = dayText
      }
      withHeaders.push(item)
    }

    // Insert "New messages" divider before the first unread message from others
    const lastRead = initialLastReadAt ?? lastReadAtRef.current
    if (lastRead) {
      const lastReadTime = new Date(lastRead).getTime()
      let dividerInserted = false
      const withDivider: FeedItem[] = []
      for (const item of withHeaders) {
        if (!dividerInserted && item.type === 'message' && item.data.user_id !== currentUserId) {
          const msgTime = new Date(item.data.created_at).getTime()
          if (msgTime > lastReadTime) {
            withDivider.push({ type: 'new_divider', data: null })
            dividerInserted = true
          }
        }
        withDivider.push(item)
      }
      if (dividerInserted) return withDivider
    }

    return withHeaders
  }, [messages, systemEvents, currentUserId, initialLastReadAt])

  // =====================
  // RENDER
  // =====================
  const mobileChat = isMobile && mobileHeight !== null
  const hasMessages = messages.length > 0 || systemEvents.length > 0

  // Empty state
  const emptyState = (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
      <span className="text-5xl mb-4">💬</span>
      <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">
        Start the conversation
      </h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-[280px]">
        Share a prediction, flex your badges, or just talk trash
      </p>
      <div className="flex flex-col gap-2.5 w-full max-w-[260px]">
        <button
          onClick={handleShareBoldCall}
          className="flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/15 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/25 active:scale-[0.97] transition-all"
        >
          🎯 Share Prediction
        </button>
        <button
          onClick={handleFlexBadges}
          className="flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-border-default hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.97] transition-all"
        >
          🏆 Flex Badges
        </button>
        <button
          onClick={handleDropStandings}
          className="flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-border-default hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.97] transition-all"
        >
          📊 Drop Standings
        </button>
      </div>
    </div>
  )

  // Feed content
  const feedContent = (
    <>
      {/* Pinned Message */}
      <PinnedMessageCard
        poolId={poolId}
        isAdmin={isAdmin}
        onShareBoldCall={handleShareBoldCall}
        onEditPin={handleEditPin}
        sharedCallsCount={sharedCallsCount}
      />

      {/* Load more */}
      {hasMore && (
        <div className="text-center pb-2">
          <button
            onClick={loadOlderMessages}
            disabled={loadingMore}
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? 'Loading...' : 'Load earlier messages'}
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasMessages && emptyState}

      {/* Feed items */}
      {!loading && feedItems.map((item) => {
        if (item.type === 'new_divider') {
          return (
            <div key="new-divider" ref={newDividerRef} className="flex items-center gap-3 my-4">
              <div className="flex-1 border-t border-danger-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-danger-500">
                New messages
              </span>
              <div className="flex-1 border-t border-danger-400" />
            </div>
          )
        }

        if (item.type === 'day_header') {
          return <DayHeader key={item.data.key} text={item.data.text} />
        }

        if (item.type === 'system_event') {
          return <SystemEventCard key={item.data.id} event={item.data} />
        }

        if (item.type === 'message') {
          const msg = item.data

          // Rich content cards — reactions only on these
          if (msg.message_type === 'prediction_share') {
            return (
              <PredictionShareCard
                key={msg.message_id}
                message={msg}
                members={members}
                memberLevels={memberLevels}
                currentUserId={currentUserId}
                reactions={msg.reactions}
                onToggleReaction={(emoji) => handleToggleReaction(msg.message_id, emoji)}
              />
            )
          }

          if (msg.message_type === 'badge_flex') {
            return (
              <BadgeFlexCard
                key={msg.message_id}
                message={msg}
                members={members}
                memberLevels={memberLevels}
                reactions={msg.reactions}
                onToggleReaction={(emoji) => handleToggleReaction(msg.message_id, emoji)}
              />
            )
          }

          if (msg.message_type === 'standings_drop') {
            return (
              <StandingsDropCard
                key={msg.message_id}
                message={msg}
                members={members}
                memberLevels={memberLevels}
                currentUserId={currentUserId}
                reactions={msg.reactions}
                onToggleReaction={(emoji) => handleToggleReaction(msg.message_id, emoji)}
              />
            )
          }

          // Text message — no reactions per spec
          const reply = msg.reply_to_message_id
            ? replyPreviews.get(msg.reply_to_message_id) ?? null
            : null

          return (
            <ChatMessage
              key={msg.message_id}
              message={msg}
              members={members}
              memberLevels={memberLevels}
              currentUserId={currentUserId}
              replyPreview={reply}
            />
          )
        }

        return null
      })}

      <div ref={bottomRef} />
    </>
  )

  // Input bar content
  const inputBarContent = (
    <>
      <TypingIndicator typingUsers={typingUsers} />
      <QuickActions
        onSharePrediction={handleShareBoldCall}
        onFlexBadges={handleFlexBadges}
        onDropStandings={handleDropStandings}
      />
      <MessageInput
        poolId={poolId}
        currentUserId={currentUserId}
        members={members}
        memberLevels={memberLevels}
        replyingTo={replyingTo}
        onClearReply={() => setReplyingTo(null)}
        onSend={handleSendMessage}
        onTyping={handleTyping}
      />
    </>
  )

  return (
    <>
      <div
        ref={chatWrapperRef}
        className={mobileChat ? 'flex flex-col overflow-hidden -mx-4' : 'flex flex-col overflow-hidden'}
        style={mobileChat ? { height: `${mobileHeight}px` } : desktopChatHeight ? { height: `${desktopChatHeight}px` } : undefined}
      >
        {/* Main content area */}
        <div className={`flex gap-0 md:gap-4 ${mobileChat ? 'flex-1 min-h-0 flex-col items-start' : 'flex-1 min-h-0 items-stretch'}`}>
          {/* Left: Chat Panel */}
          <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${mobileChat ? 'w-full' : ''}`}>
            {/* Mobile Online Strip */}
            <OnlineMembersStrip members={members} onlineUsers={onlineUsers} currentUserId={currentUserId} />

            {/* Chat area */}
            <div
              ref={scrollContainerRef}
              className={
                mobileChat
                  ? 'flex-1 min-h-0 overflow-y-auto overscroll-y-contain space-y-3 px-4 relative'
                  : 'flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-none space-y-3 px-1 pb-4'
              }
            >
              {feedContent}

              {/* Scroll to bottom / new messages — sticky at bottom of chat area */}
              {showScrollDown && (
                <div className="sticky bottom-3 z-10 flex flex-col items-center gap-1.5 pointer-events-none">
                  {showNewMessagesPill && (
                    <button
                      onClick={() => scrollToBottom()}
                      className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary-600 text-white text-xs font-medium shadow-lg shadow-primary-600/25 hover:bg-primary-700 active:scale-95 transition-all"
                    >
                      ↓ {unseenCount > 0 ? `${unseenCount} new message${unseenCount !== 1 ? 's' : ''}` : 'New messages'}
                    </button>
                  )}
                  <button
                    onClick={() => scrollToBottom()}
                    className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 active:scale-90 transition-all"
                    aria-label="Scroll to bottom"
                  >
                    <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Desktop Sidebar */}
          <div className="hidden md:block md:w-[260px] md:shrink-0">
            <DesktopSidebar
              members={members}
              memberLevels={memberLevels}
              currentUserId={currentUserId}
              matches={matches}
              allPredictions={allPredictions}
              onlineUsers={onlineUsers}
              systemEvents={systemEvents}
              computedScoreMap={computedScoreMap}
            />
          </div>
        </div>

        {/* Input bar — full-width on mobile (parent already breaks out of page padding) */}
        <div className={
          mobileChat
            ? 'shrink-0'
            : 'shrink-0 mt-0'
        }>
          <Card className={
            mobileChat
              ? `!p-0 ${isStandalone && !keyboardOpen ? '!pb-6' : ''} !rounded-none border-t border-neutral-200 dark:border-border-default`
              : '!p-0 !rounded-b-none md:!rounded-b-xl border-t border-neutral-200 dark:border-border-default shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.25)] md:mr-[calc(260px+1rem)]'
          }>
            {inputBarContent}
          </Card>
        </div>
      </div>

      {/* Modals */}
      {showPinModal && (
        <PinMessageModal
          poolId={poolId}
          currentUserId={currentUserId}
          existingPin={editingPin}
          onClose={() => {
            setShowPinModal(false)
            setEditingPin(null)
          }}
        />
      )}

      {showShareModal && (
        <SharePredictionModal
          poolId={poolId}
          currentUserId={currentUserId}
          matches={matches}
          allPredictions={allPredictions}
          userEntries={userEntries}
          onClose={() => setShowShareModal(false)}
          onMessageSent={(data) => {
            wasNearBottomRef.current = true
            setMessages(prev =>
              prev.some(m => m.message_id === data.message_id)
                ? prev
                : [...prev, { ...data, message_type: data.message_type ?? 'prediction_share', reply_to_message_id: null, metadata: data.metadata ?? {}, reactions: [] }]
            )
          }}
        />
      )}
    </>
  )
}
