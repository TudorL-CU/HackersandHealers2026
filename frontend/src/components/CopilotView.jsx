import { useState } from 'react'
import ChartsSection from './ChartsSection'

export default function CopilotView({ data, patient }) {
  const { summary, processing_time_seconds } = data

  const storyPreview = summary.story.length > 180
    ? summary.story.slice(0, 180).replace(/\s+\S*$/, '') + '...'
    : summary.story

  return (
    <div style={{ marginTop: 24 }}>
      {/* Patient header bar */}
      <div style={{
        background: 'white',
        borderRadius: '12px 12px 0 0',
        padding: '16px 24px',
        borderBottom: '2px solid var(--blue-600)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{summary.patient_name}</h2>
          <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
            {patient.birthDate} | {patient.gender} | ID: {patient.id}
          </span>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--gray-400)' }}>
          Analysis completed in {processing_time_seconds}s
        </div>
      </div>

      {/* Charts — stat pills, lab trends, conditions timeline */}
      <div style={{ padding: '0 24px', borderBottom: '1px solid var(--gray-100)' }}>
        <ChartsSection summary={summary} />
      </div>

      {/* Four-panel grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 0,
      }}>
        {/* Patient Story */}
        <Section
          title="Patient Story"
          subtitle="Who is this patient?"
          color="var(--blue-600)"
          position="left"
          count={null}
        >
          <ExpandableText text={summary.story} preview={storyPreview} />
        </Section>

        {/* What Changed */}
        <Section
          title="What Changed"
          subtitle="Since last visit"
          color="var(--amber-600)"
          position="right"
          count={summary.changes.length}
        >
          <ExpandableList
            items={summary.changes}
            icon="~"
            iconColor="var(--amber-600)"
            previewCount={3}
          />
        </Section>

        {/* What Needs Attention */}
        <Section
          title="What Needs Attention"
          subtitle="Likely to fall through the cracks"
          color="var(--red-600)"
          position="left"
          count={summary.risks.length}
        >
          <RiskList risks={summary.risks} previewCount={3} />
        </Section>

        {/* Recommended Actions */}
        <Section
          title="Recommended Next Actions"
          subtitle="Actionable steps for this visit"
          color="var(--green-600)"
          position="right"
          count={summary.actions.length}
        >
          <ExpandableList
            items={summary.actions}
            icon="checkbox"
            iconColor="var(--green-600)"
            previewCount={3}
          />
        </Section>
      </div>

      {/* Footer */}
      <div style={{
        background: 'var(--gray-50)',
        borderRadius: '0 0 12px 12px',
        padding: '12px 24px',
        fontSize: 12,
        color: 'var(--gray-400)',
        borderTop: '1px solid var(--gray-200)',
      }}>
        AI-generated summary for clinical decision support. Verify all findings against the patient record.
        This tool augments clinical judgement — it does not replace it.
      </div>
    </div>
  )
}

function ExpandableText({ text, preview }) {
  const [expanded, setExpanded] = useState(false)
  const needsExpand = text !== preview

  return (
    <div>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--gray-700)' }}>
        {expanded ? text : preview}
      </p>
      {needsExpand && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 8,
            background: 'none',
            border: 'none',
            color: 'var(--blue-600)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

function ExpandableList({ items, icon, iconColor, previewCount }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, previewCount)
  const hasMore = items.length > previewCount

  return (
    <div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {visible.map((item, i) => (
          <li key={i} style={{
            padding: '8px 0',
            borderBottom: i < visible.length - 1 ? '1px solid var(--gray-100)' : 'none',
            fontSize: 14,
            color: 'var(--gray-700)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            {icon === 'checkbox' ? (
              <input
                type="checkbox"
                style={{ marginTop: 3, flexShrink: 0, accentColor: iconColor }}
              />
            ) : (
              <span style={{ color: iconColor, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{icon}</span>
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 8,
            background: 'none',
            border: 'none',
            color: iconColor,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {expanded ? 'Show less' : `Show ${items.length - previewCount} more`}
        </button>
      )}
    </div>
  )
}

const CONFIDENCE_META = {
  HIGH:   { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'HIGH',   dot: '🔴' },
  MEDIUM: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'MEDIUM', dot: '🟡' },
  LOW:    { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', label: 'LOW',    dot: '⚪' },
}

function RiskCard({ risk }) {
  const [expanded, setExpanded] = useState(false)
  // Handle both new dict format and legacy string format
  if (typeof risk === 'string') {
    return (
      <div style={{ padding: '8px 0', borderBottom: '1px solid #F3F4F6', fontSize: 14, color: '#374151', display: 'flex', gap: 8 }}>
        <span style={{ color: '#DC2626', fontWeight: 700, flexShrink: 0 }}>!</span>
        <span>{risk}</span>
      </div>
    )
  }

  const { issue, confidence = 'MEDIUM', evidence } = risk
  const meta = CONFIDENCE_META[confidence] || CONFIDENCE_META.MEDIUM

  return (
    <div style={{
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.4, flex: 1 }}>
          {meta.dot} {issue}
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: 10, fontWeight: 700,
          color: meta.color,
          background: 'white',
          border: `1px solid ${meta.border}`,
          borderRadius: 20,
          padding: '2px 8px',
          letterSpacing: '0.05em',
        }}>
          {meta.label}
        </span>
      </div>
      {evidence && (
        <>
          <div style={{
            fontSize: 12, color: '#6B7280', marginTop: 6, lineHeight: 1.5,
            display: expanded ? 'block' : '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            <span style={{ fontWeight: 600, color: '#9CA3AF', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evidence: </span>
            {evidence}
          </div>
          {evidence.length > 120 && (
            <button onClick={() => setExpanded(!expanded)} style={{
              marginTop: 3, background: 'none', border: 'none',
              color: meta.color, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', padding: 0,
            }}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function RiskList({ risks, previewCount }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? risks : risks.slice(0, previewCount)
  const hidden = risks.length - previewCount

  return (
    <div>
      {visible.map((risk, i) => <RiskCard key={i} risk={risk} />)}
      {hidden > 0 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          marginTop: 4, background: 'none', border: 'none',
          color: '#DC2626', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', padding: 0,
        }}>
          {expanded ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  )
}

function Section({ title, subtitle, color, position, count, children }) {
  const isLeft = position === 'left'
  return (
    <div style={{
      background: 'white',
      padding: '20px 24px',
      borderRight: isLeft ? '1px solid var(--gray-100)' : 'none',
      borderBottom: '1px solid var(--gray-100)',
      minHeight: 160,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
        paddingBottom: 10,
        borderBottom: `2px solid ${color}`,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
        }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 1 }}>{subtitle}</p>
        </div>
        {count !== null && count !== undefined && (
          <span style={{
            background: color,
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 12,
            padding: '2px 10px',
            minWidth: 24,
            textAlign: 'center',
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
