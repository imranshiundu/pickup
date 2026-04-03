#!/usr/bin/env bash
# Git hook for Pickup
# This triggers a checkpoint on `git stash` and `git checkout`

PICKUP_CLI="pickup" # Assuming a pickup CLI wrapper, or direct IPC

function trigger_pickup() {
    # Send a manual trigger request to the Pickup daemon
    # Using python brain directly or local nc command to socket
    echo '{"event_type":"leave","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'","window_title":"git hook","process_name":"git","file_path":null,"project_dir":"'$(pwd)'","session_duration_seconds":100,"trigger":"git_hook"}' | nc -U /tmp/pickup.sock || true
}

# Run in background to not block git
trigger_pickup &
