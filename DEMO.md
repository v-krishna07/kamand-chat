# Kamand Chat — Live Demo Playbook, Pitch Deck & Video Shot List

---

## Part 1: 3-Minute Live Demo Script (Ordered by Highest Impact)

### Pre-Demo Setup (30 seconds before going on stage)
1. Run `npm run setup && npm run dev`.
2. Open **Window 1 (Left half of screen)** at `http://localhost:5173` → Sign in via one-tap **`@aravind`**.
3. Open **Window 2 (Right half of screen, Incognito)** at `http://localhost:5173` → Sign in via one-tap **`@priya`**.

---

### Minute 0:00 – 0:50 · Flawless Core, Fluid Physics & E2EE Security (45 Marks Weight)
1. **Instant Real-Time 1:1 Delivery & Room Chips**:
   - In Window 1 (`@aravind`), open **Priya Nair**'s chat. Point out the green online indicator and the `B-19` / `A-12` hostel room badge (visible only because Priya is an accepted contact).
   - Send: `Hey Priya! Meet at B-19 common room in 5 mins for our First Commit pitch.`
   - Show the message springing into Window 2 immediately, the `B-19` code rendering as an interactive map chip, and the receipt upgrading from `sent` → `delivered` → cyan `read`.
2. **Apple Fluid Interface Gesture (Swipe-to-Reply with Rubber-Banding)**:
   - In Window 2 (`@priya`), drag Aravind's bubble to the right. Point out 1:1 pointer tracking and progressive rubber-band resistance. Release to quote-reply: `On my way from A-12!`
3. **Safety Number & On-Device Face Login**:
   - Click the green **Safety Number** button in the chat header to show the 60-digit cryptographic fingerprint & QR code.
   - Click the green **Shield icon** in the sidebar footer to show **ECDH P-256 + AES-256-GCM** key backup and **On-Device Face Login** enrollment.

---

### Minute 0:50 – 1:45 · Structured Campus Groups, E2EE Calls & Opt-In AI (30 Marks Weight)
1. **Structured IIT Mandi Community & Spring Reordering**:
   - Click the **Groups** tab. Show the **IIT Mandi** workspace organized into **Clubs**, **Hostels**, and **Courses**.
   - Drag the **Hostels** category above **Clubs** to demonstrate 60fps spring-physics reordering.
   - Click `#announcements` in Priya's window to show the role-enforced announcement lock, then open `#kamand-prompt` and click **`1 thread reply`** to show the side-by-side Thread drawer.
2. **E2EE Video Call + Momentum Picture-in-Picture**:
   - Return to the **Chats** tab, click the **Video Call** icon in Aravind's header, pass the **Pre-Call Device Check**, and click **Start E2EE Call**.
   - Accept on Priya's full-screen incoming call sheet. Point out the `Insertable Streams E2EE · Key Gen #1` badge.
   - Click **Minimize to Picture-in-Picture**, drag the floating video card, and flick it—watch it project momentum and snap cleanly into the screen corner. End the call and point out the system Call Log message in the chat stream.
3. **Explicit Opt-In AI Assistant**:
   - Click **`AI Assist`** in the chat header. Highlight the amber **"What will be shared with AI"** checklist—proving that because chats are E2EE, nothing is ever sent to the LLM without explicit per-message consent.
   - Click **Consent & Share** on **Summarize**, then switch to **Smart Replies** and tap a chip to insert it into the composer.

---

### Minute 1:45 – 3:00 · IIT Mandi Campus Hub, Offline A* Map & Admin Console (25 Marks Weight)
1. **Degrade-Gracefully Campus Hub & Moodle Connector**:
   - Click the **Campus** tab. Point out automatic roll-number inference (`B23101 · B.Tech 4th Year`), Kamand Valley Weather, Pine Mess Vegetarian Menu, and North/South Campus Bus timings.
   - Click **Connect Moodle**, accept the data-read consent screen, and show live assignment countdowns (`IC-152`, `IC-112`) and grade tracking.
   - Ask the **Grounded Campus AI**: `What is served at Pine Mess?` and show the answer with its verified source citation badge.
2. **Offline A* Campus Map & Step-Free Routing**:
   - Return to **Chats** and tap the **`B-19`** chip inside the message bubble—it jumps straight to the **Campus Map** focused on Hostel B-19.
   - Type `a block 12` in the search bar to show instant alias normalization (`A-12`, `A12`, `a 12`, `A block 12`).
   - Toggle **Step-Free** mode to show the route switching from stairs to accessible ramps, drag the spring-snapping bottom sheet (`peek`/`half`/`full`), and click **Share My ETA** to post the walking time directly into the chat.

---

### Fallback Plan if Live Wi-Fi / External Connections Fail
- **Zero External Dependency Mode**: Kamand Chat runs 100% locally on SQLite (`server/prisma/dev.db`) with `DEMO_MODE=true` enabled by default.
- If venue Wi-Fi drops completely:
  - Both browser windows communicate over `localhost` loopbacks (`http://localhost:5173` ↔ `http://localhost:4000`).
  - The AI Assistant automatically falls back to `DeterministicCampusAiProvider` (`kamand-campus-llm`).
  - The Moodle LMS and Weather connectors automatically use built-in IIT Mandi fixtures, and if any external probe fails, the **"Try, Then Degrade"** engine cleanly hides the broken connector without a single error toast.
  - The Campus Map and A* router run 100% client-side from cached GeoJSON.

---

## Part 2: 10-Slide Pitch Deck Outline (Rubric-Aligned)

1. **Slide 1 — Title & Hook**: *Kamand Chat: Start with a conversation. Build the entire IIT Mandi campus experience.* Team name, First Commit Hackathon, Kamand Prompt.
2. **Slide 2 — The Problem**: Campus communication is fragmented across WhatsApp groups (leaking phone numbers & room info), Discord servers, Moodle LMS tabs, PDF bus/mess schedules, and unsearchable hostel map pins.
3. **Slide 3 — The Solution**: One fluid, privacy-first web messenger tailored for IIT Mandi—combining sequence-verified real-time chat, structured campus communities, E2EE calls, opt-in AI, and offline campus navigation.
4. **Slide 4 — Live Product Demo Walkthrough**: Visual highlights of 1:1 real-time sync, rubber-band swipe-to-reply, threaded `#kamand-prompt` channels, and tappable `B-19` room chips.
5. **Slide 5 — Technical Architecture & Reliability**: Monorepo (`@kamand/shared` Zod contracts + Express/Socket.IO + Prisma + React/Motion). Monotonic per-conversation sequence numbers (`seq`), client UUID idempotency, exponential backoff + full jitter, and lossless `sync:resume` catch-up.
6. **Slide 6 — Zero-Knowledge Security & Biometrics**: Web Crypto ECDH P-256 + AES-256-GCM 1:1 encryption, rotating Group Sender Keys, 60-digit Safety Numbers, Insertable Streams call E2EE, and 100% on-device Face Login with ECDSA challenge-response.
7. **Slide 7 — Consent-First AI & Prompt-Injection Defense**: Why E2EE + AI usually conflict—and how our explicit *"What will be shared"* per-message consent preview + `<untrusted_chat_data>` XML sandboxing solves it safely.
8. **Slide 8 — IIT Mandi Campus Value ("Try, Then Degrade")**: Official Moodle Web Services API + ICS fallback, per-user HKDF encrypted tokens, Pine Mess & shuttle widgets, and offline A* step-free routing between North and South Campus.
9. **Slide 9 — Apple-Grade Craft & Accessibility**: WWDC *Designing Fluid Interfaces* physics (`projectMomentum`, `rubberband`, critically damped springs), 10,000-message virtualization, and full `prefers-reduced-motion` / `prefers-reduced-transparency` / `prefers-contrast` support.
10. **Slide 10 — Vision, Impact & Team**: Deploying Kamand Chat for incoming IIT Mandi batches with federation across SNTC clubs, hostels, and academic courses.

---

## Part 3: Demo Video Shot List (2:30 YouTube Submission)

- **Shot 1 (0:00–0:20)**: Split-screen login as `@aravind` and `@priya`; instant 1:1 WebSocket message delivery, read receipts, and live 3-dot spring typing indicator.
- **Shot 2 (0:20–0:40)**: Swipe-right rubber-band reply gesture on a message bubble + tapping the `B-19` room chip to jump to the Campus Map.
- **Shot 3 (0:40–1:05)**: Structured **IIT Mandi** community workspace → dragging categories with spring physics → posting in `#kamand-prompt` and replying in the Thread drawer.
- **Shot 4 (1:05–1:30)**: Starting a 1:1 E2EE Video Call → accepting on the full-screen incoming sheet → flicking the Picture-in-Picture window into the corner with momentum.
- **Shot 5 (1:30–1:55)**: Opening `AI Assist` → showing the explicit *"What will be shared"* consent checklist → streaming a conversation summary and inserting a Smart Reply.
- **Shot 6 (1:55–2:30)**: Opening the **Campus Hub** (Moodle deadlines, Pine Mess menu, Grounded Campus AI with citations), **Campus Map** (searching `"A block 12"` with step-free A* routing), and the **Admin Moderation Console**.
