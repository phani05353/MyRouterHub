# RouterHub

A real-time network monitor for ASUS routers. See every connected device, track live bandwidth, and browse historical usage — all from a self-hosted web dashboard.

![RouterHub Dashboard](https://img.shields.io/badge/status-active-brightgreen) ![Node](https://img.shields.io/badge/node-20-blue) ![Docker](https://img.shields.io/badge/docker-ready-blue)

---

## Features

- **Live device list** — every connected device with IP, MAC, vendor, and connection type (Wired / 2.4 GHz / 5 GHz / 6 GHz)
- **Real-time bandwidth** — per-device download/upload rates updated every 2 seconds via WebSocket
- **Spark charts** — mini bandwidth timeline on every device card
- **Total network widget** — aggregated download/upload across all devices with an active device count
- **Pin / favourite devices** — star any device to keep it at the top; persists across page refreshes
- **Historical rate chart** — per-device bandwidth history over 1 h / 6 h / 24 h / 7 d
- **Daily usage bar chart** — actual daily download/upload in MB over 7 or 30 days
- **Search & sort** — filter by name/IP/MAC, sort by download, upload, name, or type
- **Self-hosted & Docker-ready** — single container serves both the API and the React frontend

---

## Project Structure

```
MyRouterHub/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express + Socket.io server entry point
│   │   ├── asus-client.js    # ASUS router API client (login, polling)
│   │   ├── poller.js         # 2s polling loop, rate computation, DB accumulation
│   │   ├── db.js             # SQLite schema, queries (better-sqlite3)
│   │   └── routes/
│   │       ├── devices.js    # REST API: /api/devices, /history, /daily, /top
│   │       └── debug.js      # Debug endpoints for diagnosing router auth
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Root component
│   │   ├── main.jsx          # React entry point
│   │   ├── index.css         # Tailwind base + custom components
│   │   ├── components/
│   │   │   ├── Header.jsx        # Top nav bar with router/WS status
│   │   │   ├── Dashboard.jsx     # Main layout, search, sort, pin logic
│   │   │   ├── DeviceCard.jsx    # Per-device card with spark chart + pin button
│   │   │   ├── DeviceDetail.jsx  # Modal: live stats, rate history, daily usage
│   │   │   ├── SparkChart.jsx    # Tiny area chart used in device cards
│   │   │   └── TotalBandwidth.jsx# Aggregated network widget
│   │   ├── hooks/
│   │   │   └── useSocket.js  # Socket.io hook + REST history pre-fetch on connect
│   │   └── utils/
│   │       └── formatBytes.js # formatBytes, formatRate, formatTime helpers
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── Dockerfile                # Multi-stage: builds frontend, runs backend
├── deploy.sh                 # One-command deploy script for Ubuntu servers
├── .env.example              # Environment variable template
└── package.json              # Root scripts (dev, build, docker helpers)
```

---

## Prerequisites

- **Router**: ASUS stock firmware (RT-AX / ZenWiFi series)
- **Traffic Analyzer** enabled on the router:
  `Advanced Settings → Traffic Analyzer → Enable`
- **Server**: Any Linux machine with Docker (Ubuntu recommended)

---

## Quick Start (Docker — recommended)

### 1. Clone & configure

```bash
git clone https://github.com/phani05353/MyRouterHub
cd MyRouterHub
cp .env.example .env
nano .env   # set ROUTER_IP, ROUTER_USER, ROUTER_PASS
```

### 2. Deploy

```bash
bash deploy.sh
```

The script will:
- Install Docker if missing (Ubuntu only)
- Stop and remove any existing container
- Build the Docker image
- Start the container with `--restart unless-stopped`

RouterHub will be available at `http://<your-server-ip>:3011`

### 3. Open firewall (Ubuntu)

```bash
sudo ufw allow 3011/tcp
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Default | Description |
|---|---|---|
| `ROUTER_IP` | `192.168.50.1` | LAN IP of your ASUS router |
| `ROUTER_USER` | `admin` | Router login username |
| `ROUTER_PASS` | `admin` | Router login password |
| `ROUTER_PROTOCOL` | `http` | `http` or `https` |
| `PORT` | `3001` | Backend listen port (inside container) |
| `NODE_ENV` | `production` | Set to `production` for built frontend |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Vite dev server origin (dev only) |

---

## Local Development

```bash
# Install all dependencies
npm run install:all

# Start backend + frontend with hot reload
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/devices` | All known devices |
| `GET` | `/api/devices/:mac/history` | Rate history — params: `start`, `end`, `bucket` (seconds) |
| `GET` | `/api/devices/:mac/daily` | Daily usage totals — param: `days` (default 7) |
| `GET` | `/api/devices/top` | Top devices by usage — params: `start`, `end`, `limit` |
| `GET` | `/api/status` | Router connection status |
| `GET` | `/api/debug/login` | Debug router auth |
| `GET` | `/api/debug/clients` | Raw client list from router |
| `WS` | `/socket.io` | Real-time events: `clients`, `status` |

---

## Data & Storage

- SQLite database at `/app/data/routerhub.db` inside the container
- Mounted to `~/myrouterhub-data/` on the host — survives container rebuilds
- History is retained for 30 days, pruned automatically at midnight
- To reset all data: `sudo docker stop myrouterhub && rm ~/myrouterhub-data/routerhub.db && bash deploy.sh`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express, Socket.io |
| Database | SQLite via better-sqlite3 |
| Router API | ASUS `appGet.cgi` (login.cgi + appGet.cgi hooks) |
| Container | Docker (multi-stage build, node:20-alpine) |
