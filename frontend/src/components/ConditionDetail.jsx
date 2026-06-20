import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'

const STATUS_COLORS = {
  improving: '#10B981',
  stable: '#3B82F6',
  worsening: '#EF4444',
  new_finding: '#F59E0B',
}

const STATUS_LABELS = {
  improving: 'Improving',
  stable: 'Stable',
  worsening: 'Worsening',
  new_finding: 'New Finding',
}

const LAB_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1',
]

export default function ConditionDetail({ conditionName, patientId, pageText, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true)
      setError(null)
      try {
        const body = { condition_name: conditionName }
        if (patientId) body.patient_id = patientId
        else if (pageText) body.page_text = pageText

        const res = await fetch('/api/condition-detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || `Error ${res.status}`)
        }
        setData(await res.json())
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [conditionName, patientId, pageText])

  if (loading) {
    return (
      <div style={panelStyle}>
        <Header conditionName={conditionName} onClose={onClose} />
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #E5E7EB', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#6B7280' }}>Analyzing {conditionName}...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={panelStyle}>
        <Header conditionName={conditionName} onClose={onClose} />
        <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>Error: {error}</div>
      </div>
    )
  }

  const { condition_summary, visit_progression = [], current_status, gaps_in_care = [], related_lab_trends = {}, processing_time_seconds } = data

  return (
    <div style={panelStyle}>
      <Header conditionName={conditionName} onClose={onClose} time={processing_time_seconds} />

      {/* Summary */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: '#374151' }}>{condition_summary}</div>
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#F0F4FF', borderRadius: 8, fontSize: 13, color: '#1E40AF' }}>
          <strong>Current status:</strong> {current_status}
        </div>
      </div>

      {/* Related lab trends */}
      {Object.keys(related_lab_trends).length > 0 && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Related Lab Trends
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {Object.entries(related_lab_trends).map(([label, points], idx) => (
              <MiniChart key={label} label={label} points={points} color={LAB_COLORS[idx % LAB_COLORS.length]} />
            ))}
          </div>
        </div>
      )}

      {/* Visit progression */}
      {visit_progression.length > 0 && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Visit-by-Visit Progression
          </div>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 2, background: '#E5E7EB' }} />
            {visit_progression.map((v, i) => {
              const statusColor = STATUS_COLORS[v.status] || '#6B7280'
              return (
                <div key={i} style={{ position: 'relative', marginBottom: 16, paddingLeft: 16 }}>
                  <div style={{ position: 'absolute', left: -18, top: 4, width: 12, height: 12, borderRadius: '50%', background: statusColor, border: '2px solid white', boxShadow: `0 0 0 2px ${statusColor}40` }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{v.date}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: statusColor, background: `${statusColor}15`, padding: '2px 8px', borderRadius: 10 }}>
                      {STATUS_LABELS[v.status] || v.status}
                    </span>
                  </div>
                  {v.provider && <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>{v.provider}</div>}
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{v.findings}</div>
                  {v.metrics && <div style={{ fontSize: 12, color: '#6366F1', marginTop: 4, fontWeight: 500 }}>{v.metrics}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Care gaps */}
      {gaps_in_care.length > 0 && (
        <div style={{ padding: '14px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Care Gaps
          </div>
          {gaps_in_care.map((gap, i) => (
            <div key={i} style={{ fontSize: 13, color: '#374151', padding: '6px 0', borderBottom: i < gaps_in_care.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', gap: 6 }}>
              <span style={{ color: '#EF4444', fontWeight: 700 }}>!</span>
              {gap}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Header({ conditionName, onClose, time }) {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '2px solid #6366F1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{conditionName}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>Condition timeline {time ? `· ${time}s` : ''}</div>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: '#6B7280' }}>
        Back to overview
      </button>
    </div>
  )
}

function MiniChart({ label, points, color }) {
  const unit = points[0]?.unit || ''
  const refLow = points[0]?.refLow
  const refHigh = points[0]?.refHigh
  const hasRef = refLow != null && refHigh != null
  const latest = points[points.length - 1]
  const values = points.map(p => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.3 || 1
  const data = points.map(p => ({ date: p.date.slice(0, 7), value: p.value }))

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{latest.value} <span style={{ fontSize: 10, color: '#9CA3AF' }}>{unit}</span></div>
      {points.length > 1 && (
        <ResponsiveContainer width="100%" height={50}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
            {hasRef && <ReferenceArea y1={refLow} y2={refHigh} fill={color} fillOpacity={0.08} />}
            <XAxis dataKey="date" tick={false} axisLine={false} />
            <YAxis domain={[lo - pad, hi + pad]} tick={false} axisLine={false} width={0} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

const panelStyle = {
  background: 'white',
  borderRadius: 12,
  marginTop: 16,
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  overflow: 'hidden',
}
