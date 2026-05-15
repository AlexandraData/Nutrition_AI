# 🥗 AI Nutrition Assistant

A full-stack, AI-powered web application that allows users to ask complex nutritional questions, search for foods, and visualize dietary data. The app leverages a React frontend and a Python FastAPI backend powered by Google's Vertex AI and BigQuery.

## 🏗️ Architecture & Tech Stack

This project is structured as a Monorepo containing both the client and server codebases.

### Frontend (`/frontend`)
* **Framework:** React + Vite
* **Styling:** CSS / Tailwind (if applicable)
* **Hosting:** Vercel

### Backend (`/backend`)
* **Framework:** Python + FastAPI
* **AI & Logic:** Google Vertex AI (Gemini 2.5 Pro), LangChain, LangGraph
* **Database:** Google BigQuery (`db_nutrition`)
* **Hosting:** Google Cloud Run (Dockerized)

---

## 📂 Folder Structure

```text
Nutrition_AI/
├── frontend/               # React user interface
│   ├── src/                # Components, API logic, and styles
│   ├── package.json        # Node.js dependencies
│   └── vite.config.js      # Vite build configuration
│
└── backend/                # FastAPI server and AI Agents
    ├── main.py             # API endpoints and CORS configuration
    ├── agents.py           # LangGraph workflow and Vertex AI integration
    ├── requirements.txt    # Python dependencies
    └── Dockerfile          # Cloud Run containerization instructions
