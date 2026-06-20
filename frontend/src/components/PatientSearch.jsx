import { useState } from 'react'

export default function PatientSearch({ onSelect, apiBase }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = async (e) => {
    e.preventDefault()
    setSearching(true)
    setSearched(false)

    try {
      const params = new URLSearchParams({ count: '10' })
      const q = query.trim()
      if (q && /^\d+$/.test(q)) {
        params.set('id', q)
      } else if (q) {
        params.set('name', q)
      }
      const res = await fetch(`${apiBase}/patients?${params}`)
      const data = await res.json()
      setResults(data.patients || [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      padding: '20px 24px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or patient ID (or leave blank to browse)..."
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--gray-200)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={searching}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--blue-600)',
            color: 'white',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {searching ? 'Searching...' : 'Search FHIR'}
        </button>
      </form>

      {results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>
            {results.length} patients found — select one to analyze
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--gray-200)',
                  background: 'var(--gray-50)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  fontSize: 14,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--blue-50)'
                  e.currentTarget.style.borderColor = 'var(--blue-600)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--gray-50)'
                  e.currentTarget.style.borderColor = 'var(--gray-200)'
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: 'var(--gray-500)', marginLeft: 12, fontSize: 13 }}>
                    DOB: {p.birthDate} | {p.gender}
                  </span>
                </div>
                <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>
                  ID: {p.id}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && results.length === 0 && (
        <div style={{ marginTop: 16, color: 'var(--gray-500)', fontSize: 14 }}>
          No patients found. Try a different search or browse all.
        </div>
      )}
    </div>
  )
}
