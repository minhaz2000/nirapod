/** Green / amber / red meal signal. Label text is passed in from messages. */
const STYLES = {
  green: 'bg-green-700',
  amber: 'bg-amber-500 text-black',
  red: 'bg-red-700',
} as const;

export default function SignalBadge({ signal, label }: { signal: keyof typeof STYLES; label: string }) {
  return (
    <span className={`inline-flex min-h-11 items-center rounded-full px-4 font-bold text-white ${STYLES[signal]}`}>
      {label}
    </span>
  );
}
