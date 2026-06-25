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
