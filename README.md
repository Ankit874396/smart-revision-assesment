# Smart Revision Assistant with Agentic AI

A modern, AI-powered study companion web application designed to help students manage their revision tasks, generate quizzes from notes, and collaborate with study teams. Enhanced with Pathway LLM tooling and CrewAI agents for real-time AI assistance.

## Features

- **Dashboard**: Real-time overview of tasks due, quiz accuracy, and study efficiency with visual charts.
- **Planner**: Add tasks with deadlines and priorities, track progress, and get AI-powered study plan suggestions.
- **Quiz Center**: Upload or paste notes to generate summaries and interactive quizzes (MCQ, short answer, fill-in) using AI agents.
- **Collaboration**: Team rooms for sharing notes and aligning on shared deadlines with AI-facilitated discussions.
- **AI Tutor**: Real-time chat with AI agents for study help and explanations.
- **Smart Recommendations**: AI-driven study strategies based on your progress and learning patterns.

## Tech Stack

- **Frontend**: HTML5, CSS3 (with CSS Variables), Vanilla JavaScript
- **Backend**: Python with FastAPI
- **AI Infrastructure**: Hugging Face Inference API (Free)
- **Storage**: LocalStorage for client-side persistence

## Getting Started

### Prerequisites

- Python 3.8+
- Node.js (for development server)
- Optional: Hugging Face API token (free tier available)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/smart-revision-assistant.git
   cd smart-revision-assistant
   ```

2. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables (optional):

   ```bash
   cp .env.example .env
   # Edit .env with your Hugging Face token (optional for faster inference)
   ```

   ```

   ```

4. Run the application:
   ```bash
   python run.py
   ```

This will start both the AI backend (FastAPI with Hugging Face) and the frontend server.

### Alternative: Run separately

Backend only:

```bash
python main.py
```

## AI Features

### Quiz Generation

- Analyzes study notes using Hugging Face models
- Generates contextual multiple-choice questions
- Adapts difficulty based on user performance

### Study Planning

- Monitors task completion patterns
- Suggests optimal study schedules
- Provides personalized learning recommendations

### AI Tutor

- Answers questions about study material
- Explains complex concepts
- Provides real-time assistance

## API Endpoints

- `POST /api/generate-quiz` - Generate personalized quiz from notes
- `POST /api/summarize-notes` - AI-powered note summarization
- `POST /api/study-recommendations` - Get study plan suggestions
- `POST /api/chat` - Chat with AI tutor
- `POST /api/analyze-progress` - Analyze learning progress

## Usage

- **Navigation**: Use the top navigation buttons to switch between sections.
- **Adding Tasks**: In the Planner section, fill in task details and click "Add to planner".
- **AI Quiz Generation**: Paste your notes and let AI generate contextual quizzes.
- **AI Chat**: Ask the AI tutor questions about your study material.
- **Smart Planning**: Get AI recommendations for study schedules.

## Architecture

```
Frontend (HTML/CSS/JS)
    ↕️ HTTP/WebSocket
Backend (FastAPI)
    ↕️ Hugging Face Inference API
AI Models (Mistral, BART)
```

## Demo

This version includes both local demo and AI-enhanced features. The AI features run using free Hugging Face Inference API.

## Team

Built by Team Vortenix for hackathons and study efficiency. Enhanced with Agentic AI capabilities.

## License

MIT License
