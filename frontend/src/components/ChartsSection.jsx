import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'

const LAB_PRIORITY = [
  'HbA1c', 'Systolic BP', 'Diastolic BP', 'eGFR',
  'Total Cholesterol', 'LDL', 'HDL', 'Glucose',
  'Weight (kg)', 'BMI', 'Creatinine', 'Urine ACR',
  'TSH', 'Potassium', 'Triglycerides',
]

const LAB_META = {
  'HbA1c':            { color: '#3B82F6', bg: '#EFF6FF', icon: '🩸' },
  'Systolic BP':       { color: '#EF4444', bg: '#FEF2F2', icon: '❤️' },
  'Diastolic BP':      { color: '#F97316', bg: '#FFF7ED', icon: '❤️' },
  'eGFR':             { color: '#8B5CF6', bg: '#F5F3FF', icon: '🫘' },
  'Total Cholesterol': { color: '#F59E0B', bg: '#FFFBEB', icon: '🧪' },
  'LDL':              { color: '#EC4899', bg: '#FDF2F8', icon: '🧪' },
  'HDL':              { color: '#10B981', bg: '#ECFDF5', icon: '🧪' },
  'Glucose':          { color: '#6366F1', bg: '#EEF2FF', icon: '🍬' },
  'Weight (kg)':       { color: '#14B8A6', bg: '#F0FDFA', icon: '⚖️' },
  'BMI':              { color: '#84CC16', bg: '#F7FEE7', icon: '📊' },
  'Creatinine':       { color: '#A855F7', bg: '#FAF5FF', icon: '🫧' },
  'Urine ACR':        { color: '#F43F5E', bg: '#FFF1F2', icon: '🫧' },
  'TSH':              { color: '#0EA5E9', bg: '#F0F9FF', icon: '🦋' },
  'Potassium':        { color: '#D97706', bg: '#FFFBEB', icon: '⚡' },
  'Triglycerides':    { color: '#64748B', bg: '#F8FAFC', icon: '🧪' },
}

const DEFAULT_META = { color: '#6B7280', bg: '#F9FAFB', icon: '📈' }

// ── Custom tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, unit, refLow, refHigh }) {
  if (!active || !payload?.length) return null
  const { value, date } = payload[0].payload
  const inRange = refLow != null && refHigh != null
    ? value >= refLow && value <= refHigh
    : true
  return (
    <div style={{
      background: 'white',
      border: '1px solid #E5E7EB',
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: inRange ? '#111827' : '#EF4444' }}>
        {value} <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF' }}>{unit}</span>
      </div>
      <div style={{ color: '#6B7280', marginTop: 2 }}>{date}</div>
      {refLow != null && (
        <div style={{ color: '#9CA3AF', fontSize: 10, marginTop: 3 }}>
          Ref: {refLow}–{refHigh} {unit}
        </div>
      )}
    </div>
  )
}

// ── Single lab chart widget ────────────────────────────────────────────────
function LabWidget({ label, points }) {
  const meta = LAB_META[label] || DEFAULT_META
  const { color, bg, icon } = meta
  const unit = points[0]?.unit || ''
  const refLow = points[0]?.refLow
  const refHigh = points[0]?.refHigh
  const hasRef = refLow != null && refHigh != null

  const latest = points[points.length - 1]
  const prev   = points.length > 1 ? points[points.length - 2] : null
  const trend  = prev ? latest.value - prev.value : 0
  const isAbnormal = hasRef && (latest.value < refLow || latest.value > refHigh)

  const values = points.map(p => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.3 || 1
  const yMin = hasRef ? Math.min(lo - pad, refLow * 0.88) : lo - pad
  const yMax = hasRef ? Math.max(hi + pad, refHigh * 1.12) : hi + pad

  const data = points.map(p => ({ date: p.date.slice(0, 7), value: p.value }))

  return (
    <div style={{
      background: bg,
      border: `1.5px solid ${color}40`,
      borderTop: `4px solid ${color}`,
      borderRadius: 14,
      padding: '16px 18px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      boxShadow: `0 4px 16px ${color}18`,
      minWidth: 0,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
            {icon} {label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: isAbnormal ? '#EF4444' : '#111827', letterSpacing: '-1px', lineHeight: 1 }}>
              {latest.value}
            </span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{unit}</span>
            {prev && (
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: trend > 0 ? '#EF4444' : trend < 0 ? '#10B981' : '#9CA3AF',
                marginLeft: 2,
              }}>
                {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'} {Math.abs(trend).toFixed(1)}
              </span>
            )}
          </div>
        </div>
        {isAbnormal && (
          <span style={{
            background: '#FEF2F2',
            color: '#EF4444',
            border: '1px solid #FECACA',
            fontSize: 9,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 20,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}>
            Out of range
          </span>
        )}
      </div>

      {/* Chart */}
      {points.length > 1 ? (
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            {hasRef && <ReferenceArea y1={refLow} y2={refHigh} fill={color} fillOpacity={0.08} />}
            {hasRef && <ReferenceLine y={refHigh} stroke={color} strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} />}
            {hasRef && refLow > 0 && <ReferenceLine y={refLow} stroke={color} strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} />}
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis domain={[yMin, yMax]} tick={{ fontSize: 8, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTooltip unit={unit} refLow={refLow} refHigh={refHigh} />} />
            <Line
              type="monotone" dataKey="value"
              stroke={color} strokeWidth={2.5}
              dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: color, strokeWidth: 2, stroke: 'white' }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        // Single data point — show a simple bar gauge
        <div style={{ marginTop: 4 }}>
          {hasRef && (
            <div style={{ position: 'relative', height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'visible', marginBottom: 4 }}>
              <div style={{
                position: 'absolute',
                left: `${Math.max(2, Math.min(96, (latest.value - (refLow * 0.5)) / ((refHigh * 1.5) - (refLow * 0.5)) * 100)).toFixed(1)}%`,
                top: -3, transform: 'translateX(-50%)',
                width: 14, height: 14, borderRadius: '50%',
                background: isAbnormal ? '#EF4444' : color,
                border: '2px solid white',
                boxShadow: `0 0 0 2px ${isAbnormal ? '#EF4444' : color}`,
              }} />
              <div style={{
                height: '100%', borderRadius: 4,
                background: `linear-gradient(to right, #FECACA 0%, #A7F3D0 ${((refLow - refLow * 0.5) / (refHigh * 1.5 - refLow * 0.5) * 100).toFixed(0)}%, #A7F3D0 ${((refHigh - refLow * 0.5) / (refHigh * 1.5 - refLow * 0.5) * 100).toFixed(0)}%, #FECACA 100%)`,
              }} />
            </div>
          )}
          <div style={{ fontSize: 10, color: '#9CA3AF' }}>{points[0].date}</div>
        </div>
      )}

      <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 6 }}>
        {points.length} {points.length === 1 ? 'reading' : 'readings'}
        {hasRef && ` · Target: ${refLow}–${refHigh} ${unit}`}
      </div>
    </div>
  )
}

// ── Conditions timeline widget ─────────────────────────────────────────────
const COND_COLORS = ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16']

function ConditionsWidget({ conditions }) {
  const [showAll, setShowAll] = useState(false)
  if (!conditions?.length) return null

  const sorted = [...conditions].sort((a, b) => a.onset.localeCompare(b.onset))
  const visible = showAll ? sorted : sorted.slice(0, 8)
  const minYear = parseInt(sorted[0].onset)
  const maxYear = new Date().getFullYear()
  const span = maxYear - minYear || 1

  return (
    <div style={{
      background: '#F8FAFF',
      border: '1.5px solid #C7D2FE',
      borderTop: '4px solid #6366F1',
      borderRadius: 14,
      padding: '16px 20px',
      boxShadow: '0 4px 16px #6366F118',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
        📋 Conditions Timeline · {sorted.length} active
      </div>

      {/* Dot timeline */}
      <div style={{ position: 'relative', height: 28, marginBottom: 12 }}>
        <div style={{ position: 'absolute', top: 10, left: 0, right: 0, height: 2, background: '#E0E7FF', borderRadius: 1 }} />
        {visible.map((c, i) => {
          const pct = Math.max(0, Math.min(96, ((parseInt(c.onset) - minYear) / span) * 100))
          return (
            <div key={i} title={`${c.name} — ${c.onset}`} style={{
              position: 'absolute', left: `${pct}%`, top: 4,
              transform: 'translateX(-50%)',
              width: 14, height: 14, borderRadius: '50%',
              background: COND_COLORS[i % COND_COLORS.length],
              border: '2px solid white',
              boxShadow: `0 0 0 2px ${COND_COLORS[i % COND_COLORS.length]}60`,
              zIndex: 1, cursor: 'default',
            }} />
          )
        })}
      </div>

      {/* Year labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        {[minYear, Math.round((minYear + maxYear) / 2), maxYear].map(yr => (
          <span key={yr} style={{ fontSize: 9, color: '#9CA3AF' }}>{yr}</span>
        ))}
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {visible.map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'white',
            border: `1px solid ${COND_COLORS[i % COND_COLORS.length]}40`,
            borderRadius: 20, padding: '4px 10px',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: COND_COLORS[i % COND_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{c.name}</span>
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>{c.onset.slice(0,4)}</span>
          </div>
        ))}
        {sorted.length > 8 && !showAll && (
          <button onClick={() => setShowAll(true)} style={{
            background: 'none', border: '1px dashed #C7D2FE', borderRadius: 20,
            padding: '4px 12px', fontSize: 11, color: '#6366F1', cursor: 'pointer',
          }}>
            +{sorted.length - 8} more
          </button>
        )}
      </div>
    </div>
  )
}

// ── Stat pill ──────────────────────────────────────────────────────────────
function StatWidget({ value, label, color, bg, icon }) {
  return (
    <div style={{
      background: bg,
      border: `1.5px solid ${color}30`,
      borderTop: `4px solid ${color}`,
      borderRadius: 14,
      padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: `0 4px 16px ${color}12`,
      flex: 1, minWidth: 0,
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 30, fontWeight: 800, color, letterSpacing: '-1.5px', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────
export default function ChartsSection({ summary }) {
  const {
    lab_trends = {},
    conditions_timeline = [],
    risks = [],
    actions = [],
    medication_count = 0,
  } = summary

  const displayLabs = LAB_PRIORITY
    .filter(l => lab_trends[l]?.length >= 1)
    .concat(Object.keys(lab_trends).filter(l => !LAB_PRIORITY.includes(l) && lab_trends[l]?.length >= 1))

  const hasLabs      = displayLabs.length > 0
  const hasTimeline  = conditions_timeline.length > 0
  const hasAnything  = hasLabs || hasTimeline

  if (!hasAnything) return null

  return (
    <div style={{ padding: '20px 0 4px' }}>

      {/* Stat widgets row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatWidget value={conditions_timeline.length || '—'} label="Active Conditions" color="#6366F1" bg="#EEF2FF" icon="📋" />
        <StatWidget value={medication_count || '—'}           label="Medications"        color="#0EA5E9" bg="#F0F9FF" icon="💊" />
        <StatWidget value={risks.length}                      label="Risk Flags"          color="#EF4444" bg="#FEF2F2" icon="⚠️" />
        <StatWidget value={actions.length}                    label="Recommended Actions" color="#10B981" bg="#ECFDF5" icon="✅" />
      </div>

      {/* Lab widgets grid */}
      {hasLabs && (
        <>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#374151',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 12,
          }}>
            Lab Trends
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}>
            {displayLabs.map(label => (
              <LabWidget key={label} label={label} points={lab_trends[label]} />
            ))}
          </div>
        </>
      )}

      {/* Conditions timeline widget */}
      {hasTimeline && (
        <>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#374151',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 12,
          }}>
            Conditions Timeline
          </div>
          <ConditionsWidget conditions={conditions_timeline} />
        </>
      )}

    </div>
  )
}
