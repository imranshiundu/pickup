import { useState, useEffect } from 'react'
import { 
  BarChart, 
  Clock, 
  FileText, 
  Bot, 
  TerminalSquare, 
  Moon, 
  Sun, 
  MessageSquare,
  Github,
  Slack,
  Book,
  CheckCircle2,
  Settings,
  Search,
  Activity
} from 'lucide-react'

// Simple type mock (expand later)
interface ViewProps {
  checkpoints?: any[];
}

// Sub-components for views
const TodayView = () => {
  return (
    <div className="fade-in">
      {/* 4 Stats Cards */}
      <div className="grid-4">
        <div className="card">
          <div className="card-title">
            <Clock size={16} /> Today
          </div>
          <div className="card-value">4h 22m</div>
          <div className="card-subtitle">deep work</div>
        </div>
        
        <div className="card">
          <div className="card-title">
            <Activity size={16} /> Focus Time
          </div>
          <div className="card-value">67%</div>
          <div className="card-subtitle">of day</div>
          <div className="progress-container">
            <div className="progress-bar" style={{ width: '67%' }}></div>
          </div>
        </div>
        
        <div className="card">
          <div className="card-title">
            <FileText size={16} /> Checkpoints
          </div>
          <div className="card-value">14</div>
          <div className="card-subtitle">3 retrieved today</div>
        </div>
        
        <div className="card">
          <div className="card-title">
            <Bot size={16} /> Agents
          </div>
          <div className="card-value">2</div>
          <div className="card-subtitle">live right now</div>
        </div>
      </div>

      <div className="grid-main">
        <div className="column-left">
          {/* Last Checkpoint Container */}
          <div className="card">
            <div className="card-title">
              LAST CHECKPOINT <span style={{ marginLeft: 'auto', fontSize: '0.75rem', textTransform: 'none' }}>2 minutes ago</span>
            </div>
            
            <div className="checkpoint-detail">
              <p className="checkpoint-text">
                You were refactoring auth.ts, isolating the token refresh logic into its own module. You had not yet handled the edge case where refresh fails silently on expired sessions. Your next step was to add a catch block at line 84.
              </p>
              
              <div className="checkpoint-meta">
                <span className="badge">[auth.ts]</span>
                <span className="badge">[pickup/]</span>
                <span className="badge">[branch: fix/auth-refresh]</span>
                <button className="btn-resume">RESUME</button>
              </div>
            </div>
          </div>

          {/* Timeline Container */}
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-title">TIMELINE <span style={{ marginLeft: 'auto', fontSize: '0.75rem', textTransform: 'none' }}>past 8 hours</span></div>
            
            <div className="timeline-track">
              <div className="timeline-hours">
                <span>9am</span>
                <span>10am</span>
                <span>11am</span>
                <span>12pm</span>
                <span>1pm</span>
                <span>2pm</span>
                <span>3pm</span>
                <span>4pm</span>
                <span>5pm</span>
              </div>
              
              <div className="timeline-bar">
                {/* Visual approximation of the ASCII layout */}
                <div className="timeline-segment active" style={{ width: '15%' }}></div>
                <div className="timeline-segment" style={{ width: '10%' }}></div>
                <div className="timeline-segment active" style={{ width: '25%' }}></div>
                <div className="timeline-segment" style={{ width: '5%' }}></div>
                <div className="timeline-segment active" style={{ width: '45%' }}></div>
              </div>
              
              <div className="timeline-markers">
                <div className="timeline-marker" style={{ left: '15%' }}>
                  <div style={{ height: '8px', width: '1px', background: 'var(--text-tertiary)', marginBottom: '4px' }}></div>
                  <span>meeting</span>
                </div>
                <div className="timeline-marker" style={{ left: '45%' }}>
                  <div style={{ height: '8px', width: '1px', background: 'var(--text-tertiary)', marginBottom: '4px' }}></div>
                  <span>lunch</span>
                </div>
                <div className="timeline-marker" style={{ left: '75%' }}>
                  <div style={{ height: '8px', width: '1px', background: 'var(--text-tertiary)', marginBottom: '4px' }}></div>
                  <span>context switch</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="column-right">
          {/* Checkpoints List */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-title">RECENT CHECKPOINTS</div>
            <ul className="list">
              <li className="list-item">
                <div className="list-item-left">
                  <TerminalSquare className="list-icon" size={18} />
                  <div>
                    <div className="list-title">auth.ts refactor</div>
                    <div className="list-subtitle">2m ago • [human]</div>
                  </div>
                </div>
                <div className="list-right">
                  <div className="status-dot-small active"></div>
                </div>
              </li>
              
              <li className="list-item">
                <div className="list-item-left">
                  <Bot className="list-icon" size={18} />
                  <div>
                    <div className="list-title">API rate limiter</div>
                    <div className="list-subtitle">1h ago • [agent]</div>
                  </div>
                </div>
                <div className="list-right">
                  <div className="status-dot-small active"></div>
                </div>
              </li>
              
              <li className="list-item">
                <div className="list-item-left">
                  <TerminalSquare className="list-icon" size={18} />
                  <div>
                    <div className="list-title">README update</div>
                    <div className="list-subtitle">3h ago • [human]</div>
                  </div>
                </div>
                <div className="list-right">
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>retrieved</span>
                </div>
              </li>
              
              <li className="list-item" style={{ opacity: 0.7 }}>
                <div className="list-item-left">
                  <Bot className="list-icon" size={18} />
                  <div>
                    <div className="list-title">Docker compose fix</div>
                    <div className="list-subtitle">6h ago • [agent]</div>
                  </div>
                </div>
                <div className="list-right">
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>retrieved</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Agents List */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-title">AGENTS</div>
            <ul className="list">
              <li className="list-item">
                <div className="list-item-left">
                  <div style={{ background: 'var(--success-bg)', padding: '0.4rem', borderRadius: '8px', color: 'var(--success)' }}>
                    <Bot size={16} />
                  </div>
                  <div>
                    <div className="list-title">Claude Code</div>
                    <div className="list-subtitle">active now • ckpt: 4m ago</div>
                  </div>
                </div>
              </li>
              <li className="list-item">
                <div className="list-item-left">
                  <div style={{ background: 'var(--bg-app)', padding: '0.4rem', borderRadius: '8px', color: 'var(--text-tertiary)' }}>
                    <Bot size={16} />
                  </div>
                  <div>
                    <div className="list-title" style={{ color: 'var(--text-secondary)' }}>OpenClaw</div>
                    <div className="list-subtitle">idle • ckpt: 1h ago</div>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          {/* Connected Channels */}
          <div className="card">
            <div className="card-title">CONNECTED CHANNELS</div>
            <div className="channel-list">
              <div className="channel connected">
                <MessageSquare size={14} className="channel-icon" /> Telegram
              </div>
              <div className="channel connected">
                <Book size={14} className="channel-icon" /> Obsidian
              </div>
              <div className="channel connected">
                <Github size={14} className="channel-icon" /> GitHub
              </div>
              <div className="channel connected">
                <Slack size={14} className="channel-icon" /> Slack
              </div>
              <div className="channel">
                Notion
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const HistoryView = () => (
  <div className="fade-in empty-view">
    <Search />
    <h2>History</h2>
    <p>Searchable list of all checkpoints will appear here.</p>
  </div>
)

const AgentView = () => (
  <div className="fade-in empty-view">
    <Bot />
    <h2>Agent Overview</h2>
    <p>Agent activity and their standalone checkpoints will appear here.</p>
  </div>
)

const SettingsView = () => (
  <div className="fade-in empty-view">
    <Settings />
    <h2>Settings</h2>
    <p>Integrations, models, permissions and guardrails.</p>
  </div>
)

function App() {
  const [activeView, setActiveView] = useState<number>(1)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't switch if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch(e.key) {
        case '1': setActiveView(1); break;
        case '2': setActiveView(2); break;
        case '3': setActiveView(3); break;
        case '4': setActiveView(4); break;
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const renderView = () => {
    switch (activeView) {
      case 1: return <TodayView />
      case 2: return <HistoryView />
      case 3: return <AgentView />
      case 4: return <SettingsView />
      default: return <TodayView />
    }
  }

  return (
    <div className="app-shell">
      {/* Top Header */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-title">PICKUP</div>
          <div className="status-badge">
            <div className="status-dot"></div>
            LIVE
          </div>
          <div className="system-stats">
            <span>CPU 1.2%</span>
            <span>RAM 4MB</span>
          </div>
        </div>

        {/* View Navigation */}
        <div className="nav-tabs">
          <button className={`nav-tab ${activeView === 1 ? 'active' : ''}`} onClick={() => setActiveView(1)}>
            <span className="tab-number">1</span> Today
          </button>
          <button className={`nav-tab ${activeView === 2 ? 'active' : ''}`} onClick={() => setActiveView(2)}>
            <span className="tab-number">2</span> History
          </button>
          <button className={`nav-tab ${activeView === 3 ? 'active' : ''}`} onClick={() => setActiveView(3)}>
            <span className="tab-number">3</span> Agents
          </button>
          <button className={`nav-tab ${activeView === 4 ? 'active' : ''}`} onClick={() => setActiveView(4)}>
            <span className="tab-number">4</span> Settings
          </button>
        </div>

        {/* Actions */}
        <div className="topbar-actions">
          <button className="action-btn" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      {/* Dynamic Content Container */}
      <main className="view-container">
        {renderView()}
      </main>
    </div>
  )
}

export default App
