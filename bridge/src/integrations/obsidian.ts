import fs from 'fs';
import path from 'path';
import { Checkpoint } from '../store.js';

// If configured, checkpoints will be written as markdown to this vault
const OBSIDIAN_VAULT = process.env.PICKUP_OBSIDIAN_VAULT;

/**
 * Persists a checkpoint to Obsidian.
 * This function can be imported and called inside appendCheckpoint, or triggered 
 * via a cron/watcher script in the TypeScript layer.
 */
export async function syncToObsidian(checkpoint: Checkpoint): Promise<void> {
    if (!OBSIDIAN_VAULT) return;

    try {
        const dateStr = checkpoint.timestamp.split('T')[0];
        const dirPath = path.join(OBSIDIAN_VAULT, 'Pickup', dateStr);
        
        if (!fs.existsSync(dirPath)) {
            await fs.promises.mkdir(dirPath, { recursive: true });
        }

        const safeTitle = (checkpoint.window_title || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Untitled';
        const fileName = `${safeTitle} - ${checkpoint.checkpoint_id.slice(0, 8)}.md`;
        const filePath = path.join(dirPath, fileName);

        const markdown = `---
date: ${checkpoint.timestamp}
process: ${checkpoint.process_name}
trigger: ${checkpoint.trigger}
id: ${checkpoint.checkpoint_id}
---

# ${safeTitle}

${checkpoint.brief}

## Context
**File:** ${checkpoint.file_path || 'None'}
**Project:** ${checkpoint.project_dir || 'None'}

### Raw Detail
\`\`\`json
${JSON.stringify(checkpoint.raw_context, null, 2)}
\`\`\`
`;

        await fs.promises.writeFile(filePath, markdown, 'utf-8');
    } catch (e) {
        console.error('Failed to sync checkpoint to Obsidian:', e);
    }
}
