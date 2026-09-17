
interface BravonLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  subtitleText?: string;
  className?: string;
}

export function BravonLogo({
  size = 'md',
  showSubtitle = true,
  subtitleText = 'PRINT',
  className = '',
}: BravonLogoProps) {
  const fontSizes = {
    sm: { dot: '1rem', slash: '1rem', text: '1.1rem', sub: '0.65rem' },
    md: { dot: '1.3rem', slash: '1.35rem', text: '1.35rem', sub: '0.7rem' },
    lg: { dot: '1.7rem', slash: '1.8rem', text: '1.8rem', sub: '0.8rem' },
  };

  const current = fontSizes[size];

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          lineHeight: 1,
          fontWeight: 900,
          letterSpacing: '0.02em',
        }}
      >
        {/* Lavender Dot */}
        <span
          style={{
            color: '#c084fc',
            fontSize: current.dot,
            lineHeight: 1,
            marginRight: '2px',
            textShadow: '0 0 12px rgba(192, 132, 252, 0.6)',
          }}
        >
          ●
        </span>

        {/* Forward Slash */}
        <span
          style={{
            color: '#c084fc',
            fontSize: current.slash,
            fontWeight: 800,
            fontStyle: 'normal',
            marginRight: '3px',
            transform: 'scaleX(1.1)',
            display: 'inline-block',
          }}
        >
          /
        </span>

        {/* BRAVON Text */}
        <span
          style={{
            color: 'var(--color-text-primary, #0f172a)',
            fontSize: current.text,
            fontWeight: 900,
            letterSpacing: '0.06em',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          BRAVON
        </span>
      </div>

      {showSubtitle && (
        <span
          style={{
            fontSize: current.sub,
            fontWeight: 700,
            color: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            padding: '1px 6px',
            borderRadius: '4px',
            letterSpacing: '0.08em',
            marginLeft: '4px',
          }}
        >
          {subtitleText}
        </span>
      )}
    </div>
  );
}
