@echo off
echo ==========================================
echo       QuizCraft Setup & Run Script
echo ==========================================

if not exist "venv" (
    echo [INFO] Creating virtual environment...
    python -m venv venv
) else (
    echo [INFO] Virtual environment exists.
)

echo [INFO] Activating virtual environment...
call venv\Scripts\activate.bat

echo [INFO] Installing dependencies...
pip install -r requirements.txt

echo [INFO] Starting Flask Application...
echo [INFO] Open http://localhost:5000 in your browser.
python app.py
