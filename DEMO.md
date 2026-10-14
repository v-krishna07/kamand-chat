# Kamand Chat — Demo & Verification Guide

Built for **First Commit** (24-Hour Hackathon by Kamand Prompt, Programming Club, IIT Mandi).

---

## 1. Quick Verification & Execution

### One-Command Setup
```bash
# Push database schema, generate Prisma client, and seed test accounts
npm run db:push
npm run db:seed
```

### Run All Tests
```bash
# Typecheck across all 3 monorepo workspaces
npm run typecheck

# Run all 11 unit & integration tests (Server + Client)
npm test

# Build production bundle across all packages
npm run build
```

### Start Development Servers
```bash
npm run dev
```
- **Frontend (Vite + Motion)**: [http://localhost:5173](http://localhost:5173)
- **Backend (Express + Socket.IO)**: [http://localhost:4000](http://localhost:4000)

---

## 2. Seeded Demo Accounts (Password: `Kamand@2026!`)

| Account | Email | Role | Hostel Room | Description |
| :--- | :--- | :--- | :--- | :--- |
| `@aravind` | `b23101@students.iitmandi.ac.in` | `member` | **B-19** | CSE ’27 · Kamand Prompt |
| `@priya` | `b23142@students.iitmandi.ac.in` | `member` | **A-12** | DSE ’27 · Robotics Club |
| `@rohan` | `b22088@students.iitmandi.ac.in` | `moderator` | **C-10** | EE ’26 · Hostel Secretary |
| `@admin` | `admin@iitmandi.ac.in` | `super_admin` | **D-01** | System Administrator |

---

## 3. Two-Browser Live Verification Script

1. **Browser A (Normal Window)**:
   - Go to `http://localhost:5173`.
   - Click the instant demo chip **`@aravind`** and click **Sign In to Kamand Chat**.
   - Note the real-time presence indicators and the pre-seeded conversation with Priya Nair.

2. **Browser B (Incognito / Private Window)**:
   - Go to `http://localhost:5173`.
   - Click the instant demo chip **`@priya`** and click **Sign In to Kamand Chat**.
   - Notice the green active presence dot appears on `@aravind`'s screen for Priya.

3. **Real-Time Send & Ack**:
   - In Browser A, send: `Hey Priya, let's meet at B-19 before the round starts!`
   - Browser B instantly receives the message without page reload.
   - The campus room code `B-19` renders dynamically as an interactive location chip.
   - Status indicators automatically update: sent (single check) ➔ delivered ➔ read (double cyan check).

4. **Fluid Swipe-to-Reply Gesture**:
   - In Browser B, drag/swipe right on Aravind's message bubble.
   - Experience the 1:1 Apple fluid physics resistance and rubber-banding.
   - Releasing past the threshold locks the quoted reply bar above the composer.

5. **Offline & Catch-up (`sync:resume`)**:
   - Close or disconnect Browser B's network tab.
   - Send two messages from Browser A.
   - Reconnect Browser B: the client reconnects with exponential backoff and automatically emits `sync:resume` with its `lastSeenSeq` to catch up on missed messages with zero duplication.
