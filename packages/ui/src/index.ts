/**
 * @vocaliq/ui — shared component library (DESIGN-SYSTEM.md).
 * Consumers must also load the design-system CSS:
 *   import '@vocaliq/ui/styles.css'  (waveform motif) + the app's token layer.
 */
export { cn, tokens } from './lib/cn';
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from './components/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './components/card';
export { Input, type InputProps } from './components/input';
export { Waveform, type WaveformProps } from './components/waveform';

// ── Component kit v1 (UX-03) ─────────────────────────────────────────────────
export {
  Badge,
  type BadgeProps,
  type BadgeVariant,
  Chip,
  type ChipProps,
} from './components/badge';
export { Skeleton } from './components/skeleton';
export { Kbd } from './components/kbd';
export { Callout, type CalloutVariant } from './components/callout';
export { EmptyState } from './components/empty-state';
export { Progress, CircularProgress } from './components/progress';
export { Separator } from './components/separator';
export { Avatar, type AvatarStatus } from './components/avatar';
export { Tooltip } from './components/tooltip';
export { Popover, PopoverTrigger, PopoverContent, PopoverClose } from './components/popover';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './components/dropdown-menu';
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './components/dialog';
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from './components/alert-dialog';
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './components/sheet';
export { toast, Toaster, type ToastVariant, type ToastOptions } from './components/toast';

// ── Component kit v1 — inputs + nav (UX-03b) ─────────────────────────────────
export { Label } from './components/label';
export { Switch } from './components/switch';
export { Checkbox } from './components/checkbox';
export { RadioGroup, RadioGroupItem } from './components/radio';
export { Textarea, type TextareaProps } from './components/textarea';
export { FormField } from './components/form-field';
export { Slider } from './components/slider';
export {
  SegmentedControl,
  type SegmentedOption,
} from './components/segmented-control';
export {
  Select,
  SelectValue,
  SelectGroup,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from './components/select';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/tabs';
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './components/accordion';
export { Stepper, type Step } from './components/stepper';

// ── Presence + atmosphere (UX-05) ────────────────────────────────────────────
export { AgentAvatar, type AgentAvatarProps } from './components/agent-avatar';
export {
  AmbientBackground,
  type AmbientBackgroundProps,
} from './components/ambient-background';
export { Illustration, type IllustrationName } from './components/illustrations';
