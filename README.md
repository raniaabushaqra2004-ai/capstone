# Medika AI Web Merge

This workspace merges your website pages with a local Python backend so the chat page can call model-style triage logic instead of the old hardcoded demo replies.

## Files

- `index.html`: landing page
- `chat.html`: chat UI
- `style.css`: shared styling
- `script.js`: frontend chat flow + API calls
- `app.py`: local web server and JSON API
- `triage_service.py`: notebook-inspired triage/question/recommendation layer
- `requirements.txt`: lightweight runtime dependency list

## Run

Use the bundled Python runtime:

```powershell
& 'C:\Users\adnan\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\app.py
