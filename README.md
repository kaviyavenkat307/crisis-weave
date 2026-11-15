# CrisisWeave — AI-Powered Disaster Intelligence & Smart Relief Coordination Network

> **Tagline:** Turning Disaster Chaos into Coordinated Action.

CrisisWeave is a full-stack disaster intelligence and smart relief coordination platform connecting **Citizens**, **NGOs**, **Volunteers**, **Hospitals**, and **Emergency Coordinators** on a unified real-time network.

## Core Modules

1. **AI-Powered Crisis Intelligence**: Classifies reports across 9 disaster categories, extracts resource demands & affected counts (using Gemini 4 Hydrogen server-side with deterministic NLP fallback), detects nearby duplicates via text + Haversine + time similarity, and outputs explainable priority scoring.
2. **TrustShield Cybersecurity Layer**: Role-based access control, bcrypt password hashing, HMAC-SHA256 session tokens, login rate limiting, SHA-256 evidence hashing & duplicate image detection, burst/inventory anomaly flagging for human review, and immutable audit logs.
3. **Intelligent Resource Optimisation**: Multi-criteria split-NGO allocation solver weighted by request priority and geographic distance, benchmarked side-by-side against a First-Come-First-Served (FCFS) baseline.
4. **GIS & GeoAI Disaster Monitoring**: Interactive Leaflet + OpenStreetMap view displaying severity-coded incidents, pending reports, NGO depots, hospitals, and relief shelters with filters and search.
5. **Predictive Demand Analysis**: 6h, 12h, and 24h statistical demand and shortage forecasts with explicit model assumptions and confidence bands.
6. **Digital Twin Response Simulator**: Interactive operational scenario modeling comparing affected families, road accessibility penalties, delivery delays, and supply shortages.
7. **Offline PWA Emergency Reporting**: Service Worker shell caching + IndexedDB draft queue with idempotency keys and automatic sync upon reconnection.
8. **Relief Delivery Tracking**: End-to-end chain of custody from coordinator approval to NGO dispatch, QR code waybills, and volunteer delivery confirmation.

## Simulated Demonstration Accounts (Chennai Flood Scenario)

All incidents, locations, and inventory figures in the initial database represent **Simulated Demonstration Data**:

| Role | Email | Password |
| :--- | :--- | :--- |
| Coordinator (Admin) | `coordinator@crisisweave.org` | `CrisisAdmin@2026` |
| Citizen | `ananya.citizen@example.org` | `Citizen@2026` |
| NGO Relief Hub | `chennai.relief@ngo.org` | `Ngo@2026` |
| Field Volunteer | `vikram.vol@example.org` | `Volunteer@2026` |
| Hospital | `apollo.med@hospital.org` | `Hospital@2026` |

## Development & Build

```bash
npm run dev      # Starts Express + Socket.IO + Vite dev server on port 3000
npm run lint     # Runs TypeScript type-checking (tsc --noEmit)
npm run build    # Builds production frontend bundle into dist/
```
