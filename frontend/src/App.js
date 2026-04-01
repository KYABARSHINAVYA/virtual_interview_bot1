import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState(null);

  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [result, setResult] = useState(null);

  const [answer, setAnswer] = useState("");
  const [messages, setMessages] = useState([]);

  // -------------------------------
  // Start Interview
  // -------------------------------
  const startInterview = async () => {
    if (!jd.trim() || !resume) {
      alert("Please enter Job Description and upload Resume");
      return;
    }

    setLoading(true);
    setEnded(false);
    setResult(null);
    setMessages([]);
    setAnswer("");

    const formData = new FormData();
    formData.append("job_description", jd);
    formData.append("resume", resume);

    try {
      const res = await axios.post("http://localhost:5000/start", formData);

      setMessages([{ sender: "bot", text: res.data.question }]);
      setStarted(true);
    } catch (err) {
      alert("Backend error while starting interview");
      console.error(err);
    }

    setLoading(false);
  };

  // -------------------------------
  // Send Answer
  // -------------------------------
  const sendAnswer = async () => {
    if (!answer.trim()) {
      alert("Enter your answer");
      return;
    }

    setLoading(true);

    const updatedMessages = [...messages, { sender: "user", text: answer }];
    setMessages(updatedMessages);

    const formData = new FormData();
    formData.append("answer", answer);

    try {
      const res = await axios.post("http://localhost:5000/answer", formData);

      if (res.data.end) {
        setEnded(true);
        setStarted(false);
        setResult(res.data);

        setMessages([
          ...updatedMessages,
          { sender: "bot", text: "Interview Completed 🎉" },
        ]);
      } else {
        setMessages([
          ...updatedMessages,
          { sender: "bot", text: `Evaluation: ${res.data.evaluation}` },
          { sender: "bot", text: res.data.question },
        ]);
      }

      setAnswer("");
    } catch (err) {
      alert("Backend error while submitting answer");
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <div className="main-layout">
      {/* LEFT PANEL */}
      <div className="left-panel">
        <h2 className="title">AI Interview Bot</h2>

        <label className="label">Job Description</label>
        <textarea
          className="input-box"
          placeholder="Paste Job Description here..."
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />

        <label className="label">Upload Resume</label>
        <input
          className="file-input"
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => setResume(e.target.files[0])}
        />

        <button className="btn start-btn" onClick={startInterview}>
          Start Interview
        </button>

        {loading && <p className="loading-text">Processing...</p>}
      </div>

      {/* RIGHT PANEL */}
      <div className="right-panel">
        {!started && !ended && (
          <div className="chat-welcome">
            <h3>Welcome 👋</h3>
            <p>Upload Resume and Job Description to start the interview.</p>
          </div>
        )}

        {/* CHAT AREA */}
        {started && (
          <div className="chat-container">
            <div className="chat-box">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={
                    msg.sender === "bot"
                      ? "chat-message bot-message"
                      : "chat-message user-message"
                  }
                >
                  <p>{msg.text}</p>
                </div>
              ))}
            </div>

            {/* INPUT LEFT + SEND BUTTON RIGHT */}
            <div className="chat-input-row">
              <textarea
                className="chat-input-box"
                placeholder="Enter answer here..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />

              <button className="btn send-btn small-send-btn" onClick={sendAnswer}>
                Send
              </button>
            </div>

            {loading && <p className="loading-text">Thinking...</p>}
          </div>
        )}

        {/* FINAL RESULT */}
        {ended && result && (
          <div className="final-result">
            <h2>Interview Completed 🎉</h2>

            <p>
              <b>Final Score:</b> {result.score}
            </p>

            <p>
              <b>Percentage:</b> {result.percentage}%
            </p>

            <h4>Feedback</h4>
            <p>{result.feedback}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;