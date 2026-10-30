// Native port inspired by React Bits SplitText (https://reactbits.dev) — MIT + Commons Clause.
import { StaggerText, type StaggerTextBaseProps } from './_StaggerText';

export type SplitTextProps = StaggerTextBaseProps;

/** Per-character staggered spring entrance. */
export function SplitText({ delay = 35, ...rest }: SplitTextProps) {
  return (
    <StaggerText
      {...rest}
      delay={delay}
      unit="letters"
      motion="spring"
      distance={26}
      startScale={0.8}
    />
  );
}
