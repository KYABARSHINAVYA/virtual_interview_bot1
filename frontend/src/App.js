import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState(null);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState("");
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [result, setResult] = useState(null);

  // Start Interview
  const startInterview = async () => {
    if (!jd || !resume) {
      alert("Please enter JD and upload resume");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("job_description", jd);
    formData.append("resume", resume);

    try {
      const res = await axios.post(
        "http://localhost:5000/start",
        formData
      );

      setQuestion(res.data.question);
      setStarted(true);
    } catch (err) {
      alert("Server error");
    }

    setLoading(false);
  };

  // Submit Answer
  const submitAnswer = async () => {
    if (!answer) {
      alert("Enter your answer");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("answer", answer);

    try {
      const res = await axios.post(
        "http://localhost:5000/answer",
        formData
      );

      if (res.data.end) {
        setEnded(true);
        setResult(res.data);
      } else {
        setEvaluation(res.data.evaluation);
        setQuestion(res.data.question);
        setAnswer("");
      }
    } catch (err) {
      alert("Error submitting answer");
    }

    setLoading(false);
  };

  return (
    <div className="container">
      <div className="card">
        <h2>AI Interview Chatbot</h2>

        {loading && <p className="loading">Processing...</p>}

        {/* Start Screen */}
        {!started && !ended && (
          <div>
            <textarea
              placeholder="Enter Job Description"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />

            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setResume(e.target.files[0])}
            />

            <button onClick={startInterview}>
              Start Interview
            </button>
          </div>
        )}

        {/* Interview Screen */}
        {started && !ended && (
          <div>
            <h3>Question</h3>

            <div className="question-box">
              {question}
            </div>

            <textarea
              placeholder="Type your answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />

            <button onClick={submitAnswer}>
              Submit Answer
            </button>

            {evaluation && (
              <p
                className={
                  evaluation === "Correct"
                    ? "correct"
                    : "wrong"
                }
              >
                {evaluation}
              </p>
            )}
          </div>
        )}

        {/* Result Screen */}
        {ended && result && (
          <div>
            <h3>Interview Completed</h3>

            <p>
              Final Score: <b>{result.score}</b>
            </p>

            <p>
              Percentage: <b>{result.percentage}%</b>
            </p>

            <h4>Performance Feedback</h4>
            <p>{result.feedback}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;