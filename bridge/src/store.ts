import fs from 'fs';
import os from 'os';
import path from 'path';
import { syncToObsidian } from './integrations/obsidian.js';

// Define the shape of a Checkpoint to mirror Rust and Python exactly.
export interface ContextPacket {
    process_name: string;
    timestamp: string;
    recent_windows: string[];
    file_tail: string | null;
    clipboard: string | null;
    shell_history: string[] | null;
    agent_note: string | null;
}

export interface Checkpoint {
    checkpoint_id: string;
    timestamp: string;
    process_name: string;
    window_title: string;
    file_path: string | null;
    project_dir: string | null;
    brief: string;
    trigger: string;
    tokens_used: number;
    raw_context: ContextPacket;
    agent_authored: boolean;
    brief_invalid?: boolean;
}

// Store path configuration
const STORE_PATH = process.env.PICKUP_STORE || path.join(os.homedir(), '.pickup', 'checkpoints.jsonl');

/**
 * Reads the NDJSON store and returns an array of Checkpoints.
 * Safely ignores empty or malformed lines.
 */
export async function readStore(): Promise<Checkpoint[]> {
    if (!fs.existsSync(STORE_PATH)) {
        return [];
    }

    const content = await fs.promises.readFile(STORE_PATH, 'utf-8');
    const records: Checkpoint[] = [];
    
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        try {
            records.push(JSON.parse(trimmed) as Checkpoint);
        } catch (e) {
            // Ignore malformed JSON lines
        }
    }
    
    return records;
}

/**
 * Returns the single most recent checkpoint matching criteria.
 */
export async function getLast(projectDir?: string, processName?: string): Promise<Checkpoint | null> {
    const all = await readStore();
    if (!all.length) return null;
    
    // Reverse iterating to find the latest
    for (let i = all.length - 1; i >= 0; i--) {
        const record = all[i];
        if (projectDir && record.project_dir !== projectDir) continue;
        if (processName && record.process_name !== processName) continue;
        return record;
    }
    
    return null;
}

/**
 * Returns a specific checkpoint by ID.
 */
export async function getById(id: string): Promise<Checkpoint | null> {
    const all = await readStore();
    return all.find(c => c.checkpoint_id === id) || null;
}

/**
 * Lists the most recent limit records matching criteria.
 */
export async function listRecords(limit: number = 10, projectDir?: string): Promise<Checkpoint[]> {
    const all = await readStore();
    let filtered = all;
    
    if (projectDir) {
        filtered = filtered.filter(c => c.project_dir === projectDir);
    }
    
    // Reverse (newest first) and slice
    filtered.reverse();
    return filtered.slice(0, limit);
}


/**
 * Appends a new checkpoint to the NDJSON store.
 * Primarily used for manual / AI agent checkpoints.
 */
export async function appendCheckpoint(checkpoint: Checkpoint): Promise<void> {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
    }
    
    await fs.promises.appendFile(STORE_PATH, JSON.stringify(checkpoint) + '\n', 'utf-8');
    
    // Sync to integrations (fire and forget)
    syncToObsidian(checkpoint).catch(console.error);
}
