from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import requests
import pdfplumber
import docx

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

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "phi3"

TOTAL_QUESTIONS = 15
TECH_QUESTIONS = 10

# ----------------------------------------
# Interview State
# ----------------------------------------
interview_state = {
    "conversation": "",
    "current_question": "",
    "question_count": 0,
    "score": 0,
    "resume_text": ""
}

# ----------------------------------------
# Ollama Call
# ----------------------------------------
def ask_ollama(prompt, temperature=0.4):
    try:
        res = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "top_p": 0.7,
                    "repeat_penalty": 1.3
                }
            },
            timeout=15
        )
        return res.json().get("response", "").strip()
    except:
        return "Error"

# ----------------------------------------
# Resume Extraction
# ----------------------------------------
def extract_resume(file: UploadFile):
    text = ""

    if file.filename.endswith(".pdf"):
        with pdfplumber.open(file.file) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""

    elif file.filename.endswith(".docx"):
        doc = docx.Document(file.file)
        for p in doc.paragraphs:
            text += p.text + "\n"

    return text[:2500]

# ----------------------------------------
# Filter Bad Questions
# ----------------------------------------
def is_bad_question(q):
    bad_words = [
        "network", "osi", "tcp", "ip",
        "define", "what is", "explain",
        "theory", "difference between",
        "describe", "advantages", "disadvantages"
    ]

    if any(word in q.lower() for word in bad_words):
        return True

    # Too long question check
    if len(q.split()) > 20:
        return True

    # Multi-line question check
    if "\n" in q:
        return True

    return False

# ----------------------------------------
# Generate Question (STRICT Resume Only)
# ----------------------------------------
def generate_question(q_type):

    resume_data = interview_state["resume_text"]

    if q_type == "technical":
        rule = "Ask technical question from resume projects/skills."
    else:
        rule = "Ask HR question based on resume experience."

    prompt = f"""
You are a strict interviewer.

Generate ONLY ONE SHORT QUESTION.

RULES:
- {rule}
- MUST be based ONLY on resume content
- Do NOT ask theoretical questions
- Do NOT ask definitions
- Do NOT ask networking questions
- Maximum 15 to 20 words
- Output must be a SINGLE LINE question
- Output ONLY the question (no explanation)

Resume:
{resume_data}
"""

    for _ in range(5):
        question = ask_ollama(prompt)

        if len(question) > 10 and not is_bad_question(question):
            return question

    return "Explain your most important project mentioned in your resume."

# ----------------------------------------
# START INTERVIEW
# ----------------------------------------
@app.post("/start")
async def start_interview(
    job_description: str = Form(...),
    resume: UploadFile = File(...)
):

    resume_text = extract_resume(resume)

    interview_state["resume_text"] = resume_text
    interview_state["conversation"] = ""
    interview_state["question_count"] = 1
    interview_state["score"] = 0

    # First Question strictly from resume projects
    first_prompt = f"""
You are a strict interviewer.

Ask ONLY ONE short question based ONLY on resume projects.

RULES:
- Must be project based
- Do NOT ask theory
- Maximum 20 words
- Output ONLY one line question

Resume:
{resume_text}
"""

    first_question = ask_ollama(first_prompt)

    if is_bad_question(first_question):
        first_question = "Explain your most important project mentioned in your resume."

    interview_state["current_question"] = first_question

    return {"question": first_question}

# ----------------------------------------
# SUBMIT ANSWER
# ----------------------------------------
@app.post("/answer")
async def submit_answer(answer: str = Form(...)):

    current_q = interview_state["current_question"]

    # Evaluation prompt
    eval_prompt = f"""
You are a strict interviewer.

Reply ONLY:
Correct
OR
Wrong

Question:
{current_q}

Answer:
{answer}
"""

    result = ask_ollama(eval_prompt, temperature=0)

    if "Correct" in result:
        evaluation = "Correct"
        interview_state["score"] += 1
    else:
        evaluation = "Wrong"

    # Save conversation
    interview_state["conversation"] += f"""
Question: {current_q}
Answer: {answer}
"""

    interview_state["question_count"] += 1

    # END INTERVIEW
    if interview_state["question_count"] > TOTAL_QUESTIONS:

        total = TOTAL_QUESTIONS
        score = interview_state["score"]

        final_score = round((score / total) * 10, 2)
        percentage = round((final_score / 10) * 100, 2)

        feedback_prompt = f"""
Candidate final score: {final_score}/10 ({percentage}%)

Give 4 lines feedback.
Focus on resume-based performance.
"""

        feedback = ask_ollama(feedback_prompt)

        return {
            "end": True,
            "score": final_score,
            "percentage": percentage,
            "feedback": feedback
        }

    # NEXT QUESTION TYPE
    if interview_state["question_count"] <= TECH_QUESTIONS:
        q_type = "technical"
    else:
        q_type = "HR"

    next_q = generate_question(q_type)

    interview_state["current_question"] = next_q

    return {
        "end": False,
        "evaluation": evaluation,
        "question": next_q
    }