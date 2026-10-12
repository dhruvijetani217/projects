#!/bin/bash
# start.sh - always kills whatever's on port 8000 first, then starts fresh.
# Usage: bash start.sh   (run from inside python_app/)

PORT=8020

echo "Freeing up port $PORT (if anything is using it)..."
fuser -k ${PORT}/tcp 2>/dev/null
pkill -9 -f "uvicorn main:app" 2>/dev/null
sleep 1

echo "Starting VisionAI backend on port $PORT..."
python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT
