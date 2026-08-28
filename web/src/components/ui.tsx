import type { CSSProperties, ReactNode } from 'react';

/** Un écran plein : défilement interne, marges d'encoche et place pour la barre d'onglets. */
export function Screen({
  children, pad = true, tabs = true, style,
}: { children: ReactNode; pad?: boolean; tabs?: boolean; style?: CSSProperties }) {
  return (
    <div
      className="scroll"
      style={{
        height: '100%',
        // Sur tablette et ordinateur, la colonne reste large comme la barre
        // d'onglets plutôt que de s'étirer sur tout l'écran.
        maxWidth: 560,
        marginInline: 'auto',
        paddingTop: `calc(var(--safe-top) + var(--banner-h) + 14px)`,
        paddingLeft: pad ? 20 : 0,
        paddingRight: pad ? 20 : 0,
        paddingBottom: tabs ? `calc(var(--safe-bottom) + 122px)` : `calc(var(--safe-bottom) + 28px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <h1 style={{ font: '700 30px/1.1 var(--sans)', letterSpacing: '-.02em', margin: 0 }}>{children}</h1>
      {sub && <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--fg-2)', marginTop: 7 }}>{sub}</div>}
    </>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 11, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase',
        color: 'rgba(235,235,245,.4)', ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 22, overflow: 'hidden', ...style }}>{children}</div>
  );
}

/** Une ligne de réglage/valeur, avec chevron si elle mène quelque part. */
export function Row({
  label, value, onClick, chevron, tone, last, children,
}: {
  label: ReactNode; value?: ReactNode; onClick?: () => void; chevron?: boolean;
  tone?: string; last?: boolean; children?: ReactNode;
}) {
  const inner = (
    <>
      {tone && <span style={{ width: 10, height: 10, borderRadius: 3, background: tone, flex: 'none' }} />}
      <span style={{ flex: 1, textAlign: 'left', fontSize: 16.5 }}>{label}</span>
      {value !== undefined && (
        <span style={{ fontSize: 15, color: 'var(--fg-3)', textAlign: 'right' }}>{value}</span>
      )}
      {children}
      {chevron && <span style={{ color: 'var(--fg-4)', fontSize: 17 }}>›</span>}
    </>
  );
  const style: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '15px 17px', borderBottom: last ? 'none' : '1px solid var(--line)',
    background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left',
  };
  return onClick
    ? <button type="button" onClick={onClick} style={style}>{inner}</button>
    : <div style={style}>{inner}</div>;
}

export function Button({
  children, onClick, variant = 'plain', style, type = 'button', disabled,
}: {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean;
  variant?: 'primary' | 'plain' | 'ghost' | 'danger'; style?: CSSProperties;
}) {
  const variants: Record<string, CSSProperties> = {
    primary: { background: 'var(--accent)', color: 'var(--on-accent)' },
    plain: { background: 'var(--card)', color: 'var(--fg)' },
    ghost: { background: 'rgba(255,255,255,.1)', color: 'var(--fg)' },
    danger: { background: 'rgba(255,69,58,.16)', color: 'var(--red)' },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 'none', borderRadius: 999, padding: 16, width: '100%',
        font: '600 16px/1 var(--sans)', opacity: disabled ? .5 : 1,
        ...variants[variant], ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Puce de filtre : active en orange, inactive en gris. */
export function Chip({
  label, active, onClick, tone,
}: { label: ReactNode; active?: boolean; onClick?: () => void; tone?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 'none', padding: '10px 15px', borderRadius: 999, border: 'none',
        font: '600 13.5px/1 var(--sans)', whiteSpace: 'nowrap',
        background: active ? (tone ?? 'var(--accent)') : 'rgba(255,255,255,.1)',
        color: active ? 'var(--on-accent)' : 'var(--fg)',
      }}
    >
      {label}
    </button>
  );
}

export function Pill({ children, color, tint }: { children: ReactNode; color: string; tint: string }) {
  return (
    <span
      style={{
        padding: '7px 11px', borderRadius: 999, font: '600 12.5px/1.25 var(--sans)',
        background: tint, color, textAlign: 'center', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Vignette produit : la photo si on l'a, les initiales sinon. */
export function Thumb({ name, src, size = 52 }: { name: string; src?: string | null; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size * .25, flex: 'none', position: 'relative',
        overflow: 'hidden', background: 'repeating-linear-gradient(135deg,#2C2C2E 0 5px,#242426 5px 10px)',
      }}
    >
      {src
        ? <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (
          <span
            className="mono"
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: size * .21, fontWeight: 500, color: 'var(--fg-3)',
            }}
          >
            {name.trim().slice(0, 2).toUpperCase()}
          </span>
        )}
    </div>
  );
}

export function BackHeader({ children, onBack, right }: { children?: ReactNode; onBack: () => void; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Retour"
        style={{
          width: 38, height: 38, borderRadius: '50%', background: 'var(--card)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flex: 'none',
        }}
      >
        ‹
      </button>
      <span style={{ flex: 1, fontSize: 16, color: 'var(--fg-2)' }}>{children}</span>
      {right}
    </div>
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,.18)', borderTopColor: 'var(--accent)',
        animation: 'spin .8s linear infinite',
      }}
    />
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', background: 'var(--card)', borderRadius: 22 }}>
      <div
        style={{
          width: 40, height: 40, margin: '0 auto 16px', borderRadius: 12,
          border: '2px dashed rgba(235,235,245,.3)',
        }}
      />
      <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
      {hint && <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--fg-2)', marginTop: 6 }}>{hint}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}
