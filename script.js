// --- Simple state layer (localStorage-backed) ---
const state = {
  tasks: JSON.parse(localStorage.getItem('sra_tasks') || '[]'),
  quiz: JSON.parse(localStorage.getItem('sra_quiz') || '[]'),
  notes: localStorage.getItem('sra_notes') || '',
  team: {
    name: localStorage.getItem('sra_team_name') || '',
    feed: JSON.parse(localStorage.getItem('sra_team_feed') || '[]')
  },
  metrics: JSON.parse(localStorage.getItem('sra_metrics') || '{"accuracy":null,"efficiency":null}'),
  chat: JSON.parse(localStorage.getItem('sra_chat') || '[]')
};
const save = () => {
  localStorage.setItem('sra_tasks', JSON.stringify(state.tasks));
  localStorage.setItem('sra_quiz', JSON.stringify(state.quiz));
  localStorage.setItem('sra_notes', state.notes || '');
  localStorage.setItem('sra_team_name', state.team.name || '');
  localStorage.setItem('sra_team_feed', JSON.stringify(state.team.feed));
  localStorage.setItem('sra_metrics', JSON.stringify(state.metrics));
  localStorage.setItem('sra_chat', JSON.stringify(state.chat));
  renderAll();
};

// --- Basic navigation ---
const sections = ["Dashboard", "Planner", "Quiz Center", "AI Tutor", "Collaboration"];
const navEl = document.getElementById('nav');
sections.forEach(s => {
  const btn = document.createElement('button');
  btn.textContent = s;
  btn.onclick = () => showView(s);
  navEl.appendChild(btn);
});
function showView(name) {
  sections.forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== name);
  });
  [...navEl.children].forEach(b => b.classList.toggle('active', b.textContent === name));
}
showView('Dashboard');

// --- Utility helpers ---
const fmtDate = d => new Date(d).toLocaleDateString();
const daysUntil = d => Math.ceil((new Date(d) - new Date()) / (1000*60*60*24));
const priorityScore = p => ({Low:1, Medium:2, High:3}[p] || 1);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;

// --- AI Integration ---
const API_BASE = 'http://localhost:8001/api';

async function apiCall(endpoint, data) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

async function generateAIQuiz(notes, topic = '', difficulty = 'medium') {
  const data = { notes, topic, difficulty, num_questions: 5 };
  return await apiCall('/generate-quiz', data);
}

async function summarizeNotes(notes, maxLength = 200) {
  const data = { notes, max_length: maxLength };
  const result = await apiCall('/summarize-notes', data);
  return result.summary;
}

async function chatWithTutor(message, context = '') {
  const data = { message, context };
  const result = await apiCall('/chat', data);
  return result.response;
}

async function getStudyRecommendations() {
  const data = {
    tasks: state.tasks,
    user_progress: {
      accuracy: state.metrics.accuracy,
      efficiency: state.metrics.efficiency
    }
  };
  return await apiCall('/study-recommendations', data);
}

// --- Notifications ---
const notifListEl = document.getElementById('notifList');
document.getElementById('btnGenerateNotif').onclick = () => {
  const dueSoon = state.tasks.filter(t => daysUntil(t.due) <= 3);
  const msgs = dueSoon.map(t => `Reminder: "${t.title}" due in ${daysUntil(t.due)} day(s).`);
  if (msgs.length === 0) msgs.push("No urgent tasks. Consider reviewing summaries today.");
  notifListEl.innerHTML = msgs.map(m => `<div class="card">${m}</div>`).join('');
};
document.getElementById('btnClearNotif').onclick = () => {
  notifListEl.innerHTML = '';
  // Re-add persistent task notifications
  const incompleteTasks = state.tasks.filter(t => (t.progress || 0) < 100);
  incompleteTasks.forEach(task => {
    const reminderText = `⏰ Reminder: "${task.title}" is ${Math.round(task.progress || 0)}% complete. Due ${fmtDate(task.due)}.`;
    const item = document.createElement('div');
    item.className = 'card';
    item.textContent = reminderText;
    notifListEl.appendChild(item);
  });
};

function renderDashboard() {
  const thisWeek = state.tasks.filter(t => daysUntil(t.due) <= 7);
  document.getElementById('statDue').textContent = thisWeek.length;

  const acc = state.metrics.accuracy;
  const eff = state.metrics.efficiency;
  const accEl = document.getElementById('statAccuracy');
  accEl.textContent = acc == null ? '—' : `${Math.round(acc)}%`;
  accEl.className = 'pill ' + (acc >= 80 ? 'good' : acc >= 50 ? 'warn' : 'bad');

  const effEl = document.getElementById('statEfficiency');
  effEl.textContent = eff == null ? '—' : `${Math.round(eff)}%`;
  effEl.className = 'pill ' + (eff >= 70 ? 'good' : eff >= 40 ? 'warn' : 'bad');

  // Upcoming table
  const tbody = document.querySelector('#tableUpcoming tbody');
  const sorted = [...state.tasks].sort((a,b) => new Date(a.due)-new Date(b.due));
  tbody.innerHTML = sorted.slice(0,8).map(t => `
        <tr onclick="showView('Planner')" style="cursor:pointer">
          <td>${t.title}</td>
          <td>${fmtDate(t.due)}</td>
          <td><span class="pill ${t.priority==='High'?'bad':t.priority==='Medium'?'warn':'good'}">${t.priority}</span></td>
          <td>${t.progress === 100 ? '<span class="pill good">✅ Completed</span>' : Math.round(t.progress||0) + '%'}</td>
        </tr>
      `).join('');

  // Persistent notifications for incomplete tasks
  const notifListEl = document.getElementById('notifList');
  const incompleteTasks = state.tasks.filter(t => (t.progress || 0) < 100);
  const existingNotifs = Array.from(notifListEl.children).map(c => c.textContent);

  incompleteTasks.forEach(task => {
    const reminderText = `⏰ Reminder: "${task.title}" is ${Math.round(task.progress || 0)}% complete. Due ${fmtDate(task.due)}.`;
    if (!existingNotifs.some(n => n.includes(task.title))) {
      const item = document.createElement('div');
      item.className = 'card';
      item.textContent = reminderText;
      notifListEl.appendChild(item);
    }
  });

  renderMiniChart();
}

// --- Mini chart (canvas) ---
function renderMiniChart() {
  const canvas = document.getElementById('miniChart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.width, h = canvas.height;

  // Create gradient for bars
  const barGradient = ctx.createLinearGradient(0, h-20, 0, 10);
  barGradient.addColorStop(0, '#22d3ee');
  barGradient.addColorStop(1, '#a78bfa');

  // Subtle grid
  ctx.strokeStyle = 'rgba(31,41,55,0.3)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 5; i++) {
    const y = 10 + (h-30)/4 * i;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(w-10, y);
    ctx.stroke();
  }

  // Axes with labels
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(30, h-20);
  ctx.lineTo(w-10, h-20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(30, 10);
  ctx.lineTo(30, h-20);
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText('0%', 10, h-15);
  ctx.fillText('100%', 10, 20);
  ctx.fillText('Days', w/2 - 20, h-5);

  // Data: generate synthetic efficiency trend
  const points = Array.from({length: 12}, (_,i)=>{
    const base = 40 + i*3;
    const variability = rand(-10, 15);
    return clamp(base + variability, 20, 95);
  });

  const barWidth = (w-50)/(points.length) * 0.8;
  const xStep = (w-50)/(points.length);

  // Draw bars
  points.forEach((p,i)=>{
    const x = 30 + i*xStep + (xStep - barWidth)/2;
    const barHeight = (p/100)*(h-40);
    const y = h-20 - barHeight;

    // Bar
    ctx.fillStyle = barGradient;
    ctx.fillRect(x, y, barWidth, barHeight);

    // Bar border
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barWidth, barHeight);
  });

  // Tooltip on hover
  let currentTooltip = null;
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let hovered = null;
    points.forEach((p,i)=>{
      const x = 30 + i*xStep + (xStep - barWidth)/2;
      const barHeight = (p/100)*(h-40);
      const y = h-20 - barHeight;
      if (mouseX >= x && mouseX <= x + barWidth && mouseY >= y && mouseY <= h-20) {
        hovered = {x: x + barWidth/2, y: y, value: p, index: i};
      }
    });

    if (hovered !== currentTooltip) {
      // Clear previous tooltip
      if (currentTooltip) {
        ctx.clearRect(currentTooltip.tx - 2, currentTooltip.ty - 2, currentTooltip.tooltipWidth + 4, currentTooltip.tooltipHeight + 4);
        // Redraw the bar area if tooltip was over a bar
        const idx = currentTooltip.index;
        const x = 30 + idx*xStep + (xStep - barWidth)/2;
        const barHeight = (points[idx]/100)*(h-40);
        const y = h-20 - barHeight;
        ctx.fillStyle = barGradient;
        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
      }

      currentTooltip = hovered;

      if (hovered) {
        // Tooltip
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1;
        const tooltipWidth = 60;
        const tooltipHeight = 25;
        const tx = hovered.x - tooltipWidth/2;
        const ty = hovered.y - tooltipHeight - 10;

        ctx.fillRect(tx, ty, tooltipWidth, tooltipHeight);
        ctx.strokeRect(tx, ty, tooltipWidth, tooltipHeight);

        ctx.fillStyle = '#e5e7eb';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(hovered.value)}%`, hovered.x, ty + 16);
        ctx.textAlign = 'left';

        currentTooltip.tx = tx;
        currentTooltip.ty = ty;
        currentTooltip.tooltipWidth = tooltipWidth;
        currentTooltip.tooltipHeight = tooltipHeight;
      }
    }
  };

  canvas.onmouseleave = () => {
    if (currentTooltip) {
      ctx.clearRect(currentTooltip.tx - 2, currentTooltip.ty - 2, currentTooltip.tooltipWidth + 4, currentTooltip.tooltipHeight + 4);
      // Redraw the bar
      const idx = currentTooltip.index;
      const x = 30 + idx*xStep + (xStep - barWidth)/2;
      const barHeight = (points[idx]/100)*(h-40);
      const y = h-20 - barHeight;
      ctx.fillStyle = barGradient;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, barWidth, barHeight);
      currentTooltip = null;
    }
  };
}

// --- Planner ---
document.getElementById('btnAddTask').onclick = () => {
  const title = document.getElementById('taskTitle').value.trim();
  const notes = document.getElementById('taskNotes').value.trim();
  const due = document.getElementById('taskDue').value;
  const priority = document.getElementById('taskPriority').value;
  if(!title || !due) { alert('Please provide task title and due date'); return; }
  state.tasks.push({ id: crypto.randomUUID(), title, notes, due, priority, progress: 0 });
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskNotes').value = '';
  document.getElementById('taskDue').value = '';
  save();
};

function renderPlanner() {
  const tbody = document.querySelector('#tablePlanner tbody');
  const sorted = [...state.tasks].sort((a,b)=>{
    const d = new Date(a.due) - new Date(b.due);
    if (d !== 0) return d;
    return priorityScore(b.priority) - priorityScore(a.priority);
  });
  tbody.innerHTML = sorted.map(t => `
    <tr>
      <td>${t.title}</td>
      <td>${fmtDate(t.due)}</td>
      <td><span class="pill ${t.priority==='High'?'bad':t.priority==='Medium'?'warn':'good'}">${t.priority}</span></td>
      <td>
        ${t.progress === 100 ? '<span class="pill good">✅ Completed</span>' : `
        <input type="range" min="0" max="100" value="${t.progress||0}" data-id="${t.id}" class="progressRange" style="--progress: ${t.progress||0}%;" />
        <span style="margin-left:8px">${Math.round(t.progress||0)}%</span>
        `}
      </td>
      <td>
        <button class="btn secondary" data-id="${t.id}" data-action="del">Delete</button>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('.progressRange').forEach(r=>{
    r.oninput = (e) => {
      const id = e.target.getAttribute('data-id');
      const t = state.tasks.find(x=>x.id===id);
      const oldProgress = t.progress || 0;
      t.progress = Number(e.target.value);
      // Update the progress variable
      e.target.style.setProperty('--progress', `${t.progress}%`);
      state.metrics.efficiency = computeEfficiency();
      if (t.progress === 100 && oldProgress < 100) {
        // Task completed
        const notifListEl = document.getElementById('notifList');
        const congrats = document.createElement('div');
        congrats.className = 'card';
        congrats.innerHTML = `🎉 Congratulations! You completed "${t.title}"!`;
        notifListEl.appendChild(congrats);
        // Auto-remove after 5 seconds
        setTimeout(() => congrats.remove(), 5000);
      }
      save();
    };
  });
  tbody.querySelectorAll('button[data-action="del"]').forEach(b=>{
    b.onclick = (e) => {
      const id = e.target.getAttribute('data-id');
      state.tasks = state.tasks.filter(x=>x.id!==id);
      save();
    };
  });
}

function computeEfficiency() {
  if(state.tasks.length===0) return null;
  const avg = state.tasks.reduce((s,t)=>s+(t.progress||0),0)/state.tasks.length;
  return clamp(avg, 0, 100);
}

document.getElementById('btnGeneratePlan').onclick = async () => {
  const box = document.getElementById('planSuggestions');

  // Show loading
  box.innerHTML = '<div class="card">🤖 AI is analyzing your progress and generating recommendations...</div>';

  try {
    const result = await getStudyRecommendations();
    const recommendations = result.recommendations.map(rec => `<div class="card">💡 ${rec}</div>`).join('');
    const schedule = Object.entries(result.schedule).map(([day, activities]) =>
      `<div class="card"><strong>${day}:</strong> ${activities.join(', ')}</div>`
    ).join('');

    box.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h4>AI Study Recommendations:</h4>
        ${recommendations}
      </div>
      <div>
        <h4>Suggested Schedule:</h4>
        ${schedule}
      </div>
    `;
  } catch (error) {
    box.innerHTML = '<div class="card">❌ Failed to get AI recommendations. Please check if the backend is running.</div>';
    console.error('Study plan error:', error);
  }
};
document.getElementById('btnClearPlan').onclick = () => {
  document.getElementById('planSuggestions').innerHTML = '';
};

function adaptivePlan(tasks) {
  const today = new Date().toLocaleDateString();
  const sorted = [...tasks].sort((a,b)=>{
    const du = daysUntil(a.due) - daysUntil(b.due);
    if(du!==0) return du;
    return priorityScore(b.priority) - priorityScore(a.priority);
  });
  const slots = ["08:00","09:30","11:00","14:00","16:00","19:00","21:00"];
  return sorted.slice(0,7).map((t,i)=>({
    time: `${today} ${slots[i]}`,
    activity: `${t.title} — ${t.priority} priority — focus ${t.progress<50?'learning':'revision'} (${t.progress}% done)`
  }));
}

// --- Quiz Center ---
document.getElementById('fileInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if(ext==='pdf'){
    alert('PDF preview not supported in this demo. Please upload .txt or paste notes.');
    return;
  }
  const text = await file.text();
  state.notes = (state.notes || '') + '\n' + text;
  save();
  document.getElementById('rawNotes').value = state.notes;
});

document.getElementById('btnFetchUrl').onclick = async () => {
  const url = document.getElementById('urlInput').value.trim();
  if(!url) { alert('Enter a URL'); return; }
  try {
    const response = await fetch(url);
    const html = await response.text();
    // Simple text extraction (remove tags)
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    state.notes = (state.notes || '') + '\n' + text;
    save();
    document.getElementById('rawNotes').value = state.notes;
    alert('Content fetched and added to notes.');
  } catch (error) {
    alert('Failed to fetch URL: ' + error.message);
  }
};

document.getElementById('btnSummarize').onclick = async () => {
  const text = (document.getElementById('rawNotes').value || '').trim();
  if(!text) { alert('Paste notes first'); return; }
  state.notes = text;

  // Show loading
  document.getElementById('summaryBox').innerHTML = '<div class="card">🤖 AI is summarizing your notes...</div>';

  try {
    const summary = await summarizeNotes(text);
    document.getElementById('summaryBox').innerHTML = `<div class="card"><strong>AI Summary:</strong><br>${summary}</div>`;
  } catch (error) {
    document.getElementById('summaryBox').innerHTML = '<div class="card">❌ Failed to summarize. Please check if the AI backend is running.</div>';
    console.error('Summarization error:', error);
  }

  save();
};

document.getElementById('btnGenerateQuiz').onclick = async () => {
  const text = (document.getElementById('rawNotes').value || '').trim();
  if(!text) { alert('Paste notes first'); return; }
  state.notes = text;

  // Show loading
  document.getElementById('quizBox').innerHTML = '<div class="card">🤖 AI is generating your quiz...</div>';

  try {
    const result = await generateAIQuiz(text);
    state.quiz = result.questions.map(q => ({
      type: q.type === 'multiple_choice' ? 'mcq' : 'short',
      prompt: q.question,
      options: q.options || [],
      answer: q.correct_answer,
      explanation: q.explanation
    }));
    state.quizSubmitted = false;
    renderQuiz();
  } catch (error) {
    document.getElementById('quizBox').innerHTML = '<div class="card">❌ Failed to generate quiz. Please check if the AI backend is running.</div>';
    console.error('Quiz generation error:', error);
  }

  save();
};

document.getElementById('btnSubmitQuiz').onclick = () => {
  const answers = [];
  document.querySelectorAll('[data-qidx]').forEach(el=>{
    const idx = Number(el.getAttribute('data-qidx'));
    if(el.type==='radio'){
      if(el.checked) answers[idx] = el.value;
    } else if(el.tagName==='INPUT' || el.tagName==='TEXTAREA') {
      answers[idx] = el.value.trim();
    }
  });
  const score = scoreQuiz(state.quiz, answers);
  state.metrics.accuracy = score*100;
  state.quizSubmitted = true;
  state.quizAnswers = answers;
  renderQuiz();
  save();
};

function renderQuiz() {
  const box = document.getElementById('quizBox');
  if(!state.quiz || state.quiz.length===0) { box.innerHTML = '<div class="card">No quiz generated yet.</div>'; return; }

  let html = '';
  if(state.quizSubmitted){
    html += `<div class="card"><h3>Quiz Results</h3><p>Your score: <strong>${Math.round(state.metrics.accuracy)}%</strong></p></div>`;
    html += state.quiz.map((q,idx)=>{
      const userAnswer = state.quizAnswers[idx] || '';
      const isCorrect = checkAnswer(q, userAnswer);
      const status = isCorrect ? 'correct' : 'incorrect';
      let questionHtml = `<div class="card ${status}"><b>Q${idx+1} (${q.type.toUpperCase()}):</b> ${q.prompt}<br>`;
      questionHtml += `<strong>Your answer:</strong> ${userAnswer || 'No answer'}<br>`;
      questionHtml += `<strong>Correct answer:</strong> ${q.answer}<br>`;
      if(q.explanation) questionHtml += `<em>Explanation:</em> ${q.explanation}`;
      questionHtml += '</div>';
      return questionHtml;
    }).join('');
    html += '<div class="row" style="margin-top:10px"><button class="btn" id="btnRetakeQuiz">Retake Quiz</button></div>';
  } else {
    html = state.quiz.map((q,idx)=>{
      if(q.type==='mcq'){
        const opts = q.options.map(o=>`
          <label style="display:block; margin-bottom:6px">
            <input type="radio" name="q${idx}" value="${o}" data-qidx="${idx}" /> ${o}
          </label>
        `).join('');
        return `<div class="card"><b>Q${idx+1} (MCQ):</b> ${q.prompt}<div style="margin-top:8px">${opts}</div></div>`;
      } else if(q.type==='short'){
        return `<div class="card"><b>Q${idx+1} (Short Answer):</b> ${q.prompt}<input data-qidx="${idx}" placeholder="Your answer" /> </div>`;
      } else {
        return `<div class="card"><b>Q${idx+1} (Fill-in):</b> ${q.prompt}<textarea data-qidx="${idx}" placeholder="Your answer"></textarea></div>`;
      }
    }).join('');
  }
  box.innerHTML = html;

  if(state.quizSubmitted){
    document.getElementById('btnRetakeQuiz').onclick = () => {
      state.quizSubmitted = false;
      state.quizAnswers = [];
      renderQuiz();
    };
  }
}

// --- AI Tutor Chat ---
document.getElementById('btnSendChat').onclick = async () => {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  // Add user message to chat
  state.chat.push({ role: 'user', message, timestamp: new Date().toISOString() });
  renderChat();

  // Clear input
  input.value = '';

  // Show typing indicator
  const chatHistory = document.getElementById('chatHistory');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'card';
  typingDiv.innerHTML = '<strong>🤖 AI Tutor:</strong> Thinking...';
  typingDiv.id = 'typingIndicator';
  chatHistory.appendChild(typingDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    // Get context from current notes
    const context = state.notes || '';
    const response = await chatWithTutor(message, context);

    // Remove typing indicator
    document.getElementById('typingIndicator').remove();

    // Add AI response to chat
    state.chat.push({ role: 'assistant', message: response, timestamp: new Date().toISOString() });
    renderChat();
  } catch (error) {
    // Remove typing indicator
    document.getElementById('typingIndicator').remove();

    // Add error message
    state.chat.push({
      role: 'assistant',
      message: 'Sorry, I\'m having trouble connecting to the AI service. Please check if the backend is running.',
      timestamp: new Date().toISOString()
    });
    renderChat();
    console.error('Chat error:', error);
  }

  save();
};

document.getElementById('btnClearChat').onclick = () => {
  state.chat = [];
  renderChat();
  save();
};

function renderChat() {
  const chatHistory = document.getElementById('chatHistory');
  // Remove consecutive duplicate messages (same role and text) to avoid echoed responses
  const filtered = [];
  for (const msg of state.chat) {
    const last = filtered.length ? filtered[filtered.length - 1] : null;
    if (last && last.role === msg.role && last.message && msg.message && last.message.trim() === msg.message.trim()) {
      // skip duplicate consecutive message
      continue;
    }
    filtered.push(msg);
  }

  const messages = filtered.map(msg => `
    <div class="card">
      <strong>${msg.role === 'user' ? '👤 You' : '🤖 AI Tutor'}:</strong> ${msg.message}
      <div style="font-size: 0.8em; color: #666; margin-top: 4px;">
        ${new Date(msg.timestamp).toLocaleTimeString()}
      </div>
    </div>
  `).join('');

  chatHistory.innerHTML = messages;
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

// --- Naive AI: Summarization & Quiz generation (client-side heuristics) ---
function summarize(text) {
  const sentences = text.split(/[\.\n]+/).map(s=>s.trim()).filter(Boolean);
  const keyLines = sentences
    .sort((a,b)=> scoreLine(b) - scoreLine(a))
    .slice(0, Math.min(6, Math.max(3, Math.floor(sentences.length/6))));
  return dedupe(keyLines);
}
function scoreLine(s) {
  const len = s.length;
  const keywords = ['definition','important','key','concept','algorithm','time complexity','example','steps','note','summary'];
  const kwScore = keywords.reduce((acc,k)=> acc + (s.toLowerCase().includes(k)?2:0), 0);
  return kwScore + clamp(len/80, 0, 3);
}
function dedupe(arr) {
  const seen = new Set(); return arr.filter(x=>{ const k = x.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
}

function generateQuiz(text) {
  const sentences = text.split(/[\.\n!?]+/).map(s=>s.trim()).filter(Boolean).filter(s=>s.length>10);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const uniqueWords = Array.from(new Set(words.map(w=>w.replace(/[^\w]/g,'')))).filter(w=>w.length>3);

  // Find key terms: words that appear frequently
  const wordFreq = {};
  words.forEach(w => {
    const clean = w.replace(/[^\w]/g,'');
    if(clean.length>3) wordFreq[clean] = (wordFreq[clean] || 0) + 1;
  });
  const keyTerms = Object.keys(wordFreq).sort((a,b)=>wordFreq[b]-wordFreq[a]).slice(0,10);

  const qs = [];

  // MCQ: Fill in the blank from sentences containing key terms
  const suitableSentences = sentences.filter(s => {
    const sWords = s.toLowerCase().split(/\s+/).map(w=>w.replace(/[^\w]/g,''));
    return sWords.some(w => keyTerms.includes(w));
  });

  for(let i=0; i<Math.min(3, suitableSentences.length); i++){
    const sentence = suitableSentences[i];
    const sWords = sentence.split(/\s+/);
    // Find a key term in the sentence to blank
    let blankIdx = -1;
    for(let j=0; j<sWords.length; j++){
      const clean = sWords[j].toLowerCase().replace(/[^\w]/g,'');
      if(keyTerms.includes(clean)){
        blankIdx = j;
        break;
      }
    }
    if(blankIdx === -1) continue;
    const correct = sWords[blankIdx].replace(/[^\w]/g,'');
    const prompt = sentence.replace(sWords[blankIdx], '_____');
    // Distractors: other key terms
    const distractors = keyTerms.filter(w=>w!==correct.toLowerCase()).slice(0,3);
    const options = [correct, ...distractors].slice(0,4).sort();
    qs.push({
      type:'mcq',
      prompt: `Complete the sentence: ${prompt}`,
      options,
      answer: correct,
      explanation: `This term is key in your notes.`
    });
  }

  // Short answer: Ask about key terms
  for(let i=0; i<Math.min(2, keyTerms.length); i++){
    const term = keyTerms[i];
    qs.push({
      type:'short',
      prompt: `Explain the significance of "${term}" in your study material.`,
      answer: term,
      explanation: `This is one of the most mentioned concepts.`
    });
  }

  // True/False: Based on a sentence from notes
  if(sentences.length > 0){
    const sent = sentences[Math.floor(Math.random()*sentences.length)];
    qs.push({
      type:'short',
      prompt: `True or False: ${sent}`,
      answer: 'True',
      explanation: `This is a direct statement from your notes.`
    });
  }

  // Fill-in: List key terms
  if(keyTerms.length >= 3){
    qs.push({
      type:'short',
      prompt: `Name 3 important terms from your notes.`,
      answer: keyTerms.slice(0,3).join(', '),
      explanation: `These are the top terms by frequency.`
    });
  }

  return qs.slice(0,6);
}

function checkAnswer(q, userAnswer) {
  const gold = (q.answer || '').toLowerCase().trim();
  const ans = (userAnswer || '').toLowerCase().trim();

  if (!ans) return false; // Unanswered is incorrect

  if(q.type === 'mcq'){
    return ans === gold;
  } else if(q.type === 'short'){
    // For short answers, check if answer contains key term or is close
    return ans.includes(gold) || gold.includes(ans) || levenshtein(ans, gold) <= 2;
  }
  return false;
}

// Simple Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function scoreQuiz(quiz, answers) {
  if(!quiz || quiz.length===0) return 0;
  let correct = 0;
  quiz.forEach((q,idx)=>{
    if(checkAnswer(q, answers[idx])) correct++;
  });
  return correct / quiz.length;
}

// --- Collaboration ---
document.getElementById('btnPostNote').onclick = () => {
  const name = document.getElementById('teamName').value.trim();
  const note = document.getElementById('teamNote').value.trim();
  if(!name || !note) { alert('Enter team name and a note'); return; }
  state.team.name = name;
  state.team.feed.unshift({ id: crypto.randomUUID(), text: note, ts: new Date().toLocaleString() });
  save();
  document.getElementById('teamNote').value = '';
};
document.getElementById('btnClearRoom').onclick = () => {
  state.team.feed = []; save();
};

function renderCollab() {
  document.getElementById('teamName').value = state.team.name || '';
  const feedEl = document.getElementById('roomFeed');
  feedEl.innerHTML = (state.team.feed||[]).map(n=>`
    <div class="card">
      <div style="font-size:12px; color:var(--muted)">${n.ts}</div>
      <div>${n.text}</div>
    </div>
  `).join('');
  // Shared deadlines mirror High-priority tasks
  const tbody = document.querySelector('#tableShared tbody');
  const shared = state.tasks.filter(t=>t.priority==='High').sort((a,b)=> new Date(a.due)-new Date(b.due));
  tbody.innerHTML = shared.map(t=>`
    <tr><td>${t.title}</td><td>${fmtDate(t.due)}</td><td>${t.priority}</td></tr>
  `).join('');
}

// --- Cross-render ---
function renderAll() {
  renderDashboard();
  renderPlanner();
  renderCollab();
  renderQuiz();
  renderChat();
}
renderAll();

// --- Background notifications every minute (demo) ---
setInterval(()=>{
  const urgent = state.tasks.filter(t => daysUntil(t.due) <= 1);
  if(urgent.length){
    const msg = `Urgent: ${urgent.length} task(s) due tomorrow!`;
    const item = document.createElement('div');
    item.className = 'card'; item.textContent = msg;
    notifListEl.prepend(item);
  }
}, 60000);