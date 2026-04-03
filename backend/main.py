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
    "jd_text": "",
    "resume_text": "",
    "history": [], # list of {"role": "interviewer/candidate", "content": "..."}
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
    phase = "TECHNICAL" if interview_state["question_count"] < TECH_QUESTIONS else "BEHAVIORAL"
    
    # Context-Aware Expert Prompt
    history_str = "\n".join([f"{m['role']}: {m['content']}" for m in interview_state["history"][-4:]])
    asked_str = ", ".join(interview_state["asked_questions"])

    prompt = f"""
[SYSTEM: STAFF ENGINEER INTERVIEW PROTOCOL]
You are a Staff Software Engineer at a Tier-1 tech company. 

[CONTEXT]
JOB DESCRIPTION: {interview_state["jd_text"]}
CANDIDATE RESUME: {interview_state["resume_text"]}

[INTERVIEW STATE]
PHASE: {phase}
PREVIOUSLY ASKED: {asked_str}
RECENT DIALOGUE:
{history_str}

[GOAL]
Generate Question #{interview_state["question_count"] + 1}.

[STRICT INSTRUCTIONS]
1. BRIDGE THE GAP: Identify a critical skill in the JD. Find a project in the RESUME. Ask a deep "HOW" or "WHY" question about the implementation of that skill within that specifically cited project.
2. DRILL DOWN: If the candidate's last answer was strong, ask a deeper follow-up on the SAME topic. If they struggled, pivot to a new skill from the JD.
3. NO GENERICS: Never ask "Tell me about..." or "What was your role...". Ask about bottlenecks, trade-offs, edge cases, or internal mechanics.
4. BE CONCISE: Max 15 words. ONLY the question in output.
5. NO REPETITION: Do not repeat concepts already discussed.

[OUTPUT]
Only the question text.
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

    interview_state["started"] = True
    interview_state["jd_text"] = job_description
    interview_state["resume_text"] = resume_text
    interview_state["history"] = []
    interview_state["score"] = 0
    interview_state["question_count"] = 0
    interview_state["asked_questions"] = []

    # Better First Question Prompt
    first_prompt = f"""
[SYSTEM: STAFF ENGINEER INTERVIEW PROTOCOL]
JOB: {job_description}
RESUME: {resume_text}

Ask Question 1 (TECHNICAL). Identify the most complex project on the resume and ask a specific, deep implementation question (HOW/WHY) that demonstrates a core skill from the JD.
Max 15 words. ONLY the question.
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

    # Save history
    interview_state["history"].append({"role": "interviewer", "content": current_q})
    interview_state["history"].append({"role": "candidate", "content": answer})
    interview_state["question_count"] += 1

    # End Interview
    if interview_state["question_count"] >= TOTAL_QUESTIONS:
        interview_state["started"] = False
        score = interview_state["score"]
        percentage = round((score / TOTAL_QUESTIONS) * 100, 2)

        history_str = "\n".join([f"{m['role']}: {m['content']}" for m in interview_state["history"]])
        
        final_prompt = f"""
[SYSTEM: STAFF ENGINEER EVALUATOR]
Provide a detailed, high-level professional assessment (4-5 lines) of the candidate's performance.

[STATS]
SCORE: {score}/{TOTAL_QUESTIONS}

[FULL TRANSCRIPT]
{history_str}

[GOAL]
Summarize their technical depth, communication clarity, and overall fit for a Staff/Senior role.
"""
        feedback = ask_ollama(final_prompt, temperature=0.7)

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
        return {"end": True, "message": "Ollama went offline."}

    interview_state["current_question"] = next_question

    return {
        "end": False,
        "evaluation": evaluation,
        "question": next_question
    }