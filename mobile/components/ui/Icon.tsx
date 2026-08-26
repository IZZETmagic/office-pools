// Cross-platform icon renderer powered by @hugeicons/react-native.
// Call sites use SF Symbol names (e.g. "house.fill") for continuity with
// the rest of the codebase; the map below translates them to Hugeicons
// icon constants so rendering is identical on iOS and Android — and
// visually matches the bottom tab bar (which is the only other surface
// using Hugeicons directly).
//
// Hugeicons free tier is stroke-only — there are no `.fill` variants
// like SF Symbols have. The `filled` prop is preserved for API
// compatibility but is a no-op visually; emphasis is still expressed
// via the `weight` prop (which controls stroke width).

import { HugeiconsIcon } from '@hugeicons/react-native';
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
} from '@hugeicons/core-free-icons';

// Pro solid-rounded variants — opt-in via the `solid` prop. Each entry
// here unlocks a single SF name → Pro solid mapping in SOLID_ICON_MAP
// below. Add new ones as components migrate.
import {
  ChampionIcon as ChampionSolidIcon,
  Fire03Icon as Fire03SolidIcon,
  FlashIcon as FlashSolidIcon,
} from '@hugeicons-pro/core-solid-rounded';

import { type ColorToken, useTheme } from '@/theme';

// Hugeicons icon constants are arrays of SVG path tuples. The free
// package doesn't export a top-level alias for this shape so we infer
// it from any one icon constant; every icon shares the same structure.
type IconConstant = typeof Home03Icon;

type IconProps = {
  /** SF-Symbol-style name (e.g. "house.fill"). Mapped to a Hugeicons constant internally. */
  name: string;
  size?: number;
  color?: ColorToken;
  /** Overrides `color` with an arbitrary hex (e.g. for branded surfaces). */
  tint?: string;
  /**
   * Stroke thickness for outline icons. No visual effect on `solid`
   * icons since they use `fill` not `stroke`. Ladder: light 1.75 →
   * regular/medium 2.0 → semibold 2.25 → bold 2.5 → black 2.8.
   */
  weight?: 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'black';
  /**
   * Preserved for API compatibility with the previous Lucide-based
   * renderer. Hugeicons free tier is stroke-only so this is a visual
   * no-op today; for solid variants use `solid` below.
   */
  filled?: boolean;
  /**
   * Opt into the Hugeicons Pro solid-rounded variant. Only works for
   * names that have a mapping in SOLID_ICON_MAP — anything else falls
   * back to the free outline icon silently. Intentionally opt-in so we
   * can migrate component-by-component rather than flip every glyph in
   * the app at once.
   */
  solid?: boolean;
};

// Sparse SF-name → Pro solid-rounded mapping. Only entries here respect
// the `solid` prop; other names fall through to ICON_MAP regardless.
const SOLID_ICON_MAP: Record<string, IconConstant> = {
  'bolt.fill': FlashSolidIcon,
  'flame.fill': Fire03SolidIcon,
  'trophy': ChampionSolidIcon,
  'trophy.circle.fill': ChampionSolidIcon,
  'trophy.fill': ChampionSolidIcon,
};

// Map SF Symbol names to Hugeicons constants. Keep alphabetised for
// scannability. Multiple SF names can resolve to the same Hugeicons
// constant — Hugeicons free tier doesn't have `.fill` variants, so
// `archivebox` and `archivebox.fill` collapse to the same stroke icon.
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
  // The three pool prediction modes — see the web Icon for why these are
  // their own names rather than reusing list.bullet / paperplane.fill /
  // square.grid.2x2. Mapped here to keep the two maps in step; the RN app
  // does not render the create-pool step yet.
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
};

function strokeWidthFor(weight: IconProps['weight']): number {
  switch (weight) {
    case 'black':
      return 2.8;
    case 'bold':
      return 2.5;
    case 'semibold':
      return 2.25;
    case 'light':
      return 1.75;
    case 'medium':
    case 'regular':
    default:
      return 2;
  }
}

export function Icon({
  name,
  size = 24,
  color = 'ink',
  tint,
  weight = 'regular',
  filled: _filled = false,
  solid = false,
}: IconProps) {
  const theme = useTheme();
  // Solid mapping wins when the caller opted in AND a mapping exists.
  // Ternary (not &&) so `false` becomes `undefined` and the `??` chain
  // correctly cascades to ICON_MAP.
  const iconConstant =
    (solid ? SOLID_ICON_MAP[name] : undefined) ?? ICON_MAP[name] ?? CircleIcon;
  if (!ICON_MAP[name] && !SOLID_ICON_MAP[name] && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[Icon] No Hugeicons mapping for "${name}" — rendering fallback Circle.`);
  }
  const tintColor = tint ?? theme.colors[color];
  // Critical: when rendering a solid icon, DO NOT pass strokeWidth.
  // The @hugeicons/react-native wrapper, whenever it sees a non-undefined
  // strokeWidth, also spreads `stroke="currentColor"` onto every path
  // (see the wrapper's source — it builds a single `O` object containing
  // BOTH strokeWidth and stroke, then merges it into each path's props).
  // That means solid icons (which use `fill="currentColor"`) get an
  // additional outline stroke layered on top of their filled body,
  // visually fattening them. Omitting strokeWidth for solid icons keeps
  // the wrapper's stroke-injection branch disabled.
  const isSolid = solid && SOLID_ICON_MAP[name] !== undefined;
  return (
    <HugeiconsIcon
      icon={iconConstant}
      size={size}
      color={tintColor}
      strokeWidth={isSolid ? undefined : strokeWidthFor(weight)}
    />
  );
}
