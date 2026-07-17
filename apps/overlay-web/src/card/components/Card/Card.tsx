import { useMemo, type CSSProperties } from 'react'
import type {
  CardData,
  CardStat,
  PctBox,
  ThemeDefinition,
} from '../../types/card'
import { getTheme } from '../../themes/registry'
import { usePunchedFrame } from '../../hooks/usePunchedFrame'
import { AvatarMedia } from './AvatarMedia'
import { FitText } from './FitText'
import { HoloAura } from './HoloAura'
import { HoloChrome } from './HoloChrome'
import { HoloDetails } from './HoloDetails'
import './Card.css'

export interface CardProps {
  data: CardData
  className?: string
  interactive?: boolean
}

function mergeBox(base: PctBox, override?: Partial<PctBox>): PctBox {
  return { ...base, ...override }
}

function boxStyle(box: PctBox): CSSProperties {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
    transform: 'translate(-50%, -50%)',
  }
}

function resolveTheme(data: CardData): ThemeDefinition {
  const base = getTheme(data.theme)
  if (!data.colors && !data.positions) return base

  return {
    ...base,
    colors: { ...base.colors, ...data.colors },
    portrait: {
      ...base.portrait,
      box: mergeBox(base.portrait.box, data.positions?.portrait),
    },
    name: {
      ...base.name,
      box: mergeBox(base.name.box, data.positions?.name),
    },
    badge: base.badge
      ? { ...base.badge, box: mergeBox(base.badge.box, data.positions?.badge) }
      : undefined,
    plaque: base.plaque
      ? {
          ...base.plaque,
          box: mergeBox(base.plaque.box, data.positions?.plaque),
        }
      : undefined,
    stats: {
      ...base.stats,
      box: base.stats.box
        ? mergeBox(base.stats.box, data.positions?.stats)
        : data.positions?.stats
          ? mergeBox({ x: 50, y: 90, w: 80, h: 14 }, data.positions.stats)
          : undefined,
      items: { ...base.stats.items, ...data.positions?.statItems },
    },
  }
}

export function Card({ data, className = '', interactive = false }: CardProps) {
  const theme = useMemo(() => resolveTheme(data), [data])
  const badgeText = data.badge ?? theme.badge?.defaultText ?? theme.label
  const stats = data.stats ?? []
  const visible = data.visible !== false

  const cssVars = {
    '--card-width': theme.width,
    '--card-aspect': theme.aspectRatio,
    '--color-name': theme.colors.name,
    '--color-name-shadow': theme.colors.nameShadow ?? 'none',
    '--color-label': theme.colors.label,
    '--color-value': theme.colors.value,
    '--color-badge': theme.colors.badge,
    '--color-plaque': theme.colors.plaque ?? theme.colors.name,
    '--color-plaque-sub': theme.colors.plaqueSub ?? theme.colors.label,
    '--font-name': theme.fonts.name,
    '--font-label': theme.fonts.label,
    '--font-value': theme.fonts.value,
    '--font-badge': theme.fonts.badge ?? theme.fonts.label,
    '--font-plaque': theme.fonts.plaque ?? theme.fonts.name,
    '--card-glow': theme.glow ?? 'none',
    '--portrait-radius': theme.portrait.borderRadius ?? '0',
    opacity: visible ? 1 : 0,
  } as CSSProperties

  return (
    <article
      className={`card card--${theme.layout} card--${theme.id} ${className}`.trim()}
      style={cssVars}
      aria-label={`${data.name} ${theme.label} player card`}
      data-theme={theme.id}
    >
      <div
        className={`card__tilt${interactive && theme.effects.tilt ? ' card__tilt--live' : ''}`}
      >
        {theme.effects.aura && <HoloAura />}
        {theme.layout === 'panel' ? (
          <PanelLayout data={data} theme={theme} />
        ) : (
          <FramedLayout
            data={data}
            theme={theme}
            badgeText={badgeText}
            stats={stats}
          />
        )}
      </div>
    </article>
  )
}

function NamePlate({
  data,
  theme,
}: {
  data: CardData
  theme: ThemeDefinition
}) {
  const isHolo = theme.id === 'holo'
  const isGold = theme.id === 'gold'

  return (
    <div
      className={`card__name-plate${isHolo ? ' card__name-plate--holo' : ''}${isGold ? ' card__name-plate--gold' : ''}`}
      style={boxStyle(theme.name.box)}
    >
      <FitText
        text={data.name}
        className={`card__name${isHolo ? ' card__name--holo' : ''}${isGold ? ' card__name--gold' : ''}`}
        maxCqi={theme.name.baseFontSizeCqi}
        minPx={theme.name.minFontSizePx}
        style={{
          fontFamily: theme.fonts.name,
          fontWeight: theme.name.fontWeight,
          letterSpacing: theme.name.letterSpacing,
          textTransform: (theme.name.textTransform ??
            undefined) as CSSProperties['textTransform'],
          color: isHolo ? undefined : theme.colors.name,
          textShadow: isHolo ? undefined : theme.colors.nameShadow,
        }}
      />
    </div>
  )
}

function FramedLayout({
  data,
  theme,
  badgeText,
  stats,
}: {
  data: CardData
  theme: ThemeDefinition
  badgeText: string
  stats: CardStat[]
}) {
  const isHolo = theme.layout === 'holo'
  const frameSrc = usePunchedFrame(theme.assets.frame, isHolo)

  const portraitStyle: CSSProperties =
    theme.portrait.shape === 'clip'
      ? {
          inset: 0,
          width: '100%',
          height: '100%',
          left: 0,
          top: 0,
          transform: 'none',
        }
      : boxStyle(theme.portrait.box)

  return (
    <div className='card__frame-wrap'>
      <div
        className={`card__portrait-slot card__portrait-slot--${theme.portrait.shape}`}
        style={portraitStyle}
      >
        <AvatarMedia
          src={data.avatar}
          fit={data.avatarFit}
          position={data.avatarPosition}
          emptyBackground={theme.portrait.emptyBackground}
          scale={theme.portrait.scale}
          alt=''
        />
        {theme.portrait.shine && (
          <div className='card__portrait-shine' aria-hidden />
        )}
        {theme.portrait.vignette && (
          <div className='card__portrait-vignette' aria-hidden />
        )}
        {theme.portrait.rim && (
          <div className='card__portrait-rim' aria-hidden />
        )}
        {isHolo && <div className='card__portrait-depth' aria-hidden />}
      </div>

      {frameSrc && (
        <img
          className='card__frame'
          src={frameSrc}
          alt=''
          draggable={false}
          decoding='async'
        />
      )}

      {isHolo && (
        <>
          <div className='card__frame-edge-soften' aria-hidden />
          <HoloDetails />
        </>
      )}

      {!isHolo && theme.effects.foil && (
        <div className='card__foil' aria-hidden>
          <span className='card__foil-shine' />
        </div>
      )}

      <div className='card__art'>
        {theme.plaque && (
          <div className='card__plaque' style={boxStyle(theme.plaque.box)}>
            <p className='card__plaque-title'>{theme.plaque.title}</p>
            <p className='card__plaque-sub'>{theme.plaque.subtitle}</p>
          </div>
        )}

        {theme.badge && theme.id === 'basic' && (
          <span className='card__badge' style={boxStyle(theme.badge.box)}>
            {badgeText}
          </span>
        )}

        {isHolo && <HoloChrome badge={badgeText || 'HOLO'} />}

        <NamePlate data={data} theme={theme} />
        <StatsLayer theme={theme} stats={stats} />
      </div>

      {theme.effects.shimmer && !isHolo && (
        <div className='card__shimmer' aria-hidden />
      )}
    </div>
  )
}

function StatsLayer({
  theme,
  stats,
}: {
  theme: ThemeDefinition
  stats: CardStat[]
}) {
  if (!stats.length || theme.stats.layout === 'none') return null

  if (theme.stats.layout === 'absolute') {
    return (
      <dl className='card__stats card__stats--absolute'>
        {stats.map((stat, i) => {
          const keys = Object.keys(theme.stats.items ?? {})
          const pos = theme.stats.items?.[stat.id] ??
            (keys[i] ? theme.stats.items![keys[i]] : undefined) ?? {
              x: 20 + i * 20,
              y: 89,
            }
          return (
            <div key={stat.id} className='card__stat card__stat--absolute'>
              <dd
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  fontSize: `${theme.stats.valueSizeCqi ?? 6}cqi`,
                }}
              >
                {stat.value}
              </dd>
            </div>
          )
        })}
      </dl>
    )
  }

  const box = theme.stats.box ?? { x: 50, y: 88, w: 80, h: 14 }
  const cols = theme.stats.columns ?? Math.min(stats.length, 4)
  const isHolo = theme.stats.layout === 'holo'

  return (
    <dl
      className={`card__stats card__stats--${theme.stats.layout}`}
      style={{
        ...boxStyle(box),
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
    >
      {stats.map((stat, i) => (
        <div
          key={stat.id}
          className={`card__stat${isHolo ? ` card__stat--holo-${i % 4}` : ''}`}
        >
          {theme.stats.showLabels && (
            <dt
              className={isHolo ? 'card__stat-label--holo' : undefined}
              style={{ fontSize: `${theme.stats.labelSizeCqi ?? 2}cqi` }}
            >
              {stat.label}
            </dt>
          )}
          <dd
            className={isHolo ? 'card__stat-value--holo' : undefined}
            style={{ fontSize: `${theme.stats.valueSizeCqi ?? 5}cqi` }}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function PanelLayout({
  data,
  theme,
}: {
  data: CardData
  theme: ThemeDefinition
}) {
  return (
    <div className='card__panel-shell'>
      {theme.effects.corners && (
        <>
          <div className='card__corner card__corner--tl' aria-hidden />
          <div className='card__corner card__corner--tr' aria-hidden />
          <div className='card__corner card__corner--bl' aria-hidden />
          <div className='card__corner card__corner--br' aria-hidden />
        </>
      )}

      <div className='card__panel-content'>
        <div className='card__panel-avatar'>
          <AvatarMedia
            src={theme.assets.logo}
            fit={data.avatarFit ?? 'contain'}
            position={data.avatarPosition}
            emptyBackground={theme.portrait.emptyBackground}
            alt=''
          />
        </div>

        <div className='card__panel-name'>
          <div className='card__divider' aria-hidden />
          <FitText
            text={data.name}
            className='card__name card__name--panel'
            maxCqi={theme.name.baseFontSizeCqi}
            minPx={theme.name.minFontSizePx}
            style={{
              fontFamily: theme.fonts.name,
              fontWeight: theme.name.fontWeight,
              color: theme.colors.name,
            }}
          />
        </div>

        {theme.footer && (
          <div className='card__panel-footer'>
            <div className='card__panel-brand'>
              <p className='card__panel-brand-title engraved'>
                {theme.footer.title}
              </p>
              <div className='card__panel-brand-subwrap'>
                <div className='card__divider' aria-hidden />
                <p className='card__panel-brand-sub engraved'>
                  {theme.footer.subtitle}
                </p>
              </div>
            </div>
            <p className='card__panel-tagline'>
              {data.subtitle ?? theme.footer.tagline}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Card
