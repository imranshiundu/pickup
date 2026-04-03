# Pickup ZSH Plugin
# Prompts a checkpoint when cd-ing into a new project directory

pickup_chpwd_hook() {
    # If the new directory contains a .git, it's a project
    if [[ -d "${PWD}/.git" ]]; then
        # Check if we actually switched projects (parent dirs don't match)
        if [[ "${PWD}" != "${PICKUP_LAST_PROJ}" ]]; then
            export PICKUP_LAST_PROJ="${PWD}"
            # Trigger leave event
            (echo '{"event_type":"leave","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'","window_title":"cd hook","process_name":"zsh","file_path":null,"project_dir":"'${PWD}'","session_duration_seconds":30,"trigger":"manual"}' | nc -U /tmp/pickup.sock 2>/dev/null &)
        fi
    fi
}

# Add to zsh chpwd hooks
autoload -U add-zsh-hook
add-zsh-hook chpwd pickup_chpwd_hook
