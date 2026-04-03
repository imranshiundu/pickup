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
