#!/usr/bin/env bash
set -e

echo "Installing Pickup..."

# Build Rust Daemon
echo "Building Rust Daemon..."
cd core
cargo build --release
sudo cp target/release/pickup-core /usr/local/bin/pickup-core
cd ..

# Build Bridge
echo "Building Typescript Bridge..."
cd bridge
npm install
npm run build
cd ..

# Set up Python Brain
echo "Setting up Python Brain..."
cd brain
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cd ..

# Setup Integrations
echo "Setting up Git Hooks..."
mkdir -p ~/.pickup
cp scripts/git-hook.sh ~/.pickup/git-hook.sh
chmod +x ~/.pickup/git-hook.sh

echo "Done! Run target/release/pickup-core to start daemon, and python3 brain/main.py to start brain. Ensure you have ANTHROPIC_API_KEY exported."
