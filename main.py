"""
Smart Revision Assistant - AI Backend with OpenAI
Using OpenAI API
"""

import os
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import requests
import json
import re
import ollama

# Load environment variables
load_dotenv()

# Ollama Configuration (Local AI, Free)
CHAT_MODEL = "mistral"
SUMMARIZATION_MODEL = "mistral"  # Same model for all

print("🤖 Using OpenAI API")
print(f"💬 Chat Model: {CHAT_MODEL}")
print(f"📝 Summarization Model: {SUMMARIZATION_MODEL}")
api_key = os.getenv('OPENAI_API_KEY')
if api_key:
    print("✅ API Key configured")
else:
    print("❌ No API Key found")

# Initialize FastAPI app
app = FastAPI(title="Smart Revision Assistant AI", version="2.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class QuizRequest(BaseModel):
    notes: str
    topic: str = ""
    difficulty: str = "medium"
    num_questions: int = 5

class QuizResponse(BaseModel):
    questions: List[Dict[str, Any]]

class SummaryRequest(BaseModel):
    notes: str
    max_length: int = 200

class SummaryResponse(BaseModel):
    summary: str

class ChatRequest(BaseModel):
    message: str
    context: str = ""

class ChatResponse(BaseModel):
    response: str

class StudyPlanRequest(BaseModel):
    tasks: List[Dict[str, Any]]
    user_progress: Dict[str, Any]

class StudyPlanResponse(BaseModel):
    recommendations: List[str]
    schedule: Dict[str, Any]

def query_ollama(prompt: str, max_tokens: int = 400):
    """Query local Ollama API"""
    try:
        response = ollama.generate(
            model=CHAT_MODEL,
            prompt=prompt,
            options={'num_predict': max_tokens}
        )
        return response['response'].strip()
    except Exception as e:
        print(f"Ollama error: {str(e)}")
        return None

def extract_json_from_text(text: str) -> dict:
    """Extract JSON from text that might contain other content"""
    try:
        # Try direct JSON parse first
        return json.loads(text)
    except:
        pass
    
    # Try to find JSON in text
    json_patterns = [
        r'\{[^{}]*"questions"[^{}]*\[[^\]]*\][^{}]*\}',
        r'\{.*?\}',
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, text, re.DOTALL)
        for match in matches:
            try:
                return json.loads(match)
            except:
                continue
    
    return None


def clean_repeated_lines(text: str) -> str:
    """Clean obvious repeated consecutive lines or prompt echoes from model output."""
    if not text:
        return text

    # Normalize line endings and split
    lines = [l.rstrip() for l in text.replace('\r\n', '\n').split('\n')]

    cleaned = []
    prev = None
    repeat_count = 0

    for line in lines:
        # Skip empty lines that are purely whitespace
        if line.strip() == "":
            if prev is not None and cleaned and cleaned[-1].strip() != "":
                cleaned.append("")
            prev = ""
            continue

        if line == prev:
            repeat_count += 1
            # If a line repeats many times, skip the duplicate
            if repeat_count > 0:
                # only keep one occurrence (skip duplicates)
                continue
        else:
            repeat_count = 0

        # Remove common prompt markers that the model might echo
        cleaned_line = re.sub(r"\[/?INST\]|<s>|</s>", "", line).strip()
        if cleaned_line:
            cleaned.append(cleaned_line)
        prev = line

    # Collapse runs of identical short lines (defensive)
    final_lines = []
    for l in cleaned:
        if final_lines and final_lines[-1] == l and len(l) < 120:
            # skip duplicate short lines
            continue
        final_lines.append(l)

    return "\n".join(final_lines).strip()


def extract_model_text(result) -> str:
    """Try to robustly extract generated text from various HF response shapes.

    Returns an empty string if nothing usable is found.
    """
    try:
        # If model returned a list of dicts
        if isinstance(result, list) and len(result) > 0:
            first = result[0]
            if isinstance(first, dict):
                # common keys
                for key in ("generated_text", "text", "summary_text", "output", "content"):
                    if key in first and isinstance(first[key], str) and first[key].strip():
                        return first[key].strip()
                # sometimes HF returns nested 'generated_text' under 'generated_text'
                # or may contain string under arbitrary key — try to join string values
                strings = [v for v in first.values() if isinstance(v, str) and v.strip()]
                if strings:
                    return "\n".join(strings).strip()
            # if first is a string
            if isinstance(first, str) and first.strip():
                return first.strip()

        # If result is a dict
        if isinstance(result, dict):
            for key in ("generated_text", "text", "summary_text", "output", "content", "prediction"):
                if key in result and isinstance(result[key], str) and result[key].strip():
                    return result[key].strip()
            # maybe there's an 'error'
            if 'error' in result:
                print("Model error:", result.get('error'))
                return ""

        # Fallback: if it's a plain string
        if isinstance(result, str) and result.strip():
            return result.strip()
    except Exception as e:
        print("extract_model_text error:", str(e))

    return ""

@app.post("/api/generate-quiz", response_model=QuizResponse)
async def generate_quiz(request: QuizRequest):
    """Generate a personalized quiz using Hugging Face"""
    try:
        # Truncate notes for context
        notes_text = request.notes[:1500]
        
        prompt = "Create {} multiple choice questions from these study notes: {}".format(request.num_questions, notes_text)

        result = query_ollama(prompt, max_tokens=800)
        # Clean repeated lines and prompt echoes
        result = clean_repeated_lines(result)
        
        # Try to extract JSON
        quiz_data = extract_json_from_text(result)

        if quiz_data and "questions" in quiz_data:
            return QuizResponse(questions=quiz_data["questions"][:request.num_questions])
        
        # Fallback: Generate rule-based quiz
        questions = generate_fallback_quiz(notes_text, request.num_questions)
        return QuizResponse(questions=questions)
        
    except Exception as e:
        print(f"Quiz generation error: {str(e)}")
        questions = generate_fallback_quiz(request.notes[:500], request.num_questions)
        return QuizResponse(questions=questions)

def generate_fallback_quiz(text: str, num_questions: int = 5) -> List[Dict]:
    """Generate quiz using rule-based approach as fallback"""
    sentences = [s.strip() for s in text.split('.') if len(s.strip()) > 20]
    questions = []
    
    # Extract key terms (words that appear multiple times)
    words = text.lower().split()
    word_freq = {}
    for word in words:
        clean = re.sub(r'[^\w]', '', word)
        if len(clean) > 4:
            word_freq[clean] = word_freq.get(clean, 0) + 1
    
    key_terms = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]
    key_terms = [term[0] for term in key_terms]
    
    for i in range(min(num_questions, len(sentences))):
        if i < len(sentences):
            sentence = sentences[i]
            
            # Find a key term in the sentence
            term_in_sentence = None
            for term in key_terms:
                if term in sentence.lower():
                    term_in_sentence = term
                    break
            
            if term_in_sentence:
                # Create fill-in-the-blank style question
                blank_sentence = sentence.replace(term_in_sentence, "_____")
                options = [term_in_sentence.capitalize()]
                
                # Add distractors
                for term in key_terms:
                    if term != term_in_sentence and len(options) < 4:
                        options.append(term.capitalize())
                
                # Fill remaining options
                while len(options) < 4:
                    options.append(f"Option {chr(65 + len(options))}")
                
                questions.append({
                    "id": i + 1,
                    "type": "multiple_choice",
                    "question": f"Complete: {blank_sentence[:100]}...",
                    "options": options,
                    "correct_answer": options[0],
                    "explanation": f"'{options[0]}' is a key concept in your notes."
                })
            else:
                # Generic question
                questions.append({
                    "id": i + 1,
                    "type": "multiple_choice",
                    "question": f"According to your notes: {sentence[:80]}... What is the main point?",
                    "options": ["Main concept", "Supporting detail", "Example", "Summary"],
                    "correct_answer": "Main concept",
                    "explanation": "This represents the key idea discussed."
                })
    
    return questions

@app.post("/api/summarize-notes", response_model=SummaryResponse)
async def summarize_notes(request: SummaryRequest):
    """Summarize study notes using Hugging Face"""
    try:
        # Truncate input for summarization model
        text = request.notes[:1024]
        
        prompt = f"You are a summarization assistant. Summarize the following text concisely.\n\nSummarize this text in {request.max_length} words or less:\n\n{text}"
        
        summary = query_ollama(prompt, max_tokens=request.max_length + 50)
        summary = clean_repeated_lines(summary)
        if summary:
            return SummaryResponse(summary=summary)
        
        # Fallback: Extract first and last sentences
        sentences = [s.strip() for s in request.notes.split('.') if len(s.strip()) > 20]
        if len(sentences) >= 2:
            summary = f"{sentences[0]}. {sentences[-1]}."
        else:
            summary = request.notes[:request.max_length] + "..."
        
        return SummaryResponse(summary=summary)
        
    except Exception as e:
        print(f"Summarization error: {str(e)}")
        # Simple fallback
        sentences = [s.strip() for s in request.notes.split('.') if len(s.strip()) > 10]
        summary = '. '.join(sentences[:3]) + '.'
        return SummaryResponse(summary=summary[:request.max_length])

@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_tutor(request: ChatRequest):
    """Chat with AI tutor using Hugging Face"""
    print(f"Chat request: {request.message[:50]}...")
    try:
        context_text = f"\n\nStudy Material Context:\n{request.context[:1000]}" if request.context else ""
        
        prompt = f"""You are a knowledgeable study tutor helping students with their coursework. Use the provided study material to give accurate, relevant answers to the student's question.{context_text}

Student's Question: {request.message}

Answer based on the study material when relevant, and provide clear explanations with examples. If the question isn't covered in the material, give general study advice."""
        
        response_text = query_ollama(prompt, max_tokens=400)
        # Clean repeated lines and prompt echoes
        response_text = clean_repeated_lines(response_text)
        if response_text:
            return ChatResponse(response=response_text)
        
        # Fallback response
        return ChatResponse(response=fallback)
        
    except Exception as e:
        print(f"Chat error: {str(e)}")
        fallback = get_fallback_response(request.message)
        return ChatResponse(response=fallback)

def get_fallback_response(message: str) -> str:
    """Generate fallback response based on keywords"""
    msg_lower = message.lower()
    
    if any(word in msg_lower for word in ["math", "calculate", "equation", "formula"]):
        return "For math problems, break them down step by step. First identify what you're solving for, list the given values, then apply the appropriate formula. Would you like help with a specific problem?"
    
    elif any(word in msg_lower for word in ["history", "date", "event", "war"]):
        return "When studying history, focus on causes and effects. Create timelines to visualize the sequence of events. Understanding 'why' things happened is more important than just memorizing dates. What specific period are you studying?"
    
    elif any(word in msg_lower for word in ["science", "physics", "chemistry", "biology"]):
        return "Science concepts often build on each other. Make sure you understand the fundamentals first. Use diagrams and practice problems to reinforce your understanding. What specific concept are you working on?"
    
    elif any(word in msg_lower for word in ["study", "learn", "remember", "memorize"]):
        return "Effective study techniques include: 1) Spaced repetition - review material over increasing intervals, 2) Active recall - test yourself without looking at notes, 3) Teach others - explaining concepts helps solidify understanding. Use the Pomodoro technique: 25 minutes focused study, 5 minute break."
    
    elif any(word in msg_lower for word in ["exam", "test", "quiz"]):
        return "For exam prep: 1) Review past papers and practice questions, 2) Focus on areas where you're weakest, 3) Get enough sleep before the exam, 4) During the test, read questions carefully and manage your time. Start with questions you know well to build confidence."
    
    else:
        return "I'm here to help with your studies! You can ask me about specific subjects (math, science, history), study techniques, exam preparation, or any concept you're learning. What would you like to know more about?"

@app.post("/api/study-recommendations", response_model=StudyPlanResponse)
async def get_study_recommendations(request: StudyPlanRequest):
    """Generate study recommendations using AI"""
    try:
        tasks_text = "\n".join([
            f"- {t.get('title', 'Task')}: {t.get('progress', 0)}% done, due {t.get('due', 'N/A')}"
            for t in request.tasks[:8]
        ])
        
        prompt = f"""You are a study planning expert. Based on these tasks and progress, provide study recommendations and a weekly schedule.

Tasks:
{tasks_text}

Progress: Accuracy {request.user_progress.get('accuracy', 'N/A')}, Efficiency {request.user_progress.get('efficiency', 'N/A')}

Generate ONLY JSON:
{{
  "recommendations": ["tip 1", "tip 2", "tip 3"],
  "schedule": {{
    "monday": ["activity 1", "activity 2"],
    "tuesday": ["activity 1", "activity 2"],
    "wednesday": ["activity 1", "activity 2"],
    "thursday": ["activity 1", "activity 2"],
    "friday": ["activity 1", "activity 2"]
  }}
}}
"""

        result = query_ollama(prompt, max_tokens=500)
        result = clean_repeated_lines(result)
        plan_data = extract_json_from_text(result)

        if plan_data and "recommendations" in plan_data:
            return StudyPlanResponse(
                recommendations=plan_data.get("recommendations", [])[:5],
                schedule=plan_data.get("schedule", {})
            )
        
        # Fallback recommendations
        return generate_fallback_plan(request.tasks, request.user_progress)
        
    except Exception as e:
        print(f"Study plan error: {str(e)}")
        return generate_fallback_plan(request.tasks, request.user_progress)

def generate_fallback_plan(tasks: List[Dict], progress: Dict) -> StudyPlanResponse:
    """Generate study plan using rules"""
    total = len(tasks)
    completed = sum(1 for t in tasks if t.get('progress', 0) >= 80)
    completion_rate = completed / total if total > 0 else 0
    
    if completion_rate < 0.3:
        recommendations = [
            "Focus on completing high-priority tasks first",
            "Break large tasks into smaller, manageable chunks",
            "Use the Pomodoro technique: 25 min study + 5 min break",
            "Set specific daily goals to build momentum"
        ]
    elif completion_rate < 0.7:
        recommendations = [
            "Great progress! Maintain your study rhythm",
            "Review completed material to reinforce learning",
            "Take practice quizzes to test understanding",
            "Identify and strengthen weak areas"
        ]
    else:
        recommendations = [
            "Excellent work! You're on track",
            "Focus on final review and practice tests",
            "Teach concepts to others for deeper understanding",
            "Plan your exam strategy and time management"
        ]
    
    # Generate schedule based on task priorities
    high_priority = [t for t in tasks if t.get('priority') == 'High']
    
    schedule = {
        "monday": [
            "Morning: Review high-priority material",
            "Afternoon: Practice problems and exercises"
        ],
        "tuesday": [
            "Morning: Focus on challenging topics",
            "Afternoon: Take practice quiz"
        ],
        "wednesday": [
            "Morning: Work on pending assignments",
            "Afternoon: Group study or review session"
        ],
        "thursday": [
            "Morning: Review completed topics",
            "Afternoon: Prepare for upcoming deadlines"
        ],
        "friday": [
            "Morning: Weekly review and consolidation",
            "Afternoon: Light study and plan next week"
        ]
    }
    
    if high_priority:
        schedule["monday"][0] = f"Focus on: {high_priority[0].get('title', 'priority task')}"
    
    return StudyPlanResponse(recommendations=recommendations, schedule=schedule)

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "ai_backend": "OpenAI",
        "chat_model": CHAT_MODEL,
        "summarization_model": SUMMARIZATION_MODEL,
        "api_key_configured": openai.api_key is not None
    }

@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Smart Revision Assistant API",
        "version": "2.0.0",
        "ai_backend": "OpenAI",
        "endpoints": [
            "/api/generate-quiz",
            "/api/summarize-notes",
            "/api/chat",
            "/api/study-recommendations",
            "/health",
            "/docs"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*60)
    print("🚀 Smart Revision Assistant AI Backend")
    print("🤖 Using Local Ollama AI (100% Free, Offline)")
    print("="*60)
    print("🌐 Server: http://127.0.0.1:8001")
    print("📖 API Docs: http://127.0.0.1:8001/docs")
    print("="*60 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=8001)