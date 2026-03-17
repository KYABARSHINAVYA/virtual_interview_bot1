from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import requests
import pdfplumber
import docx
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3"

TOTAL_TECH = 10
TOTAL_HR = 5
TOTAL_QUESTIONS = TOTAL_TECH + TOTAL_HR

# -------------------------
# Interview State
# -------------------------
interview_state = {
    "count": 0,
    "score": 0,
    "jd": "",
    "resume": "",
    "asked_questions": []
}

# -------------------------
# Resume Extract
# -------------------------
def extract_text(file: UploadFile):
    text = ""
    try:
        if file.filename.endswith(".pdf"):
            with pdfplumber.open(file.file) as pdf:
                for page in pdf.pages:
                    text += page.extract_text() or ""
        elif file.filename.endswith(".docx"):
            doc = docx.Document(file.file)
            for para in doc.paragraphs:
                text += para.text + "\n"
    except:
        pass
    return text[:2000]


# -------------------------
# Resume Summarization (NEW)
# -------------------------
def summarize_resume(resume_text):
    prompt = f"""
Summarize this resume into key skills, projects, and technologies in 5 lines:

{resume_text}
"""
    return ask_ollama(prompt)


# -------------------------
# Ollama Call (OPTIMIZED)
# -------------------------
def ask_ollama(prompt):
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.9,
                    "top_p": 0.9,
                    "repeat_penalty": 1.5
                }
            },
            timeout=30
        )

        if response.status_code == 200:
            return response.json().get("response", "").strip()
        else:
            return "Model Error"

    except Exception as e:
        return f"Connection Error: {str(e)}"


# -------------------------
# Generate Question (FIXED)
# -------------------------
def generate_question(question_type):

    previous = "\n".join(interview_state["asked_questions"])

    prompt = f"""
You are an expert interviewer.

Generate ONE unique {question_type} interview question.

Rules:
- Do NOT repeat previous questions
- Must be different from:
{previous}

- Must be based on:
Resume: {interview_state["resume"]}
Job Description: {interview_state["jd"]}

- Keep it short
- Ask only question
"""

    question = ask_ollama(prompt)

    # Hard duplicate check
    if question in interview_state["asked_questions"] or len(question) < 10:
        question = "Explain one challenging project you worked on."

    interview_state["asked_questions"].append(question)

    return question


# -------------------------
# Start Interview
# -------------------------
@app.post("/start")
async def start_interview(
    job_description: str = Form(...),
    resume: UploadFile = File(...)
):
    random.seed()

    interview_state["count"] = 1
    interview_state["score"] = 0
    interview_state["jd"] = job_description[:1000]

    raw_resume = extract_text(resume)
    interview_state["resume"] = summarize_resume(raw_resume)

    interview_state["asked_questions"] = []

    first_question = generate_question("technical")

    return {
        "question": first_question,
        "end": False
    }


# -------------------------
# Submit Answer
# -------------------------
@app.post("/answer")
async def submit_answer(answer: str = Form(...)):

    # Evaluate Answer
    eval_prompt = f"""
You are a strict interviewer.

Reply with ONLY:
Correct
OR
Wrong

Answer:
{answer}
"""

    result = ask_ollama(eval_prompt)

    if "Correct" in result:
        result = "Correct"
        interview_state["score"] += 1
    else:
        result = "Wrong"

    interview_state["count"] += 1

    # -------------------------
    # End Interview
    # -------------------------
    if interview_state["count"] > TOTAL_QUESTIONS:

        final_score = round(
            (interview_state["score"] / TOTAL_QUESTIONS) * 10, 2
        )

        percentage = round((final_score / 10) * 100, 2)

        feedback_prompt = f"""
Candidate answered {interview_state["score"]} out of {TOTAL_QUESTIONS} correctly.
Final Score: {final_score}
Percentage: {percentage}%

Give professional feedback in 4 lines.
"""

        final_feedback = ask_ollama(feedback_prompt)

        return {
            "end": True,
            "score": final_score,
            "percentage": percentage,
            "feedback": final_feedback
        }

    # -------------------------
    # Next Question Type
    # -------------------------
    if interview_state["count"] > TOTAL_TECH:
        next_question = generate_question("HR")
    else:
        next_question = generate_question("technical")

    return {
        "end": False,
        "evaluation": result,
        "question": next_question
    }