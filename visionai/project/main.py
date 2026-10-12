"""
VisionAI Platform - Root Entrypoint Wrapper
-------------------------------------------
This file forwards to python_app/main.py so that running `python3 main.py`
or `uvicorn main:app` from the project root works seamlessly.
"""

import importlib.util
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(PROJECT_ROOT, "python_app")

if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

os.chdir(APP_DIR)

# Load python_app/main.py dynamically to avoid circular import when root is named main.py
spec = importlib.util.spec_from_file_location("python_app_main", os.path.join(APP_DIR, "main.py"))
if spec and spec.loader:
    python_app_main = importlib.util.module_from_spec(spec)
    sys.modules["python_app_main"] = python_app_main
    spec.loader.exec_module(python_app_main)
    app = python_app_main.app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8020))
    print(f"Starting VisionAI backend from {APP_DIR} on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, app_dir=APP_DIR)
