export default function CopilotView({ data, patient }) {
  const { summary, processing_time_seconds } = data

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
          bgColor="var(--blue-50)"
          position="left"
        >
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--gray-700)' }}>
            {summary.story}
          </p>
        </Section>

        {/* What Changed */}
        <Section
          title="What Changed"
          subtitle="Since last visit"
          color="var(--amber-600)"
          bgColor="var(--amber-50)"
          position="right"
        >
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {summary.changes.map((change, i) => (
              <li key={i} style={{
                padding: '8px 0',
                borderBottom: i < summary.changes.length - 1 ? '1px solid var(--gray-100)' : 'none',
                fontSize: 14,
                color: 'var(--gray-700)',
                display: 'flex',
                gap: 8,
              }}>
                <span style={{ color: 'var(--amber-600)', fontWeight: 700, flexShrink: 0 }}>~</span>
                {change}
              </li>
            ))}
          </ul>
        </Section>

        {/* What Needs Attention */}
        <Section
          title="What Needs Attention"
          subtitle="Likely to fall through the cracks"
          color="var(--red-600)"
          bgColor="var(--red-50)"
          position="left"
        >
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {summary.risks.map((risk, i) => (
              <li key={i} style={{
                padding: '8px 0',
                borderBottom: i < summary.risks.length - 1 ? '1px solid var(--gray-100)' : 'none',
                fontSize: 14,
                color: 'var(--gray-700)',
                display: 'flex',
                gap: 8,
              }}>
                <span style={{ color: 'var(--red-600)', fontWeight: 700, flexShrink: 0 }}>!</span>
                {risk}
              </li>
            ))}
          </ul>
        </Section>

        {/* Recommended Actions */}
        <Section
          title="Recommended Next Actions"
          subtitle="Actionable steps for this visit"
          color="var(--green-600)"
          bgColor="var(--green-50)"
          position="right"
        >
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {summary.actions.map((action, i) => (
              <li key={i} style={{
                padding: '8px 0',
                borderBottom: i < summary.actions.length - 1 ? '1px solid var(--gray-100)' : 'none',
                fontSize: 14,
                color: 'var(--gray-700)',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}>
                <input
                  type="checkbox"
                  style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--green-600)' }}
                />
                {action}
              </li>
            ))}
          </ul>
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

function Section({ title, subtitle, color, bgColor, position, children }) {
  const isLeft = position === 'left'
  return (
    <div style={{
      background: 'white',
      padding: '20px 24px',
      borderRight: isLeft ? '1px solid var(--gray-100)' : 'none',
      borderBottom: '1px solid var(--gray-100)',
      minHeight: 200,
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
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 1 }}>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
