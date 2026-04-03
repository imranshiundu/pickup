import { useState, useEffect } from 'react'
import CheckpointList from './CheckpointList'
import BriefViewer from './BriefViewer'
import type { Checkpoint } from './types'

function App() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    // Fetch from the custom Vite plugin endpoint
    fetch('/api/checkpoints')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCheckpoints(data)
          if (data.length > 0 && !activeId) {
            setActiveId(data[0].checkpoint_id)
          }
        } else {
          console.error("API did not return an array:", data)
        }
      })
      .catch(err => console.error("Failed to fetch checkpoints", err))
  }, [])

  const activeCheckpoint = checkpoints.find(c => c.checkpoint_id === activeId) || null;

  return (
    <>
      <header className="brand-header">
        <h1 className="brand-title">Pickup</h1>
      </header>
      <div className="app-container">
        <aside className="sidebar">
          <CheckpointList 
            checkpoints={checkpoints} 
            activeId={activeId} 
            onSelect={setActiveId} 
          />
        </aside>
        <main className="main-content">
          <BriefViewer checkpoint={activeCheckpoint} />
        </main>
      </div>
    </>
  )
}

export default App
