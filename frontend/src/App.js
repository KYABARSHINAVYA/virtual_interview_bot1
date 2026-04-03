import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Send,
  Upload,
  Briefcase,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  BrainCircuit,
  MessageSquare,
  Activity,
  History,
  Target,
  ArrowRight,
  TrendingUp,
  LayoutDashboard
} from "lucide-react";
import "./App.css";

// Path to the AI Avatar generated earlier
const AI_AVATAR = "/C:/Users/sridh/.gemini/antigravity/brain/70d9e178-de15-4ae7-a0a8-3b66890fdc8e/ai_interviewer_avatar_1775216049400.png";

function App() {
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState(null);
  const [resumeName, setResumeName] = useState("");

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
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, processingMessage]);

  // 🎤 Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setAnswer(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
  }, []);

  const speak = (text) => {
    if (hasSpokenRef.current) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.onend = () => setHelperText("Ready for your answer...");
    window.speechSynthesis.speak(speech);
    hasSpokenRef.current = true;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setResume(file);
      setResumeName(file.name);
    }
  };

  const startInterview = async () => {
    if (!jd || !resume) {
      alert("Executive Detail Missing: Please provide JD and Resume context.");
      return;
    }

    setIsProcessing(true);
    const formData = new FormData();
    formData.append("job_description", jd);
    formData.append("resume", resume);

    try {
      const res = await axios.post("http://localhost:8000/start", formData);

      if (res.data.error) {
        alert(res.data.question);
        setIsProcessing(false);
        return;
      }

      setStarted(true);
      setEnded(false);
      setChatHistory([{ sender: "bot", message: res.data.question }]);
      hasSpokenRef.current = false;
      setHelperText("");
      speak(res.data.question);
    } catch (err) {
      console.error(err);
      alert("❌ Connectivity Failure: AI Core unreachable.");
    } finally {
      setIsProcessing(false);
    }
  };

  const startListening = () => {
    if (!recognitionRef.current || isListening) return;
    setAnswer("");
    recognitionRef.current.start();
  };

  const submitAnswer = async () => {
    if (!answer.trim() || isProcessing) return;

    setIsProcessing(true);
    recognitionRef.current?.stop();

    const userAnswer = answer;
    setChatHistory((prev) => [...prev, { sender: "user", message: userAnswer }]);
    setAnswer("");
    setHelperText("");
    setProcessingMessage("Analysing...");

    const formData = new FormData();
    formData.append("answer", userAnswer);

    try {
      const res = await axios.post("http://localhost:8000/answer", formData);
      setProcessingMessage("");

      if (res.data.end) {
        setEnded(true);
        setResult(res.data);
        setStarted(false);
        return;
      }

      setChatHistory((prev) => [
        ...prev,
        { sender: "eval", message: res.data.evaluation },
      ]);

      setProcessingMessage("Generating next simulation...");
      setTimeout(() => {
        setProcessingMessage("");
        setChatHistory((prev) => [
          ...prev,
          { sender: "bot", message: res.data.question },
        ]);
        hasSpokenRef.current = false;
        speak(res.data.question);
      }, 1000);

    } catch (err) {
      console.error(err);
      setProcessingMessage("Sync error.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app-container">
      {/* SIDEBAR V4 */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <LayoutDashboard size={22} color="black" strokeWidth={3} />
          </div>
          <span className="brand-name">Interview.AI</span>
        </div>

        <div className="config-section">
          <div className="input-group">
            <label className="input-label">
              <Briefcase size={12} color="#fbbf24" strokeWidth={3} />
              Job Target Description
            </label>
            <textarea
              className="premium-textarea"
              placeholder="Paste requirements..."
              rows={6}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              disabled={started}
            />
          </div>

          <div className="input-group">
            <label className="input-label">
              <FileText size={12} color="#fbbf24" strokeWidth={3} />
              Applicant Credentials (CV)
            </label>
            <div className="file-upload-wrapper">
              <Upload size={24} color={resume ? "#fbbf24" : "#444"} strokeWidth={1.5} />
              <p style={{ fontSize: '0.7rem', marginTop: 12, color: '#666', fontWeight: 600 }}>
                {resumeName || "Upload PDF/DOCX Source"}
              </p>
              <input
                type="file"
                className="file-upload-input"
                onChange={handleFileChange}
                disabled={started}
              />
            </div>
          </div>

          {!started && !ended && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="start-button"
              onClick={startInterview}
              disabled={isProcessing}
            >
              {isProcessing ? "Connecting AI..." : <>Initialise Entry <Sparkles size={16} /></>}
            </motion.button>
          )}

          {(started || ended) && (
            <div className="stat-item" style={{ marginTop: 'auto', background: 'rgba(251, 191, 36, 0.05)', borderColor: 'rgba(251, 191, 36, 0.2)' }}>
              <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
                <TrendingUp size={14} color="#fbbf24" />
                <span style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing: '0.05em', color: '#fbbf24' }}>SESSION LIVE</span>
              </div>
              <p style={{ fontSize: '1rem', fontWeight: 800, marginTop: 8 }}>Tier-1 Expert Mode</p>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN V4 */}
      <main className="main-content">
        <div className="chat-viewport">
          <AnimatePresence>
            {!started && !ended && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="result-card"
                style={{ margin: 'auto', border: 'none', background: 'transparent' }}
              >
                <div style={{ width:80, height:80, background:'rgba(251, 191, 36, 0.1)', borderRadius:'24px', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 2rem' }}>
                  <BrainCircuit size={40} color="#fbbf24" />
                </div>
                <h1 style={{ fontSize: '3.5rem', fontWeight: 900, marginBottom: 20, letterSpacing: '-0.06em' }}>Elite AI Simulation.</h1>
                <p style={{ color: '#888', fontSize: '1.25rem', maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>
                  An advanced neural assessment for high-performance roles. 
                  Provide your context to initialize the expert protocol.
                </p>
              </motion.div>
            )}

            {chatHistory.map((chat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`message-wrapper ${chat.sender === "user" ? "user-wrapper" : "bot-wrapper"}`}
              >
                <div className="avatar" style={{
                  background: chat.sender === "user" ? "var(--yellow-glow)" : `url(${AI_AVATAR}) center/cover`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, color: '#000'
                }}>
                  {chat.sender === "user" ? "U" : ""}
                </div>
                <div className="msg-box" style={{ width: '100%' }}>
                  {chat.sender === "eval" && (
                    <div className={`eval-badge ${chat.message === "Correct" ? "correct-badge" : "wrong-badge"}`}>
                      {chat.message === "Correct" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                      {chat.message} Answer
                    </div>
                  )}
                  <div className={`message-bubble ${chat.sender === "user" ? "user-bubble" : "bot-bubble"}`}>
                    {chat.message}
                  </div>
                </div>
              </motion.div>
            ))}

            {processingMessage && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="message-wrapper bot-wrapper">
                <div className="avatar" style={{ background: `url(${AI_AVATAR}) center/cover` }} />
                <div className="bot-bubble message-bubble" style={{ fontStyle: 'italic', color: '#666', borderStyle: 'dashed' }}>
                  {processingMessage}
                </div>
              </motion.div>
            )}

            {ended && result && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="result-card"
              >
                 <div style={{ display:'flex', justifyContent:'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
                    <div style={{ textAlign:'left' }}>
                        <h3 style={{ fontSize:'1.5rem', fontWeight:800, marginBottom: 4 }}>Expert Audit Complete.</h3>
                        <p style={{ color:'#666', fontWeight: 600 }}>Performance Metrics Summary</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:'3.5rem', fontWeight:900, color: 'var(--yellow-glow)', lineHeight: 1 }}>{result.percentage}%</div>
                        <p style={{ fontSize:'0.75rem', fontWeight:800, color:'#fbbf24', letterSpacing:'0.1em', marginTop: 8 }}>ELITE SCORE</p>
                    </div>
                 </div>
                
                <div style={{ padding: '2rem', background: '#080808', borderRadius: '20px', border: '1px solid rgba(251, 191, 36, 0.1)', textAlign: 'left', marginBottom: '3rem' }}>
                    <p style={{ color: '#bbb', lineHeight: 1.8, fontSize: '1.05rem' }}>{result.feedback}</p>
                </div>
                
                <button className="start-button" style={{ width: '250px', marginInline: 'auto' }} onClick={() => window.location.reload()}>
                  Restart Protocol
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

        {/* INPUT DOCK V4 */}
        <div className="input-dock">
          {started && !ended && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              style={{ width:'100%', display:'flex', alignItems: 'center', gap: '1.5rem' }}
            >
              <button
                className={`icon-btn mic-btn ${isListening ? 'active' : ''}`}
                onClick={startListening}
                disabled={isProcessing}
              >
                <Mic size={22} strokeWidth={2.5} />
              </button>

              <input
                type="text"
                className="chat-input"
                placeholder={isListening ? "Auditory input live..." : (helperText || "Provide professional response...")}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && submitAnswer()}
                disabled={isProcessing}
              />

              <button
                className="icon-btn"
                onClick={submitAnswer}
                disabled={isProcessing || !answer.trim()}
                style={{ color: answer.trim() ? 'var(--yellow-glow)' : '#444' }}
              >
                <Send size={22} strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;