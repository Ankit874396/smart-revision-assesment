#!/usr/bin/env python3
"""
Smart Revision Assistant - Agentic AI Runner
Starts both the AI backend and frontend servers
"""

import subprocess
import sys
import os
import time
from pathlib import Path

def main():
    # Check if we're in the right directory
    if not Path("main.py").exists():
        print("❌ Please run this script from the smart-revision-assistant directory")
        sys.exit(1)

    # Check if .env exists
    if not Path(".env").exists():
        print("⚠️  .env file not found. Creating from template...")
        if Path(".env.example").exists():
            print("Please copy .env.example to .env and add your API keys")
            sys.exit(1)

    print("🚀 Starting Smart Revision Assistant with Agentic AI")
    print("=" * 60)

    # Start the AI backend
    print("🤖 Starting AI Backend (FastAPI + Pathway + CrewAI)...")
    backend = subprocess.Popen([
        sys.executable, "main.py"
    ], cwd=os.getcwd())

    # Wait a moment for backend to start
    time.sleep(3)

    # Start the frontend
    print("🌐 Starting Frontend Server...")
    frontend = subprocess.Popen([
        "node", "server.js"
    ], cwd=os.getcwd())

    print("\n✅ Both servers started!")
    print("📱 Frontend: http://localhost:8000")
    print("🔧 Backend API: http://localhost:8001")
    print("📚 API Docs: http://localhost:8001/docs")
    print("\nPress Ctrl+C to stop both servers")

    try:
        # Wait for both processes
        backend.wait()
        frontend.wait()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down servers...")
        backend.terminate()
        frontend.terminate()
        backend.wait()
        frontend.wait()
        print("✅ Servers stopped")

if __name__ == "__main__":
    main()