import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Checkpoint } from './types';

interface Props {
  checkpoints: Checkpoint[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

const CheckpointList: React.FC<Props> = ({ checkpoints, activeId, onSelect }) => {
  return (
    <ul className="checkpoint-list">
      {checkpoints.map(cp => {
        const isActive = cp.checkpoint_id === activeId;
        const timeAgo = formatDistanceToNow(new Date(cp.timestamp), { addSuffix: true });
        
        return (
          <li 
            key={cp.checkpoint_id} 
            className={`checkpoint-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(cp.checkpoint_id)}
          >
            <h3 className="c-title">{cp.window_title || 'Unknown Window'}</h3>
            <div className="c-meta">
              <span>{timeAgo}</span>
              <span className={`c-trigger ${cp.trigger}`}>{cp.trigger}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default CheckpointList;
