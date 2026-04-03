import React, { useState } from 'react';
import type { Checkpoint } from './types';

interface Props {
  checkpoint: Checkpoint | null;
}

const BriefViewer: React.FC<Props> = ({ checkpoint }) => {
  const [showRaw, setShowRaw] = useState(false);

  if (!checkpoint) {
    return (
      <div className="empty-state">
        <p>Select a checkpoint from the timeline to view its brief.</p>
      </div>
    );
  }

  const paragraphs = (checkpoint.brief || '').split(/(?<=\.)\s+/).filter(Boolean);

  return (
    <div className="viewer-card">
      <div className="v-header">
        <h2 className="v-title">{checkpoint.window_title || 'Untitled Session'}</h2>
        {checkpoint.file_path && (
          <div className="v-path">{checkpoint.file_path}</div>
        )}
      </div>

      <div className="v-brief">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="v-meta-grid">
        <div className="meta-item">
          <label>Process</label>
          <span>{checkpoint.process_name}</span>
        </div>
        <div className="meta-item">
          <label>Time</label>
          <span>{new Date(checkpoint.timestamp).toLocaleString()}</span>
        </div>
        <div className="meta-item">
          <label>Tokens Used</label>
          <span>{checkpoint.tokens_used}</span>
        </div>
        {checkpoint.agent_authored && (
          <div className="meta-item">
            <label>Author</label>
            <span style={{color: '#34d399'}}>AI Agent</span>
          </div>
        )}
      </div>

      <button className="raw-toggle" onClick={() => setShowRaw(!showRaw)}>
        {showRaw ? 'Hide Context' : 'View Context Packet'}
      </button>

      {showRaw && (
        <pre className="raw-context">
          {JSON.stringify(checkpoint.raw_context, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default BriefViewer;
