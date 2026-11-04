# Alta Redwood Standards for Game Design (First Edition)

The Alta Redwood game engine specification—developed by **Daniel McKeown** across titles such as *Coffee Craft*, *Coyote Pack*, and *Dog Walker Pro*—establishes an authoritative framework for open-world, browser-based urban simulation games. Designed for seamless execution on both desktop web and mobile web viewports, this document outlines mandatory standards for system architecture, on-screen controller layouts, menu navigation, screenshot/PDF export pipelines, smartphone settings interfaces, visual art directives, and account management protocols.

All Alta Redwood projects must link back to official studio resources at [Alta Redwood](https://altaredwood.work).

---

## 1. Code Architecture & Technical Infrastructure

The Alta Redwood architecture prioritizes local-first performance, zero-configuration web play, flexible database scaling, and modular AI integrations.

```
+-----------------------------------------------------------------------+
|                    ALTA REDWOOD TECHNICAL STACK                       |
+-----------------------------------------------------------------------+
|  Frontend: HTML5 / JS Canvas (Desktop & Mobile Web)                   |
|  Backend Environment: PHP Engine                                      |
+-----------------------------------------------------------------------+
|  Persistence Layer:                                                   |
|    - Default: Local File-Based / SQLite (Zero-Config Local Play)      |
|    - Production: MySQL / MariaDB (Configured via config.php)          |
+-----------------------------------------------------------------------+
|  AI NPC Engine (Configurable via config.php):                         |
|    - Tier 1: Local Ollama API Server                                  |
|    - Tier 2: Cloud LLM Provider API Integration                       |
|    - Tier 3: Deterministic Rule-Based Fallback Engine                 |
+-----------------------------------------------------------------------+
```

### Backend Stack & Dual-Tier Data Persistence
All server-side operations rely on a **PHP** environment. To ensure high accessibility across both local development environments and production web deployments, the persistence layer utilizes a dual-tier storage driver:

*   **Default Local File Storage**: Out of the box, games utilize local file-based text storage (such as **SQLite** or structured flat-file stores). This guarantees zero-configuration local play without requiring an external database server daemon.
*   **SQL Database Driver**: When deployed to web servers or scalable database environments, data operations can be directed to a **MySQL or MariaDB** database by configuring connection string parameters in `config.php`.
*   **Deployment Configuration Pattern**: Developers must utilize the `config.local.php` configuration pattern, where deployment-specific environment overrides are stored in a file excluded from git repositories (`.gitignore`) to avoid exposing credentials.

### Tiered AI Integration Framework
Alta Redwood titles incorporate dynamic NPC dialogue generation, animal behavioral modeling, automated banking decisions, and TOWS strategic threat identification. The backend manages AI connectivity through a three-tiered fallback hierarchy configured in `config.php`:

1.  **Local Ollama Server (Default)**: By default, the engine connects to a local **Ollama** API instance running on the host machine, providing fast, cost-free, and private AI inference.
2.  **Cloud LLM Provider API**: When deployed to web hosts, `config.php` allows developers to specify endpoint URLs and API keys for major cloud LLM providers.
3.  **Deterministic Fallback Logic**: If no AI API is configured or available, the engine seamlessly falls back to pre-programmed dialogue trees, static greeting tables, and rule-based state machines without interrupting gameplay.

### Modular World Layout & Extensibility
To support future world-builder tools and user modifications, game world layouts—including street grids, traffic pattern probabilities, building placements (such as Craftsman bungalows, indie coffee stands, local taverns, and libraries containing single accessible volumes like Soseki Natsume's *Kusamakura* or *Hamlet* First Quarto)—must be defined in modular text or JSON configuration files.

---

## 2. On-Screen Controller & Input Standards

To guarantee consistent user ergonomics across desktop browsers and touch-enabled mobile devices, all games feature an embedded on-screen control interface inspired by modern/retro platformer gamepads ("white controller" aesthetic styling).

### Ergonomic Layout Architecture
The control interface is divided into two ergonomic clusters positioned on the lower left and right corners of the viewport:

*   **Left Cluster (Directional Touch Pad)**: A four-way touch directional pad (D-pad) handling cardinal movement (Up, Down, Left, Right) alongside hidden diagonal touch vectors for 360-degree urban navigation.
*   **Right Cluster (Four-Button Action Pad)**: A four-button console-style cluster arranged in a circular formation (top, right, bottom, left). Buttons utilize distinctive visual treatments, such as light purple psychedelic gradients (*Coyote Pack*) or functional color coding (*Dog Walker Pro*).

### Contextual Action Mappings Across Titles
Buttons on the right cluster map to contextual interaction types across games, providing predictable usability while accommodating specific title mechanics:

| Button Position | Keyboard Shortcut | *Coffee Craft* Action | *Coyote Pack* Action | *Dog Walker Pro* Action |
| :--- | :--- | :--- | :--- | :--- |
| **Top / Left Action** | `/` (Slash) | 💬 NPC Dialogue / Scooter Boost | 🐾 Paws: Interact / Socialize | `/` (Yellow): Start Dialogue / Bird Jobs |
| **Right Action** | `.` (Period) | 👍 Pick Up / Interact / Affirmative | 🐺 Wild Canine: Hunt / Growl | `+` (Green): Pet Animal / Buy Coffee |
| **Bottom Action** | `,` (Comma) | ⛔ Say No / Avoid / Yell / Stop | 🥩 Consume: Drink Water / Eat | `-` (Red): Hostile Physical/Verbal Act |
| **Top / Select Action** | `'` (Apostrophe) | ▶️ Friendly Phrase / Power-slide / Sit | 🔘 Select / Confirm Action | `x` (Blue): Verbally Encourage Animal |

### Auxiliary Controls & Audio Toggles
Positioned adjacent to the controller clusters on the right side:
*   **Mute Button**: Instantly toggles ambient soundtrack streams, white noise channels, and trance music triggers.
*   **Pause Button**: Halts active simulation loops and opens the system menu.

---

## 3. Pause Menu & Simulation Flow Control

Pressing the on-screen **Pause button** (or `ESC` key) immediately freezes the active simulation loop, including NPC pathfinding, vehicle traffic movement, weather progression, and economic tick cycles.

The Pause Menu interface renders a clean, focused overlay providing immediate access to key operational tasks:
1.  **Resume Game**: Unfreezes the engine and closes the overlay.
2.  **Take Screenshot**: Triggers the system screenshot engine.
3.  **Settings**: Opens the full tabbed smartphone settings modal.
4.  **Exit / Main Menu**: Returns the user to the opening title modal.

---

## 4. Screenshot Engine & Report Export Systems

Capturing gameplay moments and exporting detailed performance reports are core features across all Alta Redwood titles.

### In-Game Screenshot System
When the user triggers the **Screenshot** button from the Pause menu (or via inventory items like a **Drone** for zoomed-out overhead map views or a **Vintage Camera** for black-and-white filters), the game executes an inline canvas render:
*   **Preview Modal**: The captured image is displayed inside a modal window accompanied by a direct **Download / Save** button.
*   **Mandatory Watermark**: Every captured screenshot must automatically burn a persistent attribution bar onto the top or bottom edge of the image, strictly adhering to this template:

$$\text{[Game Name]} \text{ by Daniel McKeown } \text{ https://altaredwood.work } \text{ -- [Timestamp]}$$

*   *Example (Coffee Craft)*: `Coffee Craft by Daniel McKeown https://altaredwood.work -- 2026-11-01 14:00:00`
*   *Example (Coyote Pack)*: `Coyote Pack by Daniel McKeown https://altaredwood.work -- 2026-11-01 14:00:00`
*   *Example (Dog Walker Pro)*: `Dog Walker Pro created by Daniel McKeown https://altaredwood.work -- 2026-11-01 14:00:00`

### Formatted PDF & Printer Export System
For text-heavy interactions—such as NPC conversation logs or player stat summaries—the interface provides a **Printer / PDF Export** button. Clicking this icon generates a formatted PDF or printable page (e.g., `Coffee_Craft__conversation_TIMESTAMP.pdf`) containing:
1.  **Header**: Game logo and title block.
2.  **Body**: Player username, session context, full conversation transcripts, or itemized stats (time played, points, businesses owned, dogs walked, coffees consumed).
3.  **Footer Attribution**: Mandatory credit stating `Created by Daniel McKeown https://altaredwood.work`.

---

## 5. Smartphone Settings Interface & Tab Architecture

The Settings page is styled as an in-game **smartphone interface** that slides up from the edge of the viewport. It is accessible either via the Pause menu or through a dedicated smartphone icon in the top utility bar.

The smartphone interface uses a tabbed navigation bar containing seven standardized modules:

```
+-----------------------------------------------------------------------+
|                         SMARTPHONE SETTINGS                           |
+---------+---------+-----------+----------+-------+---------+----------+
| Account |  Stats  | Save/Load | Controls | Debug | Credits | Legal    |
+---------+---------+-----------+----------+-------+---------+----------+
```

1.  **Account Tab**: Manages user registration, login, logout, and permanent account/data deletion.
2.  **Stats & Bank Tab**: Displays player statistics (time played, points, dogs walked, food diary entries). In business titles like *Coffee Craft*, this integrates the **Bank Sub-Tab** (loan management, automated banking toggles, TOWS strategic analysis, and supplier configuration for beans, cups, and cash-only payment processors).
3.  **Save / Load Tab**: Allows manual committing of current game state or loading previous save files for authenticated users.
4.  **Controls Tab**: Displays an interactive key explaining the on-screen controller mapping and physical keyboard shortcuts.
5.  **Debug Panel**: Displays real-time system indicators:
    *   **Active Storage Driver**: Explicitly flags `Local (SQLite/JSON)` vs `SQL (MySQL/MariaDB)`.
    *   **AI API Connection**: Flags `Ollama (Local)`, `Cloud Provider`, or `Fallback Mode`.
6.  **Credits Tab**: Displays the game title, logo, and credits linking to [Daniel McKeown](https://altaredwood.work).
7.  **Legal Tab (Terms & Privacy)**: Contains full Terms of Service and Privacy Policy documentation.

---

## 6. Visual Aesthetics & `./art` Directory Influence

Art direction across the Alta Redwood studio is directly influenced by custom digital artworks stored inside a local `./art` repository folder within the project directory.

### Color Palette Directives
Games must incorporate Daniel McKeown's trademark color palettes:
*   **Primary Accent**: Saturated deep purples and vibrant oranges.
*   **Secondary Palette**: Bright greens, warm earth tones, soft yellows, and rainy blues.
*   **Selective Red Usage**: Red hues are reserved strictly for high-priority alerts or critical UI warnings, preferring orange for reddish hues in ambient scenes.

### Visual Style Paradigms
Visual execution must align with one of three approved aesthetic paradigms:
*   **Mid-90s Polygon 3D**: Low-poly 3D models with crisp geometric edges, damp reflective street textures, and subtle tilt-shift camera perspectives (*Coffee Craft*).
*   **Surreal 3D / Set-Back Top-Down**: A set-back 3rd-person view featuring slightly sketchy, surreal environmental details, dynamic lighting, 3-minute day/night cycles, and ~20% rain weather frequency (*Coyote Pack*).
*   **Stylized Pixel Detail**: 2D-to-3D top-down grid perspectives featuring highly detailed pixel art for characters, hats, and varied animal breeds (*Dog Walker Pro*).

### Official Game Logos
Logos must reflect the thematic core of each title:
*   *Coffee Craft*: A coffee mug with the city skyline or streetcar in negative space.
*   *Coyote Pack*: A gray coyote wearing a bold purple bowler hat in a clean flat design.
*   *Dog Walker Pro*: An excited golden doodle with coat colors accentuated by psychedelic green and shiny orange-pink highlights.

---

## 7. Accounts, Data Saving & Account Deletion Standards

Player identity and progress persistence are managed through a standardized account handling workflow.

### User Authentication & Identity Badge
*   **Registration & Login**: Users register a unique username and password within the Settings > Account tab.
*   **On-Screen Status Indicator**: An on-screen UI badge near the controller displays the active username. Unauthenticated sessions default to displaying `Player 1`.

### Progress Persistence & State Restoration
*   **State Saving**: Game state—including player coordinates, bank balances, inventory items, active dog-walking tasks, or coyote pack cohesion levels—is serialized and saved to the active backend storage driver (SQLite or MySQL).
*   **State Loading**: Authenticated users can retrieve saved states upon logging in from any browser session.

### Account Deletion & Data Purge Protocol
Every Alta Redwood game must include an unrecoverable **Account Deletion** feature to ensure user privacy and compliance:
1.  **Deletion Trigger**: Located in Settings > Account when a user is actively logged in.
2.  **Confirmation Warning**: Selecting deletion triggers a mandatory warning modal: *"Warning: This action will permanently erase your account, profile stats, and all saved game progress. This operation cannot be undone."*
3.  **Data Purge Execution**: Upon user confirmation, the PHP backend executes a complete purge of the user's record and save tables from SQLite/MySQL, logs the user out, and resets the game state to default.

---

*This document serves as the official First Edition specification for game development at Alta Redwood. For technical updates and portfolio inquiries, visit [Alta Redwood](https://altaredwood.work).*
