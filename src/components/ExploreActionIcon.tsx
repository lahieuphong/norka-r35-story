export type ExploreActionIconName = 'close' | 'enter' | 'open' | 'quit' | 'pending';

type StrokeIconName = Exclude<ExploreActionIconName, 'pending'>;

const STROKE_PATHS: Record<StrokeIconName, readonly string[]> = {
  close: ['M6 6l8 8', 'M14 6l-8 8'],
  enter: ['M3.75 10h12.5', 'M12 5.75L16.25 10 12 14.25'],
  open: ['M5.25 14.75l9.5-9.5', 'M8.25 5.25h6.5v6.5'],
  quit: ['M14.75 5.25l-9.5 9.5', 'M11.75 14.75h-6.5v-6.5'],
};

interface Props {
  readonly name: ExploreActionIconName;
}

/**
 * The single vector source for every action icon in the Explore overlay.
 * Keeping one viewBox and stroke system prevents OS symbol-font fallback from
 * changing icon weight, alignment, or arrow geometry between devices.
 */
export function ExploreActionIcon({ name }: Props) {
  return (
    <svg
      className="explore-overlay__action-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-explore-action-icon={name}
      data-icon-source="norka-explore-actions"
    >
      {name === 'pending' ? (
        <g fill="currentColor" stroke="none">
          <circle cx="5" cy="10" r="1.05" />
          <circle cx="10" cy="10" r="1.05" />
          <circle cx="15" cy="10" r="1.05" />
        </g>
      ) : STROKE_PATHS[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}
