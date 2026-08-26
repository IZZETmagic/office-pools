'use client'

// Web port of mobile/components/ui/Icon.tsx.
//
// Call sites use SF-Symbol-style names ("house.fill", "chevron.right") for
// continuity with the RN app; ICON_MAP below translates them to Hugeicons
// constants. Keeping the same names on both platforms means an icon choice made
// on one surface is directly comparable on the other, and a screen can be ported
// across without re-deciding every glyph.
//
// `'use client'` is required because @hugeicons/react calls forwardRef at module
// scope and ships no client directive of its own. The boundary is as small as it
// looks — Icon renders a single <svg> and takes no children.

import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert02Icon,
  AlertCircleIcon,
  AnalyticsUpIcon,
  Archive02Icon,
  ArrowDown01Icon,
  ArrowDownRight01Icon,
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
  ArrowUpRight01Icon,
  Attachment01Icon,
  BarChartIcon,
  Bookmark02Icon,
  BubbleChatIcon,
  Calendar02Icon,
  Calendar03Icon,
  CalendarCheckIn01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChampionIcon,
  ChartBarLineIcon,
  CheckmarkBadge01Icon,
  CheckmarkCircle01Icon,
  CircleArrowDataTransferVerticalIcon,
  CircleArrowDown02Icon,
  CircleArrowRight02Icon,
  CircleArrowUp02Icon,
  CircleIcon,
  ClipboardIcon,
  Clock01Icon,
  ClockAlertIcon,
  ClockArrowUpIcon,
  CodeIcon,
  ComputerIcon,
  Copy01Icon,
  CrownIcon,
  Delete02Icon,
  DollarCircleIcon,
  Download01Icon,
  DownloadCircle01Icon,
  File01Icon,
  FilterHorizontalIcon,
  Fire03Icon,
  FlashIcon,
  CheckListIcon,
  FootballIcon,
  GitBranchIcon,
  Grid02Icon,
  HandHelpingIcon,
  HelpCircleIcon,
  HierarchyCircle01Icon,
  HierarchySquare02Icon,
  Home03Icon,
  InformationCircleIcon,
  KeyboardIcon,
  LayoutGridIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Stairs01Icon,
  Link01Icon,
  ListViewIcon,
  Loading03Icon,
  Logout03Icon,
  Mail01Icon,
  MailAtSign01Icon,
  MailSend01Icon,
  MapPinIcon,
  Medal01Icon,
  GripVerticalIcon,
  Menu01Icon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  Note01Icon,
  Notification01Icon,
  NotificationOff01Icon,
  PencilEdit02Icon,
  PieChart01Icon,
  PlusMinus01Icon,
  PlusSignCircleIcon,
  PlusSignIcon,
  QrCodeIcon,
  QrCodeScanIcon,
  Refresh01Icon,
  RibbonIcon,
  Search01Icon,
  SendingOrderIcon,
  Settings02Icon,
  Share08Icon,
  SlidersHorizontalIcon,
  SnowIcon,
  SparklesIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  StarCircleIcon,
  StarIcon,
  Sun01Icon,
  Tag01Icon,
  Target01Icon,
  Tick02Icon,
  Ticket01Icon,
  Triangle02Icon,
  Triangle03Icon,
  UserAdd01Icon,
  UserBlock01Icon,
  UserCircleIcon,
  UserGroup02Icon,
  UserGroupIcon,
  UserIcon,
  UserMinus01Icon,
  UserRemove01Icon,
  ViewIcon,
  ViewOffIcon,
  WaveIcon,
} from '@hugeicons/core-free-icons'

// Pro solid-rounded variants — opt-in via the `solid` prop, one entry per name in
// SOLID_ICON_MAP below.
import {
  ChampionIcon as ChampionSolidIcon,
  Fire03Icon as Fire03SolidIcon,
  FlashIcon as FlashSolidIcon,
} from '@hugeicons-pro/core-solid-rounded'

import type { ColorToken } from '@/lib/design/tokens'

// Hugeicons constants are arrays of SVG path tuples. The package exports no
// top-level alias for the shape, so infer it from one constant — they all share it.
type IconConstant = typeof Home03Icon

export type IconWeight = 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'black'

type IconProps = {
  /** SF-Symbol-style name (e.g. "house.fill"). Mapped to a Hugeicons constant internally. */
  name: string
  size?: number
  /**
   * Colour as an RN palette token, for screens ported directly from mobile.
   * Most web call sites should leave this unset and colour the icon with a text
   * utility instead (`className="text-muted"`), since the SVG inherits
   * `currentColor` — that keeps hover/dark variants working for free.
   */
  color?: ColorToken
  /** Any CSS colour. Wins over `color`; for branded surfaces with a runtime hex. */
  tint?: string
  /**
   * Stroke thickness. Ladder matches the RN app exactly:
   * light 1.75 → regular/medium 2.0 → semibold 2.25 → bold 2.5 → black 2.8.
   */
  weight?: IconWeight
  /**
   * Opt into the Hugeicons Pro solid-rounded variant. Only names present in
   * SOLID_ICON_MAP respond; everything else falls back to the free outline icon.
   * See the note on SOLID_ICON_MAP — the Pro package is not installed yet, so
   * this is currently a no-op on web.
   */
  solid?: boolean
  className?: string
  /** Decorative by default. Pass a label when the icon is the only content. */
  'aria-label'?: string
}

/**
 * Sparse SF-name → Pro solid-rounded mapping, mirroring SOLID_ICON_MAP in the RN app.
 * Only names listed here respond to the `solid` prop; anything else falls through to
 * the free outline icon, which keeps the migration opt-in per component rather than
 * flipping every glyph at once.
 *
 * @hugeicons-pro/* resolves from Hugeicons' private registry via the root .npmrc,
 * which reads HUGEICONS_NPM_TOKEN from the environment. That variable must also be
 * set in the Vercel project or the build cannot install this package.
 */
const SOLID_ICON_MAP: Record<string, IconConstant> = {
  'bolt.fill': FlashSolidIcon,
  'flame.fill': Fire03SolidIcon,
  'trophy': ChampionSolidIcon,
  'trophy.circle.fill': ChampionSolidIcon,
  'trophy.fill': ChampionSolidIcon,
}

// SF Symbol name → Hugeicons constant, alphabetised. Several SF names collapse onto
// one constant because the free tier has no `.fill` variants, so `archivebox` and
// `archivebox.fill` are the same stroke glyph.
const ICON_MAP: Record<string, IconConstant> = {
  'archivebox': Archive02Icon,
  'archivebox.fill': Archive02Icon,
  'arrow.clockwise': Refresh01Icon,
  'arrow.down': ArrowDown01Icon,
  'arrow.down.circle': DownloadCircle01Icon,
  'arrow.down.circle.fill': CircleArrowDown02Icon,
  'arrow.down.right': ArrowDownRight01Icon,
  'arrow.forward.circle': CircleArrowRight02Icon,
  'arrow.right': ArrowRight01Icon,
  'arrow.right.circle.fill': CircleArrowRight02Icon,
  'arrow.triangle.branch': GitBranchIcon,
  'arrow.triangle.merge': HierarchySquare02Icon,
  'arrow.up': ArrowUp01Icon,
  'arrow.up.arrow.down': ArrowUpDownIcon,
  'arrow.up.arrow.down.circle.fill': CircleArrowDataTransferVerticalIcon,
  'arrow.up.circle.fill': CircleArrowUp02Icon,
  'arrow.up.right': ArrowUpRight01Icon,
  'arrow.uturn.left': ArrowTurnBackwardIcon,
  'arrowtriangle.down.fill': Triangle03Icon,
  'arrowtriangle.up.fill': Triangle02Icon,
  'at.circle.fill': MailAtSign01Icon,
  'bell.fill': Notification01Icon,
  'bell.slash': NotificationOff01Icon,
  'bolt.fill': FlashIcon,
  'bookmark.fill': Bookmark02Icon,
  'bubble.left': BubbleChatIcon,
  'bubble.left.and.bubble.right': BubbleChatIcon,
  'bubble.left.and.bubble.right.fill': BubbleChatIcon,
  'calendar': Calendar03Icon,
  'calendar.badge.checkmark': CalendarCheckIn01Icon,
  'calendar.badge.clock': Calendar02Icon,
  'chart.bar': BarChartIcon,
  'chart.bar.fill': ChartBarLineIcon,
  'chart.bar.xaxis': ChartBarLineIcon,
  'chart.line.uptrend.xyaxis': AnalyticsUpIcon,
  'chart.pie': PieChart01Icon,
  'checklist': CheckListIcon,
  'checkmark': Tick02Icon,
  'checkmark.circle': CheckmarkCircle01Icon,
  'checkmark.circle.fill': CheckmarkCircle01Icon,
  'checkmark.seal.fill': CheckmarkBadge01Icon,
  'chevron.down': ArrowDown01Icon,
  'chevron.left': ArrowLeft01Icon,
  'chevron.left.2': ArrowLeftDoubleIcon,
  'chevron.left.forwardslash.chevron.right': CodeIcon,
  'chevron.right': ArrowRight01Icon,
  'chevron.up': ArrowUp01Icon,
  'circle': CircleIcon,
  'circle.dashed': Loading03Icon,
  'clipboard': ClipboardIcon,
  'clock': Clock01Icon,
  'clock.arrow.circlepath': ClockArrowUpIcon,
  'clock.badge.exclamationmark.fill': ClockAlertIcon,
  'clock.fill': Clock01Icon,
  'crown.fill': CrownIcon,
  'desktopcomputer': ComputerIcon,
  'doc.on.clipboard': ClipboardIcon,
  'doc.on.doc': Copy01Icon,
  'doc.text': File01Icon,
  'doc.text.fill': Note01Icon,
  'dollarsign.circle': DollarCircleIcon,
  'dollarsign.circle.fill': DollarCircleIcon,
  'ellipsis': MoreHorizontalIcon,
  'envelope': Mail01Icon,
  'envelope.fill': Mail01Icon,
  'exclamationmark.circle.fill': AlertCircleIcon,
  'exclamationmark.triangle': Alert02Icon,
  'exclamationmark.triangle.fill': Alert02Icon,
  'eye': ViewIcon,
  'eye.fill': ViewIcon,
  'eye.slash': ViewOffIcon,
  'flame.fill': Fire03Icon,
  'gear': Settings02Icon,
  'gearshape.fill': Settings02Icon,
  /* The 2x3 drag grip. Not an SF Symbol — SF has no grip glyph — so it takes a
     descriptive name, as 'line.3.horizontal' does below. */
  'grip.vertical': GripVerticalIcon,
  'hand.raised.fill': HandHelpingIcon,
  'hand.wave.fill': WaveIcon,
  'house.fill': Home03Icon,
  'info.circle.fill': InformationCircleIcon,
  'keyboard': KeyboardIcon,
  'line.3.horizontal': Menu01Icon,
  'line.3.horizontal.decrease.circle': FilterHorizontalIcon,
  'link': Link01Icon,
  'list.bullet': LeftToRightListBulletIcon,
  'list.bullet.rectangle': ListViewIcon,
  'list.number': LeftToRightListNumberIcon,
  'lock': SquareLock02Icon,
  'lock.fill': SquareLock02Icon,
  'lock.open': SquareUnlock02Icon,
  'lock.open.fill': SquareUnlock02Icon,
  'magnifyingglass': Search01Icon,
  'mappin.and.ellipse': MapPinIcon,
  'medal.fill': Medal01Icon,
  'minus': MinusSignIcon,
  'moon': Moon02Icon,
  // The three pool prediction modes. Deliberately their own names rather
  // than reusing list.bullet / paperplane.fill / square.grid.2x2: those are
  // the super-admin nav, the Banter send button and the BottomNav pools tab,
  // so repointing them to fix the create-pool step would break three
  // unrelated screens.
  'network': HierarchyCircle01Icon,
  'paperclip': Attachment01Icon,
  'paperplane.circle.fill': MailSend01Icon,
  'paperplane.fill': SendingOrderIcon,
  'pencil': PencilEdit02Icon,
  'pencil.line': PencilEdit02Icon,
  'person.2.fill': UserGroup02Icon,
  'person.3': UserGroupIcon,
  'person.3.fill': UserGroupIcon,
  'person.badge.minus': UserMinus01Icon,
  'person.badge.plus': UserAdd01Icon,
  'person.crop.circle': UserCircleIcon,
  'person.crop.circle.badge.minus': UserRemove01Icon,
  'person.crop.circle.badge.plus': UserAdd01Icon,
  'person.crop.circle.badge.xmark': UserBlock01Icon,
  'person.crop.circle.fill': UserCircleIcon,
  'person.fill': UserIcon,
  'plus': PlusSignIcon,
  'plus.circle.fill': PlusSignCircleIcon,
  'plus.forwardslash.minus': PlusMinus01Icon,
  'qrcode': QrCodeIcon,
  'qrcode.viewfinder': QrCodeScanIcon,
  'questionmark.circle.fill': HelpCircleIcon,
  'rectangle.portrait.and.arrow.right': Logout03Icon,
  'rosette': RibbonIcon,
  'slider.horizontal.3': SlidersHorizontalIcon,
  'snowflake': SnowIcon,
  'sparkles': SparklesIcon,
  'sportscourt': FootballIcon,
  'sportscourt.fill': FootballIcon,
  'square.and.arrow.down': Download01Icon,
  'square.and.arrow.up': Share08Icon,
  'square.grid.2x2': Grid02Icon,
  'square.grid.3x3.fill': LayoutGridIcon,
  'stairs': Stairs01Icon,
  'star.circle.fill': StarCircleIcon,
  'star.fill': StarIcon,
  'sun.max': Sun01Icon,
  'tag': Tag01Icon,
  'target': Target01Icon,
  'ticket.fill': Ticket01Icon,
  'trash': Delete02Icon,
  'trash.fill': Delete02Icon,
  'trophy': ChampionIcon,
  'trophy.circle.fill': ChampionIcon,
  'trophy.fill': ChampionIcon,
  'volleyball': FootballIcon,
  'xmark': Cancel01Icon,
  'xmark.circle.fill': CancelCircleIcon,
}

/** Every SF name this renderer understands — useful for tests and tooling. */
export const iconNames = Object.keys(ICON_MAP)

function strokeWidthFor(weight: IconWeight): number {
  switch (weight) {
    case 'black':
      return 2.8
    case 'bold':
      return 2.5
    case 'semibold':
      return 2.25
    case 'light':
      return 1.75
    case 'medium':
    case 'regular':
    default:
      return 2
  }
}

/** camelCase palette token → the `--sp-*` custom property declared in globals.css. */
function cssVarFor(token: ColorToken): string {
  return `var(--sp-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`
}

export function Icon({
  name,
  size = 24,
  color,
  tint,
  weight = 'regular',
  solid = false,
  className,
  'aria-label': ariaLabel,
}: IconProps) {
  // Ternary rather than `&&` so `false` yields undefined and the ?? chain cascades.
  const iconConstant = (solid ? SOLID_ICON_MAP[name] : undefined) ?? ICON_MAP[name] ?? CircleIcon

  if (process.env.NODE_ENV !== 'production' && !ICON_MAP[name] && !SOLID_ICON_MAP[name]) {
    console.warn(`[Icon] No Hugeicons mapping for "${name}" — rendering fallback Circle.`)
  }

  // Unset colour means inherit, so `className="text-muted"` just works.
  const resolvedColor = tint ?? (color ? cssVarFor(color) : undefined)

  // Do NOT pass strokeWidth for solid icons. The Hugeicons wrapper spreads
  // stroke="currentColor" onto every path whenever strokeWidth is defined, which
  // layers an outline over a filled body and visually fattens it. (Carried over from
  // the RN implementation; it will matter here once the Pro package is installed.)
  const isSolid = solid && SOLID_ICON_MAP[name] !== undefined

  return (
    <HugeiconsIcon
      icon={iconConstant}
      size={size}
      strokeWidth={isSolid ? undefined : strokeWidthFor(weight)}
      className={className}
      style={resolvedColor ? { color: resolvedColor } : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable={false}
    />
  )
}
