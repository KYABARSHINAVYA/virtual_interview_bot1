import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState(null);

  const [started, setStarted] = useState(false);
  const [answer, setAnswer] = useState("");

  const [ended, setEnded] = useState(false);
  const [result, setResult] = useState(null);

  const [chatHistory, setChatHistory] = useState([]);
  const [processingMessage, setProcessingMessage] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);

  const recognitionRef = useRef(null);

  // -----------------------------------
  // 🎤 Speech Recognition
  // -----------------------------------
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setAnswer(transcript);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // -----------------------------------
  // 🔊 Speak (with stop previous)
  // -----------------------------------
  const speak = (text) => {
    window.speechSynthesis.cancel(); // stop previous
    const speech = new SpeechSynthesisUtterance(text);
    speech.rate = 1;
    window.speechSynthesis.speak(speech);
  };

  // -----------------------------------
  // Start Interview
  // -----------------------------------
  const startInterview = async () => {
    if (!jd || !resume) {
      alert("Enter JD and upload resume");
      return;
    }

    const formData = new FormData();
    formData.append("job_description", jd);
    formData.append("resume", resume);

    const res = await axios.post("http://localhost:5000/start", formData);

    setStarted(true);
    setChatHistory([
      { sender: "bot", message: res.data.question }
    ]);

    // 🔊 Speak first question
    speak(res.data.question);
  };

  // -----------------------------------
  // 🎤 Start Listening
  // -----------------------------------
  const startListening = () => {
    if (recognitionRef.current && !isProcessing) {
      recognitionRef.current.start();
    }
  };

  // -----------------------------------
  // Submit Answer (WAIT FLOW)
  // -----------------------------------
  const submitAnswer = async () => {
    if (!answer.trim()) {
      alert("Enter answer");
      return;
    }

    setIsProcessing(true);

    // Stop mic
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Add user answer
    setChatHistory((prev) => [
      ...prev,
      { sender: "user", message: answer },
    ]);

    const userAnswer = answer;
    setAnswer("");

    setProcessingMessage("⏳ Evaluating your answer...");

    const formData = new FormData();
    formData.append("answer", userAnswer);

    try {
      const res = await axios.post("http://localhost:5000/answer", formData);

      setProcessingMessage("");

      if (res.data.end) {
        setEnded(true);
        setResult(res.data);
        setStarted(false);
        setIsProcessing(false);
        return;
      }

      // Show evaluation first
      setChatHistory((prev) => [
        ...prev,
        { sender: "eval", message: res.data.evaluation },
      ]);

      // Wait before next question
      setProcessingMessage("🤖 Preparing next question...");

      setTimeout(() => {
        setProcessingMessage("");

        setChatHistory((prev) => [
          ...prev,
          { sender: "bot", message: res.data.question },
        ]);

        // 🔊 Speak AFTER everything
        speak(res.data.question);

        setIsProcessing(false);
      }, 1200);

    } catch (err) {
      console.error(err);
      setProcessingMessage("");
      setIsProcessing(false);
    }
  };

  return (
    <div className="main-layout">

      {/* LEFT PANEL */}
      <div className="left-panel">
        <h2 className="title">🎤 AI Voice Interview</h2>

        <label className="label">Job Description</label>
        <textarea
          className="input-box"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />

        <label className="label">Upload Resume</label>
        <input
          type="file"
          className="file-input"
          onChange={(e) => setResume(e.target.files[0])}
        />

        <button className="btn start-btn" onClick={startInterview}>
          Start Interview
        </button>
      </div>

      {/* RIGHT PANEL */}
      <div className="right-panel">
        <div className="chat-container">

          {/* CHAT */}
          <div className="chat-box">

            {!started && !ended && (
              <p className="welcome-text">
                👋 Start interview to begin
              </p>
            )}

            {chatHistory.map((chat, index) => (
              <div
                key={index}
                className={`chat-message ${
                  chat.sender === "bot"
                    ? "bot-message"
                    : chat.sender === "user"
                    ? "user-message"
                    : chat.message === "Correct"
                    ? "correct-message"
                    : "wrong-message"
                }`}
              >
                {chat.message}
              </div>
            ))}

            {processingMessage && (
              <div className="chat-message bot-message">
                {processingMessage}
              </div>
            )}
          </div>

          {/* INPUT AREA */}
          {started && !ended && (
            <div className="chat-input-area">

              <p style={{ color: "#ccc" }}>
                🎤 Speak or type your answer:
              </p>

              <textarea
                className="answer-box"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />

              {/* SEND */}
              <button
                className="send-btn"
                onClick={submitAnswer}
                disabled={isProcessing}
              >
                Send ➤
              </button>

              {/* MIC */}
              <button
                className="send-btn"
                style={{ right: "140px", background: "#ffc107" }}
                onClick={startListening}
                disabled={isProcessing}
              >
                🎤 Speak
              </button>
            </div>
          )}

          {/* RESULT */}
          {ended && result && (
            <div className="final-result">
              <h3>Interview Completed 🎉</h3>
              <p>Score: {result.score}</p>
              <p>Percentage: {result.percentage}%</p>
              <p>{result.feedback}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;