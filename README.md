# 🥗 DigOut — The Ingredient Digout

[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.4-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC.svg)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED.svg)](https://www.docker.com/)

**DigOut (The Ingredient Digout)** is an intelligent, personalized food health companion. It decodes complex food ingredient labels in seconds using AI, matches them against World Health Organization (WHO) nutritional guidelines, and highlights formulation differences across global versions of the same product.

---

## ✨ Features

- 📸 **Camera OCR & Live Barcode Scanner:** Snap photos of ingredient tables or scan barcodes to extract food data instantly.
- 🩺 **Personalized Health Profiles:** Tailors ingredient warnings to medical conditions (Diabetes, PCOS, Hypertension, Ulcers, Pregnancy, Celiac/Gluten allergy, Lactose intolerance, Nut allergies) and calorie/fitness goals.
- 🌍 **International Variant Comparison:** Compares local formulations against the OpenFoodFacts global database to expose hidden differences in sugar, sodium, palm oil, or synthetic preservatives.
- 🌐 **40+ Languages Supported:** Automatically translates chemical and scientific ingredient terms into your native language.
- 📱 **Offline-Ready PWA:** Installable directly on any mobile or desktop browser as a lightweight Progressive Web App.
- 🔒 **Data Privacy & Security:** Sensitive user health data is encrypted at rest using AES-256-GCM.

---

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, Vite PWA, Cloudflare Turnstile
- **Backend:** Java 21, Spring Boot 3.2.4, Spring Security 6 (Stateless JWT + Google OAuth2), Spring Data JPA, Hibernate
- **Database:** PostgreSQL 16 (JSONB columns & composite constraints)
- **AI & External APIs:** Google Gemini API (`gemini-3.5-flash`), Groq LPU (`qwen/qwen3.8-27b`, `openai/gpt-oss-120b`), OpenFoodFacts API, USDA FoodData Central
- **DevOps:** Docker, Docker Compose, Multi-stage builds, HTTPS with self-signed SSL

---

## 🚀 Quickstart Guide

### 1. Prerequisites
Make sure you have installed:
- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (must be running)

---

### 2. Clone the Repository
Open your terminal (PowerShell, Command Prompt, or Bash) and clone the repo:

```bash
git clone https://github.com/Tarun25082007/Ingredients-digout.git
cd Ingredients-digout
```

---

### 3. Configure Environment Variables
Copy the template configuration file to create `.env`:

```bash
# On Windows Command Prompt / PowerShell:
copy .env.example .env

# On macOS / Linux:
cp .env.example .env
```

Open `.env` in any text editor and fill in your API keys (both Gemini and Groq offer generous free tiers):
- **GEMINI_API_KEY**: Get a free key from [Google AI Studio](https://aistudio.google.com/)
- **GROQ_API_KEY**: Get a free key from [Groq Console](https://console.groq.com/)
- **USDA_API_KEY**: (Optional) Get a free key from [USDA FoodData Central](https://fdc.nal.usda.gov/api-key-signup.html)

---

### 4. Run the Application

#### Option A — One-Click (Windows)
Double-click `start-digout.bat` in the root folder. It will automatically check Docker, build the images, start the containers, and launch the app.

#### Option B — Docker Compose (Cross-Platform / Mac / Linux / Windows)
Run the following command in the project root:

```bash
docker compose up -d --build
```

---

### 5. Access the App
Once the containers are healthy:
- **Frontend App:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [https://localhost:8443/api/scan/health](https://localhost:8443/api/scan/health)

*(Note: The backend runs HTTPS on port 8443 with a local development certificate. If accessing the backend directly in your browser, accept the local SSL warning).*

---

### 🛑 How to Stop the App

#### Windows:
Double-click `stop-digout.bat`

#### Command Line:
```bash
docker compose down
```

---

## ⚙️ Environment Variables Reference

| Variable | Description | Default / Required |
|---|---|:---:|
| `GEMINI_API_KEY` | Primary multimodal AI engine key | **Required** |
| `GROQ_API_KEY` | High-speed fallback AI engine key | **Required** |
| `USDA_API_KEY` | USDA database lookup key | Optional |
| `JWT_SECRET` | 32+ character key for JWT token hashing | Required (auto-set in `.env.example`) |
| `DB_ENCRYPTION_KEY` | 32-character key for AES-256 field encryption | Required (auto-set in `.env.example`) |
| `POSTGRES_PASSWORD` | PostgreSQL database password | `password` |

---

## 📁 Project Structure

```text
Ingredients-digout/
├── frontend/               # React 18 + Vite frontend
│   ├── src/
│   │   ├── components/     # UI Modals, Scanner, History, Comparisons
│   │   ├── context/        # Auth & Language Context Providers
│   │   └── utils/          # Country & Translation Utilities
│   └── vite.config.js      # Vite + PWA configuration
├── src/main/java/com/digout/
│   ├── config/             # Security, CORS, RestTemplate configurations
│   ├── controllers/        # REST Endpoints (Auth, Scan, User, Compare)
│   ├── models/             # JPA Entities (User, ScanHistory, CachedAnalysis)
│   ├── repositories/       # Spring Data JPA Repositories
│   └── services/           # Gemini, Groq, OpenFoodFacts, USDA Services
├── docker-compose.yml      # Orchestrates Postgres, Backend, and Frontend
├── Dockerfile              # Multi-stage Spring Boot container build
├── start-digout.bat        # Windows 1-click startup script
├── stop-digout.bat         # Windows 1-click shutdown script
└── .env.example            # Environment variables template
```

---

## 🤝 Contributing & Feedback
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Tarun25082007/Ingredients-digout/issues).
