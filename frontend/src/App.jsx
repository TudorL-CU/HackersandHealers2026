import { useState } from 'react'
import PatientSearch from './components/PatientSearch'
import CopilotView from './components/CopilotView'

const API_BASE = '/api'

export default function App() {
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [copilotData, setCopilotData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient)
    setCopilotData(null)
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patient.id }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Server error: ${res.status}`)
      }

      const data = await res.json()
      setCopilotData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      <header style={{
        background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
        color: 'white',
        padding: '16px 24px',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Continuity Copilot
            </h1>
            <p style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
              Longitudinal patient intelligence for primary care
            </p>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, textAlign: 'right' }}>
            FHIR R4 Connected<br/>
            <span style={{ fontSize: 11 }}>hapi.fhir.org</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        <PatientSearch onSelect={handleSelectPatient} apiBase={API_BASE} />

        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'white',
            borderRadius: 12,
            marginTop: 24,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--blue-600)', marginBottom: 8 }}>
              Analyzing patient record...
            </div>
            <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
              Fetching FHIR data and running clinical analysis pipeline
            </p>
            <div style={{
              margin: '20px auto',
              width: 40,
              height: 40,
              border: '3px solid var(--gray-200)',
              borderTopColor: 'var(--blue-600)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={{
            background: 'var(--red-50)',
            border: '1px solid #fecaca',
            borderRadius: 12,
            padding: '16px 20px',
            marginTop: 24,
            color: 'var(--red-700)',
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {copilotData && !loading && (
          <CopilotView data={copilotData} patient={selectedPatient} />
        )}
      </main>
    </div>
  )
}
