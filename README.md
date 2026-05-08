# Eden AI Workspace

Eden is a powerful, AI-driven workspace designed to help teams organize, search, and automate their data. Built on a modern monorepo architecture, Eden combines semantic search, autonomous agents, and smart workflows into a single, cohesive platform.

![Eden Logo](artifacts/eden/public/favicon.svg)

## 🚀 Key Features

### 🔍 Semantic Search & Discovery
*   **Vector-Powered Search**: Natural language queries across all your documents, images, audio, and video files.
*   **Deep Transcription**: Automatic transcription for audio and video sources using high-performance ASR models.
*   **Visual Intelligence**: Vision AI analysis for images and video frames to make visual content searchable.

### 🤖 Autonomous AI Agents
*   **Folder-Level Agents**: Assign specialized AI agents to specific folders to automate organization, tagging, and summarization.
*   **Context-Aware Chat**: Interactive AI assistant that understands your entire workspace context.
*   **Agent Workflows**: Chains of AI tasks triggered by events like file uploads or metadata changes.

### ⚙️ Smart Workflows
*   **Event-Driven Automation**: Trigger actions (tagging, moving, notifying) based on source creation or updates.
*   **Multi-Step Pipelines**: Combine transcription, summarization, and entity extraction into automated sequences.
*   **Cloud Integrations**: Seamlessly import from and export to platforms like Dropbox and Cloudinary.

### 🔐 Secure Multi-User Environment
*   **Google OAuth 2.0**: Secure, one-click authentication.
*   **Data Isolation**: Strict per-user data filtering across the entire stack.
*   **Workspace Permissions**: Granular control over folders, pages, and sources.

## 🛠 Tech Stack

### Frontend
*   **Core**: React 19, TypeScript
*   **Styling**: Tailwind CSS 4, Framer Motion
*   **State Management**: TanStack Query (React Query)
*   **Routing**: Wouter
*   **Authentication**: @react-oauth/google

### Backend (API Server)
*   **Core**: Node.js, Express
*   **Database**: PostgreSQL with `pgvector` for semantic search
*   **ORM**: Drizzle ORM
*   **Queue System**: BullMQ with Redis for background processing
*   **Real-time**: Socket.io for job progress and status updates

### Infrastructure
*   **Monorepo Tooling**: pnpm Workspaces
*   **API Specification**: OpenAPI (Zod-first generation)
*   **Containerization**: Docker & Docker Compose

## 📁 Project Structure

```text
eden/
├── artifacts/
│   ├── eden/            # React Frontend (Vite)
│   └── api-server/      # Node.js Express API
├── lib/
│   ├── api-client-react/# Generated React hooks for API
│   ├── api-spec/        # OpenAPI/Swagger specifications
│   ├── api-zod/         # Shared Zod schemas for validation
│   ├── db/              # Drizzle schema and migrations
│   └── integrations-*/  # Specialized AI/Cloud integration logic
└── docker/              # Docker configuration files
```

## 🚦 Getting Started

### Prerequisites
*   **pnpm**: Version 9 or higher
*   **PostgreSQL**: Version 15+ (with `pgvector` extension)
*   **Redis**: For job queue management

### Setup Instructions

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-repo/eden.git
    cd eden
    ```

2.  **Install dependencies**:
    ```bash
    pnpm install
    ```

3.  **Configure environment variables**:
    Copy `.env.example` to `.env` in the root and fill in the required credentials (DB, OpenAI, Google, etc.).
    ```bash
    cp .env.example .env
    ```

4.  **Initialize the database**:
    ```bash
    pnpm --filter @workspace/db db:push
    ```

5.  **Start the development server**:
    ```bash
    pnpm start
    ```
    This will launch both the API server (Port 4000) and the Frontend (Port 3000).

## 📄 License
This project is licensed under the MIT License.
