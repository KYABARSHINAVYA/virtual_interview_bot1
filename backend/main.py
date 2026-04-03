from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import requests
import pdfplumber
import docx
from difflib import SequenceMatcher

# ----------------------------------------
# App Setup
# ----------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------
# Configuration
# ----------------------------------------
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "mistral"

TOTAL_QUESTIONS = 15
TECH_QUESTIONS = 10

# 🔥 UPDATED SYSTEM PROMPT
SYSTEM_PROMPT = """
You are a senior technical interviewer.

STRICT RULES:
- Ask ONLY deep, technical, implementation-level questions
- Questions MUST come from resume projects and skills
- DO NOT ask generic questions like:
  "Explain your project", "What is your role"

INSTEAD ASK:
- How did you implement features?
- Why did you choose specific algorithms?
- How does your system work internally?
- What challenges did you face and how solved?

STYLE:
- Ask HOW / WHY questions
- Be specific and technical
- Max 15 words
- Ask ONE question only
- No repetition

FLOW:
- First 10 questions → Technical
- Last 5 → HR

OUTPUT:
Only the question
"""

# ----------------------------------------
# Interview State
# ----------------------------------------
interview_state = {
    "started": False,
    "conversation": "",
    "current_question": "",
    "question_count": 0,
    "score": 0,
    "asked_questions": []
}

# ----------------------------------------
# Ollama API Call
# ----------------------------------------
def ask_ollama(prompt, temperature=0.6):
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "top_p": 0.7,
                    "repeat_penalty": 1.5
                }
            },
            timeout=20
        )
        response.raise_for_status()
        return response.json().get("response", "").strip()

    except requests.exceptions.ConnectionError:
        return "ERROR_OLLAMA_OFFLINE"
    except Exception as e:
        return f"ERROR_GENERIC: {str(e)}"

# ----------------------------------------
# Resume Extraction
# ----------------------------------------
def extract_resume_text(uploaded_file: UploadFile):
    text = ""

    if uploaded_file.filename.endswith(".pdf"):
        with pdfplumber.open(uploaded_file.file) as pdf:
            for page in pdf.pages:
                if page.extract_text():
                    text += page.extract_text() + "\n"

    elif uploaded_file.filename.endswith(".docx"):
        doc = docx.Document(uploaded_file.file)
        text = "\n".join([p.text for p in doc.paragraphs])

    return text[:4000]

# ----------------------------------------
# Duplicate Check
# ----------------------------------------
def is_duplicate(new_question):
    new_question = new_question.lower().strip()

    for old_q in interview_state["asked_questions"]:
        similarity = SequenceMatcher(None, new_question, old_q.lower()).ratio()
        if similarity > 0.75:
            return True

    return False

# ----------------------------------------
# Generate Next Question (🔥 UPDATED)
# ----------------------------------------
def generate_next_question():

    question_type = "Technical" if interview_state["question_count"] < TECH_QUESTIONS else "HR"

    prev_questions = "\n".join(interview_state["asked_questions"])

    prompt = f"""
{interview_state["conversation"]}

Previously Asked Questions:
{prev_questions}

Now ask Question {interview_state["question_count"] + 1} ({question_type})

STRICT RULES:
- Ask ONLY ONE question
- NO generic questions
- Focus on implementation / logic / architecture
- Ask HOW or WHY
- Use resume project details
- Max 15 words
- Do NOT repeat

GOOD EXAMPLES:
- How did you implement REST APIs in your project?
- Which sorting algorithm did you use and why?
- How does your emotion detection model work internally?
- How did you preprocess your dataset?

BAD EXAMPLES:
- Explain your project
- What is your role
- Describe your experience

OUTPUT:
Only the question
"""

    for _ in range(8):
        question = ask_ollama(prompt, temperature=0.5)

        if len(question.split()) <= 18 and not is_duplicate(question):
            interview_state["asked_questions"].append(question)
            return question

    fallback = "How did you implement key features in your main project?"
    interview_state["asked_questions"].append(fallback)
    return fallback

# ----------------------------------------
# START INTERVIEW (🔥 UPDATED)
# ----------------------------------------
@app.post("/start")
async def start_interview(
    job_description: str = Form(...),
    resume: UploadFile = File(...)
):
    resume_text = extract_resume_text(resume)

    interview_state["conversation"] = (
        SYSTEM_PROMPT +
        "\n\nJob Description:\n" + job_description +
        "\n\nResume:\n" + resume_text
    )

    interview_state["started"] = True
    interview_state["score"] = 0
    interview_state["question_count"] = 0
    interview_state["asked_questions"] = []

    # 🔥 Better First Question Prompt
    first_prompt = f"""
{interview_state["conversation"]}

Ask Question 1 (Technical)

STRICT RULES:
- Ask deep technical question from project
- NO generic questions
- Focus on implementation (API, ML, logic)
- Ask HOW or WHY
- Max 15 words

OUTPUT:
Only the question
"""

    first_question = ask_ollama(first_prompt, temperature=0.5)

    if first_question == "ERROR_OLLAMA_OFFLINE":
        return {"question": "Ollama is offline. Please start Ollama locally.", "end": True, "error": True}
    
    if first_question.startswith("ERROR_GENERIC"):
        return {"question": f"An error occurred: {first_question}", "end": True, "error": True}

    if is_duplicate(first_question) or len(first_question.split()) > 20:
        first_question = "How did you design and implement your main project?"

    interview_state["current_question"] = first_question
    interview_state["asked_questions"].append(first_question)
    interview_state["question_count"] = 1

    return {"question": first_question, "end": False}

# ----------------------------------------
# SUBMIT ANSWER (🔥 IMPROVED EVALUATION)
# ----------------------------------------
@app.post("/answer")
async def submit_answer(answer: str = Form(...)):

    if not interview_state["started"]:
        return {"end": True, "message": "Interview not started"}

    current_q = interview_state["current_question"]

    # 🔥 Better evaluation prompt
    check_prompt = f"""
You are an expert interviewer.

Evaluate the answer based on correctness and relevance.

Respond with ONLY:
Correct
OR
Wrong

Question:
{current_q}

Answer:
{answer}
"""

    result = ask_ollama(check_prompt, temperature=0)

    evaluation = "Correct" if "correct" in result.lower() else "Wrong"

    if evaluation == "Correct":
        interview_state["score"] += 1

    # Save conversation
    interview_state["conversation"] += (
        f"\nInterviewer: {current_q}\nCandidate: {answer}\n"
    )

    # End Interview
    if interview_state["question_count"] >= TOTAL_QUESTIONS:
        interview_state["started"] = False

        total = TOTAL_QUESTIONS
        score = interview_state["score"]
        percentage = round((score / total) * 100, 2)

        final_prompt = f"""
Provide a concise 4-5 line professional interview feedback.

Score: {score}/{total}

Conversation:
{interview_state["conversation"]}
"""

        feedback = ask_ollama(final_prompt, temperature=0.4)

        return {
            "end": True,
            "evaluation": evaluation,
            "score": score,
            "percentage": percentage,
            "feedback": feedback
        }

    # Next Question
    next_question = generate_next_question()
    
    if next_question == "ERROR_OLLAMA_OFFLINE":
        return {"end": True, "message": "Ollama went offline during the interview."}

    interview_state["current_question"] = next_question
    interview_state["question_count"] += 1

    return {
        "end": False,
        "evaluation": evaluation,
        "question": next_question
    }