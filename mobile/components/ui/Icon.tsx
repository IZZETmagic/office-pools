// Cross-platform icon renderer powered by lucide-react-native.
// Call sites use SF Symbol names (e.g. "house.fill") for continuity with the
// rest of the codebase; the map below translates them to Lucide components so
// rendering is identical on iOS and Android.

import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowDownCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowRightCircle,
  ArrowUp,
  ArrowUpCircle,
  ArrowUpDown,
  ArrowUpRight,
  AtSign,
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  BellOff,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleDashed,
  ClipboardList,
  Clock,
  Code,
  Crown,
  Eye,
  FileText,
  Flame,
  GitBranch,
  Grid3x3,
  Hand,
  HelpCircle,
  History,
  Home,
  Info,
  LayoutGrid,
  ListFilter,
  ListOrdered,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Medal,
  Menu,
  MessagesSquare,
  Pencil,
  Plus,
  PlusCircle,
  QrCode,
  Search,
  Send,
  Settings,
  Share,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Star,
  Target,
  Ticket,
  Trash2,
  TrendingUp,
  Trophy,
  Unlock,
  UserCircle2,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  Volleyball,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

import { type ColorToken, useTheme } from '@/theme';

type IconProps = {
  /** SF-Symbol-style name (e.g. "house.fill"). Mapped to a Lucide component internally. */
  name: string;
  size?: number;
  color?: ColorToken;
  /** Overrides `color` with an arbitrary hex (e.g. for branded surfaces). */
  tint?: string;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'black';
};

// Map SF Symbol names to Lucide components. Keep alphabetised for scannability.
const ICON_MAP: Record<string, LucideIcon> = {
  'arrow.down': ArrowDown,
  'arrow.down.circle.fill': ArrowDownCircle,
  'arrow.down.right': ArrowDownRight,
  'arrow.forward.circle': ArrowRightCircle,
  'arrow.right': ArrowRight,
  'arrow.right.circle.fill': ArrowRightCircle,
  'arrow.triangle.branch': GitBranch,
  'arrow.up': ArrowUp,
  'arrow.up.arrow.down': ArrowUpDown,
  'arrow.up.arrow.down.circle.fill': ArrowUpDown,
  'arrow.up.circle.fill': ArrowUpCircle,
  'arrow.up.right': ArrowUpRight,
  'arrowtriangle.down.fill': ChevronDown,
  'arrowtriangle.up.fill': ChevronUp,
  'at.circle.fill': AtSign,
  'bell.fill': Bell,
  'bell.slash': BellOff,
  'bolt.fill': Zap,
  'bubble.left.and.bubble.right': MessagesSquare,
  'bubble.left.and.bubble.right.fill': MessagesSquare,
  'calendar': Calendar,
  'calendar.badge.checkmark': CalendarCheck,
  'calendar.badge.clock': CalendarClock,
  'chart.bar.fill': BarChart3,
  'chart.bar.xaxis': BarChart3,
  'chart.line.uptrend.xyaxis': TrendingUp,
  'checkmark': Check,
  'checkmark.circle': CheckCircle,
  'checkmark.circle.fill': CheckCircle2,
  'checkmark.seal.fill': BadgeCheck,
  'chevron.down': ChevronDown,
  'chevron.left': ChevronLeft,
  'chevron.left.forwardslash.chevron.right': Code,
  'chevron.right': ChevronRight,
  'chevron.up': ChevronUp,
  'circle.dashed': CircleDashed,
  'clock': Clock,
  'clock.arrow.circlepath': History,
  'clock.badge.exclamationmark.fill': AlertCircle,
  'clock.fill': Clock,
  'crown.fill': Crown,
  'doc.on.clipboard': ClipboardList,
  'doc.text.fill': FileText,
  'envelope.fill': Mail,
  'exclamationmark.circle.fill': AlertCircle,
  'exclamationmark.triangle': AlertTriangle,
  'exclamationmark.triangle.fill': AlertTriangle,
  'eye.fill': Eye,
  'flame.fill': Flame,
  'gearshape.fill': Settings,
  'hand.raised.fill': Hand,
  'hand.wave.fill': Hand,
  'house.fill': Home,
  'info.circle.fill': Info,
  'line.3.horizontal': Menu,
  'line.3.horizontal.decrease.circle': ListFilter,
  'list.bullet.rectangle': ListOrdered,
  'list.number': ListOrdered,
  'lock.fill': Lock,
  'lock.open': Unlock,
  'lock.open.fill': Unlock,
  'magnifyingglass': Search,
  'mappin.and.ellipse': MapPin,
  'medal.fill': Medal,
  'paperplane.circle.fill': Send,
  'paperplane.fill': Send,
  'pencil.line': Pencil,
  'person.2.fill': Users,
  'person.3': Users,
  'person.3.fill': Users,
  'person.badge.plus': UserPlus,
  'person.crop.circle.badge.minus': UserMinus,
  'person.crop.circle.badge.plus': UserPlus,
  'person.crop.circle.badge.xmark': UserX,
  'person.crop.circle.fill': UserCircle2,
  'plus': Plus,
  'plus.circle.fill': PlusCircle,
  'plus.forwardslash.minus': Plus,
  'qrcode.viewfinder': QrCode,
  'questionmark.circle.fill': HelpCircle,
  'rectangle.portrait.and.arrow.right': LogOut,
  'rosette': Award,
  'slider.horizontal.3': SlidersHorizontal,
  'snowflake': Snowflake,
  'sparkles': Sparkles,
  'sportscourt': Volleyball,
  'sportscourt.fill': Volleyball,
  'square.and.arrow.up': Share,
  'square.grid.2x2': LayoutGrid,
  'square.grid.3x3.fill': Grid3x3,
  'star.circle.fill': Star,
  'star.fill': Star,
  'target': Target,
  'ticket.fill': Ticket,
  'trash.fill': Trash2,
  'trophy': Trophy,
  'trophy.circle.fill': Trophy,
  'trophy.fill': Trophy,
  'volleyball': Volleyball,
  'xmark': X,
  'xmark.circle.fill': XCircle,
};

function strokeWidthFor(weight: IconProps['weight']): number {
  switch (weight) {
    case 'black':
      return 2.8;
    case 'bold':
      return 2.5;
    case 'semibold':
      return 2.25;
    case 'medium':
    case 'regular':
    default:
      return 2;
  }
}

export function Icon({ name, size = 24, color = 'ink', tint, weight = 'regular' }: IconProps) {
  const theme = useTheme();
  const LucideComponent = ICON_MAP[name] ?? Circle;
  if (!ICON_MAP[name] && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[Icon] No Lucide mapping for "${name}" — rendering fallback Circle.`);
  }
  return (
    <LucideComponent
      size={size}
      color={tint ?? theme.colors[color]}
      strokeWidth={strokeWidthFor(weight)}
    />
  );
}
