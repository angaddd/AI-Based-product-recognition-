# Shelfwise inventory dashboard

Local-first retail shelf dashboard. Product class names, counts, confidences, and bounding boxes come from the configured Roboflow workflow. No sample product rows or manual count entry are used.

## Run

Requires Node.js 18 or newer and Python 3. Create the local inference environment once, put your key in `.env`, then start the app:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-optional.txt
# Set ROBOFLOW_API_KEY in .env
npm start
```

On Windows, use `.venv\\Scripts\\python.exe -m pip install -r requirements-optional.txt`. The backend automatically uses `.venv` when present. Set `PYTHON` in the environment to override it.

Open http://localhost:3000. Inventory starts empty and is saved in `data/inventory.json`. Each successful scan replaces the dashboard inventory with that scan's detected classes; an explicit empty prediction clears it. Failed or unrecognized responses do not change saved counts.

## Roboflow workflow

The app calls workspace `angad-jj7vu`, workflow `general-segmentation-api`, with the uploaded image as `image` and the classes parameter `coke, pepsi, sprite, coca cola, mountain dew`. The key is read from the ignored `.env` file or the server environment and sent with header-based authentication.

The parser requires actual prediction entries with a class, confidence, and bounding box or polygon. It does not invent missing detections. If the workflow response does not match the supported shape, the scan fails without changing inventory.

## Stock status and restock rule

- Fewer than 5 detected units: `CRITICAL` (red).
- 5–9 detected units: `LOW` (yellow).
- 10 or more detected units: `OK` (green).
- Restock suggestion for `CRITICAL` or `LOW` classes: units needed to reach 10.
# AI-Based-product-recognition-
