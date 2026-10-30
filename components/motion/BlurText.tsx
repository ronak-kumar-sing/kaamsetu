// Native port inspired by React Bits BlurText (https://reactbits.dev) — MIT + Commons Clause.
import { StaggerText, type StaggerTextBaseProps } from './_StaggerText';

export interface BlurTextProps extends StaggerTextBaseProps {
  animateBy?: 'words' | 'letters';
}

/** Words or letters fade and rise in with a stagger (blur emulated with opacity + scale). */
export function BlurText({ animateBy = 'words', delay = 120, ...rest }: BlurTextProps) {
  return (
    <StaggerText
      {...rest}
      delay={animateBy === 'letters' ? Math.min(delay, 60) : delay}
      unit={animateBy}
      motion="timing"
      distance={16}
      startScale={0.94}
    />
  );
}
