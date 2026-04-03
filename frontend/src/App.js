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
  const [isListening, setIsListening] = useState(false);

  const [helperText, setHelperText] = useState("");

  const recognitionRef = useRef(null);
  const hasSpokenRef = useRef(false);

  // 🎤 Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("❌ Use Google Chrome for voice feature");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let transcript = "";

      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      setAnswer(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  // 🔊 Speak ONLY ONCE + show helper text
  const speak = (text) => {
    if (hasSpokenRef.current) return;

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);

    speech.onend = () => {
      setHelperText("👉 Please answer the above question");
    };

    window.speechSynthesis.speak(speech);

    hasSpokenRef.current = true;
  };

  // 🚀 Start Interview
  const startInterview = async () => {
    if (!jd || !resume) {
      alert("Enter JD and upload resume");
      return;
    }

    const formData = new FormData();
    formData.append("job_description", jd);
    formData.append("resume", resume);

    const res = await axios.post("http://localhost:8000/start", formData);

    setStarted(true);
    setEnded(false);

    setChatHistory([
      { sender: "bot", message: res.data.question }
    ]);

    hasSpokenRef.current = false;
    setHelperText("");

    speak(res.data.question);
  };

  // 🎤 Start Listening
  const startListening = () => {
    if (!recognitionRef.current || isListening) return;

    setAnswer("");
    recognitionRef.current.start();
  };

  // 📤 Submit Answer
  const submitAnswer = async () => {
    if (!answer.trim()) {
      alert("Enter answer");
      return;
    }

    setIsProcessing(true);
    recognitionRef.current?.stop();

    setChatHistory((prev) => [
      ...prev,
      { sender: "user", message: answer },
    ]);

    const userAnswer = answer;
    setAnswer("");
    setHelperText("");

    setProcessingMessage("⏳ Evaluating your answer...");

    const formData = new FormData();
    formData.append("answer", userAnswer);

    try {
      const res = await axios.post("http://localhost:8000/answer", formData);

      setProcessingMessage("");

      if (res.data.end) {
        setEnded(true);
        setResult(res.data);
        setStarted(false);
        setIsProcessing(false);
        return;
      }

      setChatHistory((prev) => [
        ...prev,
        { sender: "eval", message: res.data.evaluation },
      ]);

      setProcessingMessage("🤖 Preparing next question...");

      setTimeout(() => {
        setProcessingMessage("");

        setChatHistory((prev) => [
          ...prev,
          { sender: "bot", message: res.data.question },
        ]);

        // 🔥 Reset speech control
        hasSpokenRef.current = false;
        setHelperText("");

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

        <textarea
          className="input-box"
          placeholder="Paste Job Description..."
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />

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

            {/* ✅ HELPER TEXT AFTER SPEECH */}
            {helperText && (
              <div className="chat-message bot-message">
                {helperText}
              </div>
            )}

            {processingMessage && (
              <div className="chat-message bot-message">
                {processingMessage}
              </div>
            )}
          </div>

          {/* INPUT */}
          {started && !ended && (
            <div className="chat-input-area">

              <textarea
                className="answer-box"
                placeholder="Type or speak your answer..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />

              {isListening && (
                <p style={{ color: "yellow" }}>
                  🎤 Listening...
                </p>
              )}

              <button
                className="send-btn"
                onClick={submitAnswer}
                disabled={isProcessing}
              >
                Send ➤
              </button>

              <button
                className="send-btn"
                style={{ right: "140px", background: "#ffc107" }}
                onClick={startListening}
                disabled={isProcessing || isListening}
              >
                {isListening ? "🎤 Listening..." : "🎤 Speak"}
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