// Parse custom quiz data from URL
const urlParams = new URLSearchParams(window.location.search);
const customQuizParam = urlParams.get('quiz');
const roomParam = urlParams.get('room');

// Quiz Application Logic
class QuizApp {
    constructor() {
        this.roomId = null;
        this.isMultiplayer = false;
        this.socket = null; // Initialize socket property
        this.isHost = false; // Added to track if current client is host
        this.category = '';
        this.difficulty = '';
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.selectedOption = null;
        this.nickname = '';
        this.isCustom = false;
        this.customQuestions = [];
    }

    init() {
        this.bindLogin();
        if (customQuizParam) {
            this.isCustom = true;
            try { this.questions = JSON.parse(atob(customQuizParam)); } 
            catch (e) { alert('Invalid quiz data'); }
        } else if (roomParam) {
            this.isMultiplayer = true;
            this.roomId = roomParam;
        } else {
            this.bindModeSelection();
        }
    }

    bindLogin() {
        const input = document.getElementById('nickname-input');
        const btn = document.getElementById('nickname-submit');
        input.addEventListener('input', () => btn.disabled = !input.value.trim());
        btn.addEventListener('click', () => {
            this.nickname = input.value.trim();
            document.getElementById('login-section').style.display = 'none';
            if (this.isCustom) {
                this.startCustomFlow();
            } else if (this.isMultiplayer) {
                this.startLobbyFlow();
            } else {
                document.getElementById('mode-section').style.display = 'block';
            }
        });
    }

    startLobbyFlow() {
        // Show lobby for multiplayer quiz
        document.getElementById('mode-section').style.display = 'none';
        document.getElementById('create-quiz-section').style.display = 'none'; // Ensure create section is hidden
        document.getElementById('join-room-section').style.display = 'none'; // Ensure join section is hidden
        document.getElementById('lobby-section').style.display = 'block';
        document.getElementById('lobby-room-id').innerText = this.roomId;
        
        const lobbyShareLinkDiv = document.getElementById('lobby-share-link');
        if (lobbyShareLinkDiv) {
            const joinUrl = `${window.location.origin}/?room=${this.roomId}`;
            lobbyShareLinkDiv.innerHTML = `<p>Share this link with participants: <a href="${joinUrl}" target="_blank">${joinUrl}</a></p><p>Or share Room ID: <strong>${this.roomId}</strong></p>`;
        }

        // Connect via Socket.IO
        if (!this.socket || this.socket.disconnected) {
            this.socket = io();
        }
        
        this.socket.emit('join-room', { roomId: this.roomId, nickname: this.nickname });

        // Listen for quiz data (custom questions for this room)
        this.socket.off('quiz-data'); // Remove previous listener if any
        this.socket.on('quiz-data', (quizQuestions) => {
            console.log('Received quiz-data:', quizQuestions);
            if (quizQuestions && Array.isArray(quizQuestions)) {
                this.questions = quizQuestions; // Store the questions for the multiplayer quiz
            } else {
                console.error('Received invalid quiz-data or no questions:', quizQuestions);
                this.questions = []; // Fallback
            }
        });

        // Update lobby user list
        this.socket.off('lobby-update'); // Remove previous listener
        this.socket.on('lobby-update', ({ users, hostId }) => {
            const list = document.getElementById('lobby-users'); list.innerHTML = '';
            this.isHost = this.socket.id === hostId; 
            console.log('Lobby update. Is host?', this.isHost, 'My ID:', this.socket.id, 'Host ID:', hostId, 'Users:', users); 

            users.forEach(u => {
                const li = document.createElement('li');
                li.style.display = 'flex'; li.style.justifyContent = 'space-between'; li.style.alignItems = 'center';
                const span = document.createElement('span');
                let userText = u.nickname + (u.id === hostId ? ' (Host)' : '');
                if (u.finishedQuiz) {
                    userText += ' (Finished)';
                }
                span.innerText = userText;
                li.appendChild(span);
                if (this.isHost && u.id !== hostId) {
                    const btn = document.createElement('button');
                    btn.className = 'kick-btn'; btn.innerText = 'Kick';
                    btn.style.marginLeft = '1rem';
                    btn.addEventListener('click', () => this.socket.emit('kick', { roomId: this.roomId, userId: u.id }));
                    li.appendChild(btn);
                }
                list.appendChild(li);
            });
            // Show/hide host controls
            const startBtn = document.getElementById('lobby-start-btn');
            const countdownInput = document.getElementById('lobby-countdown');
            const timerInput = document.getElementById('lobby-timer');
            const allowLateInput = document.getElementById('lobby-allow-late');
            const hostControls = document.getElementById('lobby-host-controls');

            if (this.isHost) {
                if (hostControls) hostControls.style.display = 'block';
                startBtn.style.display = 'block';
                countdownInput.disabled = false;
                timerInput.disabled = false;
                allowLateInput.disabled = false;
            } else {
                if (hostControls) hostControls.style.display = 'none';
                startBtn.style.display = 'none';
                countdownInput.disabled = true;
                timerInput.disabled = true;
                allowLateInput.disabled = true;
            }
        });
        // Host starts quiz
        document.getElementById('lobby-start-btn').addEventListener('click', () => {
            const countdown = Number(document.getElementById('lobby-countdown').value);
            const duration = Number(document.getElementById('lobby-timer').value);
            const allowLateJoin = document.getElementById('lobby-allow-late').checked;
            this.socket.emit('start-quiz', { roomId: this.roomId, countdown, duration, allowLateJoin });
        });
        // Listen for countdown and quiz start
        this.socket.off('start-countdown'); // Remove previous listener
        this.socket.on('start-countdown', data => this.handleCountdown(data));
        
        this.socket.off('quiz-start'); // Remove previous listener
        this.socket.on('quiz-start', data => this.handleQuizStart(data));
        
        this.socket.off('quiz-data-error'); // Listen for quiz data errors
        this.socket.on('quiz-data-error', (errorMessage) => {
            alert(`Error from server: ${errorMessage}`);
            // Potentially redirect to mode selection or show a persistent error
            document.getElementById('lobby-section').style.display = 'none';
            document.getElementById('mode-section').style.display = 'block';
        });

        // Handle being kicked
        this.socket.off('kicked'); // Remove previous listener
        this.socket.on('kicked', () => { alert('You have been removed from the lobby.'); window.location.reload(); });
        
        // Listen for server-sent questions and updates (for multiplayer game)
        this.socket.off('new-question'); // Remove previous listener
        this.socket.on('new-question', data => this.handleNewQuestion(data));
        
        this.socket.off('leaderboard'); // Remove previous listener
        this.socket.on('leaderboard', users => this.showLeaderboard(users));
        
        this.socket.off('quiz-end'); // Remove previous listener
        this.socket.on('quiz-end', data => this.showQuizEnd(data));
    }

    async startMultiplayerQuiz() {
        console.log('Attempting to start multiplayer quiz. Questions loaded:', this.questions);
        if (!this.questions || this.questions.length === 0) {
            alert('Error: Quiz questions could not be loaded for the multiplayer game. The host might need to re-create the quiz or there was an issue loading them.');
            console.error('CRITICAL: this.questions is empty or invalid in startMultiplayerQuiz. RoomID:', this.roomId, 'Current this.questions:', this.questions);
            document.getElementById('lobby-section').style.display = 'block';
            document.getElementById('quiz-section').style.display = 'none';
            return;
        }

        this.currentQuestionIndex = 0; 
        this.score = 0;
        this.selectedOption = null;

        document.getElementById('lobby-section').style.display = 'none';
        document.getElementById('quiz-section').style.display = 'block';
        document.getElementById('multiplayer-leaderboard').style.display = 'none';

        // Configure buttons for multiplayer
        const prevBtn = document.getElementById('prev-btn');
        const confirmBtn = document.getElementById('confirm-btn');
        const nextBtn = document.getElementById('next-btn');

        prevBtn.style.display = 'inline-block';
        confirmBtn.style.display = 'inline-block';
        nextBtn.style.display = 'inline-block';

        prevBtn.disabled = true; // Initially on first question
        confirmBtn.disabled = true; // Disabled until an option is selected
        nextBtn.disabled = false; // Skip is initially available

        // Re-bind buttons to avoid multiple listeners 
        const newPrevBtn = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        newPrevBtn.addEventListener('click', () => {
            alert('Navigating to the previous question is not supported in this multiplayer mode.');
        });

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.disabled = true; // Ensure it starts disabled
        newConfirmBtn.addEventListener('click', () => {
            if (this.selectedOption == null) {
                alert('Please select an answer');
                return;
            }
            this.socket.emit('submit-answer', { roomId: this.roomId, answer: this.selectedOption });
            
            // Buttons will be re-enabled by handleNewQuestion or quiz end
            newConfirmBtn.disabled = true; 
            newNextBtn.disabled = true;
            newPrevBtn.disabled = true; 
            document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
            console.log('Answer confirmed and submitted.');
        });
        
        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        newNextBtn.addEventListener('click', () => {
            this.socket.emit('submit-answer', { roomId: this.roomId, answer: -1 }); // -1 for skip
            
            // Buttons will be re-enabled by handleNewQuestion or quiz end
            newConfirmBtn.disabled = true;
            newNextBtn.disabled = true;
            newPrevBtn.disabled = true; 
            document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
            console.log('Question skipped (Next button).');
        });
        
        console.log('Multiplayer quiz UI prepared with Prev/Confirm/Next. Waiting for first question from server.');
    }

    startCustomFlow() {
        document.getElementById('rules-section').style.display = 'block';
        document.getElementById('rules-start-quiz').addEventListener('click', () => this.startQuiz());
    }

    bindModeSelection() {
        document.getElementById('mode-inbuilt').addEventListener('click', () => {
            document.getElementById('mode-section').style.display = 'none';
            document.getElementById('quiz-setup').style.display = 'block';
            this.bindCategorySelection();
            this.bindDifficultySelection();
            this.bindStartSetupButton();
            this.bindRulesStart();
        });
        document.getElementById('mode-create').addEventListener('click', () => {
            document.getElementById('mode-section').style.display = 'none';
            document.getElementById('create-quiz-section').style.display = 'block';
            this.bindCreateQuiz();
        });
        // Join existing multiplayer quiz via room code
        document.getElementById('mode-join').addEventListener('click', () => {
            // Show join-room input
            document.getElementById('mode-section').style.display = 'none';
            document.getElementById('join-room-section').style.display = 'block';
            const joinBtn = document.getElementById('join-room-btn');
            joinBtn.disabled = false;
            joinBtn.onclick = () => {
                const code = document.getElementById('join-room-input').value.trim();
                if (!code) { alert('Please enter a room code'); return; }
                this.roomId = code;
                this.isMultiplayer = true;
                document.getElementById('join-room-section').style.display = 'none';
                this.startLobbyFlow();
            };
        });
    }

    bindCreateQuiz() {
        const container = document.getElementById('question-form-container');
        const titleInput = document.getElementById('quiz-title');
        const subjectSelect = document.getElementById('quiz-subject'); // Restored
        const difficultySelect = document.getElementById('quiz-difficulty'); // Restored
        const durationInput = document.getElementById('quiz-duration');
        const countInput = document.getElementById('quiz-count');
        const allowLateInput = document.getElementById('quiz-allow-late');
        const addBtn = document.getElementById('add-question-btn');
        const genBtn = document.getElementById('generate-quiz-btn');
        // Function to add one question form
        const addQuestionForm = () => {
            const idx = container.children.length;
            const div = document.createElement('div'); div.className = 'question-form';
            div.innerHTML =
                '<h3>Question ' + (idx + 1) + '</h3>' +
                '<input placeholder="Question text" class="q-text" />' +
                [0,1,2,3].map(i =>
                    '<input placeholder="Option ' + (i+1) + '" class="q-opt" data-opt="' + i + '" />'
                ).join('') +
                '<select class="q-correct">' +
                    '<option value="">Select correct option</option>' +
                    [0,1,2,3].map(i =>
                        '<option value="' + i + '">Option ' + (i+1) + '</option>'
                    ).join('') +
                '</select><hr/>';
            container.appendChild(div);
        };
        // Render initial question forms based on count
        const renderForms = () => {
            container.innerHTML = '';
            const total = parseInt(countInput.value, 10) || 0;
            for (let i = 0; i < total; i++) addQuestionForm();
        };
        // Update forms when question count changes
        countInput.addEventListener('change', renderForms);
        renderForms();
        // Hide manual add button when using count-based rendering
        addBtn.style.display = 'none';
        genBtn.addEventListener('click', async () => {
            console.log('Generate & Share Quiz button clicked');
            try {
                // Gather metadata
                const title = titleInput.value.trim();
                const subject = subjectSelect.value; // Restored
                const difficulty = difficultySelect.value; // Restored
                const duration = parseInt(durationInput.value, 10);
                const questionCount = parseInt(countInput.value, 10);
                const allowLateJoin = allowLateInput.checked;
                if (!title) { alert('Please enter a quiz title'); return; }
                // Gather question data
                const qsElems = container.querySelectorAll('.question-form');
                if (qsElems.length !== questionCount) { alert(`Please provide exactly ${questionCount} questions. You currently have ${qsElems.length} forms.`); return; }

                const qs = [];
                for (let i = 0; i < qsElems.length; i++) {
                    const div = qsElems[i];
                    const questionElement = div.querySelector('.q-text');
                    const optionElements = Array.from(div.querySelectorAll('.q-opt'));
                    const correctElement = div.querySelector('.q-correct');

                    if (!questionElement) {
                        alert(`Error finding question text input for question ${i + 1}.`);
                        return;
                    }
                    const text = questionElement.value.trim();
                    if (!text) {
                        alert(`Question ${i + 1} text cannot be empty.`);
                        return;
                    }

                    if (optionElements.length !== 4) {
                         alert(`Error finding all option inputs for question ${i + 1}. Expected 4, found ${optionElements.length}.`);
                        return;
                    }
                    const options = optionElements.map(input => input.value.trim());
                    if (options.some(opt => !opt)) {
                        alert(`All options for question ${i + 1} must be filled.`);
                        return;
                    }
                    
                    if (!correctElement) {
                        alert(`Error finding correct answer selector for question ${i + 1}.`);
                        return;
                    }
                    const correctValue = correctElement.value;
                    if (correctValue === "") {
                        alert(`Please select a correct answer for question ${i + 1}.`);
                        return;
                    }
                    const correct = parseInt(correctValue, 10);

                    qs.push({ question: text, options, correctAnswer: correct });
                }
                
                console.log('Validated quiz questions:', qs);
                const response = await fetch('/api/create-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, subject, difficulty, duration, questionCount, allowLateJoin, quiz: qs }) // Restored subject and difficulty
                });
                // Parse JSON response
                let resData;
                try {
                    resData = await response.json();
                } catch (e) {
                    throw new Error('Invalid JSON response from server');
                }
                if (!response.ok) {
                    // Server returned an error; show message
                    throw new Error(resData.error || `Server error: ${response.status}`);
                }
                const { roomId } = resData;
                // Generate share link for joining
                const joinUrl = `${window.location.origin}/?room=${roomId}`;
                const linkDiv = document.getElementById('share-link');
                linkDiv.innerHTML = `<p>Share this link: <a href="${joinUrl}" target="_blank">${joinUrl}</a></p>`;

                // Transition host to lobby
                this.roomId = roomId;
                this.isMultiplayer = true;
                document.getElementById('create-quiz-section').style.display = 'none';
                // Ensure nickname is set if not already (e.g., if user went straight to create)
                if (!this.nickname) {
                    // This is a simplified way; ideally, ensure login flow happened.
                    // For now, we assume nickname was entered before reaching create quiz.
                    // If not, the join-room on server might need a default or error.
                    console.warn("Nickname not set when creating quiz and transitioning to lobby.");
                }
                this.startLobbyFlow();


            } catch (err) {
                console.error('Error generating quiz:', err);
                alert(`Failed to generate quiz: ${err.message}`);
            }
        });
    }

    startCustomFlow() {
        document.getElementById('rules-section').style.display = 'block';
        document.getElementById('rules-start-quiz').addEventListener('click', () => this.startQuiz());
    }

    bindCategorySelection() {
        document.querySelectorAll('.category').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('.category').forEach(e => e.classList.remove('selected'));
                el.classList.add('selected');
                this.category = el.dataset.category;
                this.checkSetupReady();
            });
        });
    }

    bindDifficultySelection() {
        document.querySelectorAll('#quiz-setup .difficulty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#quiz-setup .difficulty-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.difficulty = btn.dataset.difficulty;
                this.checkSetupReady();
            });
        });
    }

    checkSetupReady() {
        const startBtn = document.querySelector('#start-quiz');
        if (this.category && this.difficulty) startBtn.disabled = false;
    }

    bindStartSetupButton() {
        document.querySelector('#start-quiz').addEventListener('click', () => {
            document.querySelector('#quiz-setup').style.display = 'none';
            document.querySelector('#rules-section').style.display = 'block';
        });
    }

    bindRulesStart() {
        document.querySelector('#rules-start-quiz').addEventListener('click', () => this.startQuiz());
    }

    startQuiz() { // This is for single-player inbuilt and custom URL quiz
        if (this.isMultiplayer) {
            console.error("startQuiz() called in multiplayer mode. This should not happen.");
            return; // Should be handled by startLobbyFlow -> startMultiplayerQuiz
        }

        if (!this.isCustom) this.loadQuestions();
        
        if (!this.questions || this.questions.length === 0) {
            alert('Failed to load questions for the quiz.');
            // Go back to mode selection or setup
            document.getElementById('quiz-section').style.display = 'none';
            document.getElementById('mode-section').style.display = 'block'; 
            return;
        }

        this.currentQuestionIndex = 0;
        this.score = 0;
        this.selectedOption = null;

        document.getElementById('rules-section').style.display = 'none';
        document.getElementById('quiz-section').style.display = 'block';
        document.getElementById('multiplayer-leaderboard').style.display = 'none';
        document.getElementById('timer-display').style.display = 'none'; // No global timer for single player by default
        document.getElementById('host-finish-quiz-btn').style.display = 'none';

        // Ensure correct buttons are shown for single player
        const prevBtn = document.getElementById('prev-btn');
        const confirmBtn = document.getElementById('confirm-btn');
        const nextBtn = document.getElementById('next-btn');

        prevBtn.style.display = 'inline-block';
        confirmBtn.style.display = 'inline-block';
        nextBtn.style.display = 'inline-block';

        this.bindNavigationButtons(); // This sets up listeners for single-player
        this.displayQuestion();
    }

    loadQuestions() {
        const key = `${this.category}Questions${this.difficulty.charAt(0).toUpperCase() + this.difficulty.slice(1)}`;
        this.questions = window[key] || [];
        if (!this.questions.length) alert('Error: Questions not found for ' + this.category + ' - ' + this.difficulty);
    }

    displayQuestion() {
        this.clearOptions();
        const q = this.questions[this.currentQuestionIndex];
        document.querySelector('#question').innerText = q.question;
        document.querySelector('#current-question').innerText = `Question ${this.currentQuestionIndex+1} of ${this.questions.length}`;
        q.options.forEach((opt,i) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn'; btn.innerText = opt; btn.dataset.index = i;
            btn.addEventListener('click', e => this.handleOptionClick(e));
            document.querySelector('#options-container').appendChild(btn);
        });
        this.updateUI();
    }

    clearOptions() { document.querySelector('#options-container').innerHTML = ''; }

    handleOptionClick(e) {
        const clickedOptionIndex = +e.target.dataset.index;
        const confirmBtn = document.getElementById('confirm-btn');
        const nextBtn = document.getElementById('next-btn');

        if (this.selectedOption === clickedOptionIndex) { 
            this.selectedOption = null;
            e.target.classList.remove('selected');
            confirmBtn.disabled = true;
            if (this.isMultiplayer) {
                nextBtn.disabled = false; 
            } else { // Single Player
                nextBtn.disabled = false; // Next (skip) always available if nothing confirmed
            }
        } else { 
            this.selectedOption = clickedOptionIndex;
            document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            confirmBtn.disabled = false;
            if (this.isMultiplayer) {
                nextBtn.disabled = true; 
            } else { // Single Player
                // For single player, next (skip) could be disabled if confirm is now active, or kept enabled.
                // Current logic in nextQuestion(true) handles skip.
                // Let's keep Next (skip) enabled unless we want to force confirm once an option is picked.
                nextBtn.disabled = false; 
            }
        }
    }

    updateUI() { // Primarily for single-player inbuilt quiz
        if (this.isMultiplayer) return; // Multiplayer UI is handled by server events mostly

        document.querySelector('#progress').style.width = `${((this.currentQuestionIndex+1)/this.questions.length)*100}%`;
        document.querySelector('#prev-btn').disabled = this.currentQuestionIndex === 0;
        // Confirm button is enabled by handleOptionClick in single player
        document.querySelector('#confirm-btn').disabled = this.selectedOption === null;
        // Next button (skip) is always available unless it's the last question and an answer is selected
        document.querySelector('#next-btn').disabled = false; 
    }

    bindNavigationButtons() { // For single-player inbuilt and custom URL quiz
        console.log("Binding navigation buttons for single-player mode.");
        const prevBtn = document.getElementById('prev-btn');
        const confirmBtn = document.getElementById('confirm-btn');
        const nextBtn = document.getElementById('next-btn');

        // Clone and replace to remove previous (potentially multiplayer) listeners
        const newPrevBtn = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        newPrevBtn.addEventListener('click', () => this.prevQuestion());

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', () => this.nextQuestion(false)); // false = don't ignore selection

        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        newNextBtn.addEventListener('click', () => this.nextQuestion(true)); // true = ignore selection (skip)
    }

    // Move to next question; if ignoreSelection=true, skip selection check (for single-player)
    nextQuestion(ignoreSelection = false) {
        if (!ignoreSelection && this.selectedOption==null) {
            alert('Please select an answer before proceeding.');
            return;
        }
        if (this.selectedOption===this.questions[this.currentQuestionIndex].correctAnswer) this.score++;
        this.selectedOption = null;
        if (this.currentQuestionIndex < this.questions.length - 1) {
            this.currentQuestionIndex++;
            this.displayQuestion();
        } else {
            this.showResult();
        }
    }

    prevQuestion() {
        if (this.currentQuestionIndex>0) { this.currentQuestionIndex--; this.displayQuestion(); }
    }

    showResult() {
        document.querySelector('#quiz-section').style.display='none';
        document.querySelector('#result-section').style.display='block';
        document.querySelector('#score').innerText = this.score;
        document.querySelector('#total-questions').innerText = this.questions.length;
        document.querySelector('#restart-quiz').addEventListener('click', ()=> this.restartQuiz());
    }

    restartQuiz() {
        this.category = this.difficulty = '';
        this.currentQuestionIndex = this.score = this.selectedOption = 0;
        document.querySelector('#result-section').style.display='none';
        document.querySelector('#quiz-setup').style.display='block';
        document.querySelectorAll('.selected').forEach(e=>e.classList.remove('selected'));
        document.querySelector('#start-quiz').disabled = true;
    }

    // Handle new question from server
    handleNewQuestion(data) {
        console.log('[handleNewQuestion] Received data:', JSON.stringify(data)); // Log received data

        if (this.isHost && document.getElementById('multiplayer-leaderboard').style.display === 'block') {
            console.log('[handleNewQuestion] Host UI is leaderboard, ignoring question display.');
            return;
        }

        const quizSection = document.getElementById('quiz-section');
        const leaderboardSection = document.getElementById('multiplayer-leaderboard');
        const leaderboardList = document.getElementById('leaderboard-list');
        const prevBtn = document.getElementById('prev-btn');
        const confirmBtn = document.getElementById('confirm-btn');
        const nextBtn = document.getElementById('next-btn');

        if (!prevBtn || !confirmBtn || !nextBtn || !quizSection || !leaderboardSection || !leaderboardList) {
            console.error('[handleNewQuestion] Critical UI elements not found. Aborting.');
            // Optionally, inform the user
            // alert('A critical UI error occurred. Please try refreshing.');
            return;
        }
        
        console.log(`[handleNewQuestion] Before processing: nextBtn.disabled = ${nextBtn.disabled}, confirmBtn.disabled = ${confirmBtn.disabled}`);

        if (data.finishedAllQuestions) {
            console.log('[handleNewQuestion] Player finished all questions. Final score (if provided):', data.finalScore);
            quizSection.style.display = 'none';
            leaderboardSection.style.display = 'block';
            let finishMessage = 'You have completed all questions!';
            if (typeof data.finalScore !== 'undefined') {
                finishMessage += ` Your final score: ${data.finalScore}`;
            }
            finishMessage += ' Waiting for final results...';
            leaderboardList.innerHTML = `<li>${finishMessage}</li>`;
            
            prevBtn.disabled = true;
            confirmBtn.disabled = true;
            nextBtn.disabled = true;
            document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
            console.log(`[handleNewQuestion] Finished all. Buttons disabled: prev=${prevBtn.disabled}, confirm=${confirmBtn.disabled}, next=${nextBtn.disabled}`);
            return;
        }

        this.selectedOption = null;
        leaderboardSection.style.display = 'none';
        quizSection.style.display = 'block';
        
        document.getElementById('question').innerText = data.question;
        document.getElementById('current-question').innerText = `Question ${data.index} of ${data.total}`;
        
        const container = document.getElementById('options-container');
        container.innerHTML = ''; 
        
        if (data.options && Array.isArray(data.options)) {
            data.options.forEach((opt, i) => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerText = opt;
                btn.dataset.index = i;
                btn.disabled = false;
                btn.addEventListener('click', e => this.handleOptionClick(e));
                container.appendChild(btn);
            });
        } else {
            console.error('[handleNewQuestion] data.options is missing or not an array:', data.options);
            container.innerHTML = '<p style="color: red;">Error: Question options could not be loaded.</p>';
        }
        
        prevBtn.style.display = 'inline-block';
        confirmBtn.style.display = 'inline-block';
        nextBtn.style.display = 'inline-block';
        
        prevBtn.disabled = true; 
        confirmBtn.disabled = true;
        nextBtn.disabled = false; // Re-enable Next button
        
        console.log(`[handleNewQuestion] New question displayed. Buttons status: prev=${prevBtn.disabled}, confirm=${confirmBtn.disabled}, next=${nextBtn.disabled}`);
    }
    
    handleQuizStart(data) { // data: { duration }
        const timerDisplay = document.getElementById('timer-display');
        let remainingSeconds = data.duration * 60;
        
        const updateTimerDisplay = () => {
            timerDisplay.innerText = this.formatTime(remainingSeconds);
        };

        updateTimerDisplay(); // Initial display
        timerDisplay.style.display = 'block'; // Make timer visible
        
        if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);

        this.quizTimerInterval = setInterval(() => {
            remainingSeconds--;
            if (remainingSeconds < 0) {
                clearInterval(this.quizTimerInterval);
                timerDisplay.innerText = "Time's up!";
                return;
            }
            updateTimerDisplay();
        }, 1000);

        const finishQuizBtn = document.getElementById('host-finish-quiz-btn');

        if (this.isHost) {
            document.getElementById('lobby-section').style.display = 'none';
            document.getElementById('quiz-section').style.display = 'none'; // Ensure host does not see questions
            document.getElementById('multiplayer-leaderboard').style.display = 'block'; // Host sees leaderboard
            
            // The server will emit 'leaderboard' updates. Host will see these.
            // No need to call startMultiplayerQuiz() for the host.

            if (finishQuizBtn) {
                finishQuizBtn.style.display = 'block'; 
                const newFinishQuizBtn = finishQuizBtn.cloneNode(true); // Clone to avoid multiple listeners
                finishQuizBtn.parentNode.replaceChild(newFinishQuizBtn, finishQuizBtn);
                newFinishQuizBtn.addEventListener('click', () => {
                    if (confirm('Are you sure you want to end the quiz for everyone?')) {
                        this.socket.emit('force-end-quiz', { roomId: this.roomId });
                    }
                });
            }
            console.log("Host: Quiz started. Displaying leaderboard and finish button. Host will not answer questions.");
        } else {
            // Participant: Transition to the quiz playing UI
            if (finishQuizBtn) finishQuizBtn.style.display = 'none'; 
            this.startMultiplayerQuiz(); // Participants start the quiz interface
        }
    }

    // Display real-time leaderboard
    showLeaderboard(usersData) { // Renamed 'users' to 'usersData'
        const lbContainer = document.getElementById('multiplayer-leaderboard');
        const list = document.getElementById('leaderboard-list');
        const quizSection = document.getElementById('quiz-section');

        // If the player is currently looking at a question, don't interrupt them with the full leaderboard.
        if (quizSection.style.display === 'block') {
            console.log("Leaderboard update received, but player is actively in quiz view. Leaderboard not displayed over question.");
            // Optional: Could update a smaller, non-intrusive live score display here if one existed.
            return;
        }

        // If here, quiz-section is not 'block'. Player has finished or is in a dedicated host view.
        lbContainer.style.display = 'block'; 
        
        list.innerHTML = '';
        usersData.forEach(u => {
            const li = document.createElement('li');
            let userText = `${u.nickname}: ${u.score}`;
            // Assuming server sends 'finishedQuiz' status in leaderboard data (it does as per previous server changes)
            if (u.finishedQuiz) {
                userText += ' (Finished)';
            }
            li.innerText = userText;
            list.appendChild(li);
        });
        console.log("Leaderboard displayed/updated for users not actively in question view.", usersData);
    }

    // Handle end of quiz
    showQuizEnd(data) {
        // data: { leaderboard, reason }
        if (this.quizTimerInterval) clearInterval(this.quizTimerInterval); 
        document.getElementById('timer-display').style.display = 'none'; 
        document.getElementById('host-finish-quiz-btn').style.display = 'none'; 

        document.getElementById('multiplayer-leaderboard').style.display = 'none';
        document.getElementById('quiz-section').style.display = 'none';
        document.getElementById('result-section').style.display = 'block';

        const personal = data.leaderboard.find(u => u.id === this.socket.id);
        const quizStatusMessage = document.getElementById('quiz-status-message');
        if (quizStatusMessage) {
            let message = "The quiz has ended.";
            if (data.reason === 'timer_expired') message = "Time's up! The quiz has ended.";
            else if (data.reason === 'host_ended') message = "The host has ended the quiz.";
            else if (data.reason === 'all_finished') message = "All players have finished the quiz!";
            quizStatusMessage.innerText = message;
        }

        if (personal) {
            document.getElementById('score').innerText = personal.score;
            // this.questions might not be populated for all clients if they joined late
            // or if there was an issue. The server now sends total questions with finish message.
            // For now, let's try to use it if available, otherwise it might show N/A.
            const totalQsElement = document.getElementById('total-questions');
            if (this.questions && this.questions.length > 0) {
                 totalQsElement.innerText = this.questions.length;
            } else if (data.leaderboard && data.leaderboard.length > 0 && data.leaderboard[0].answers) {
                // If answers array is available and gives a hint to total questions (less reliable)
                // This part is speculative, better to get total from server if possible.
                // For now, server sends total with 'finishedAllQuestions' in new-question.
                // We might need to store that total questions count on client when quiz starts.
                // Fallback: if (personal.totalQuestions) totalQsElement.innerText = personal.totalQuestions;
                totalQsElement.innerText = 'N/A'; // Or fetch from a reliable source
            } else {
                totalQsElement.innerText = 'N/A';
            }
        } else {
             // If player data not in leaderboard (e.g. joined but never submitted/finished)
            document.getElementById('score').innerText = 'N/A';
            document.getElementById('total-questions').innerText = 'N/A';
        }

        const finalLeaderboardList = document.getElementById('final-leaderboard-list');
        if (finalLeaderboardList) {
            finalLeaderboardList.innerHTML = ''; 
            if (data.leaderboard && data.leaderboard.length > 0) {
                const sortedLeaderboard = [...data.leaderboard].sort((a, b) => b.score - a.score);
                
                sortedLeaderboard.forEach((user, index) => {
                    const li = document.createElement('li');
                    li.innerText = `${index + 1}. ${user.nickname}: ${user.score}`;
                    if (index === 0 && sortedLeaderboard[0].score > 0 && sortedLeaderboard.filter(u => u.score === sortedLeaderboard[0].score).length === 1) { 
                        li.style.fontWeight = 'bold';
                        li.innerText += ' (Winner!)';
                    } else if (index === 0 && sortedLeaderboard[0].score > 0 && sortedLeaderboard.filter(u => u.score === sortedLeaderboard[0].score).length > 1) {
                        li.style.fontWeight = 'bold';
                        li.innerText += ' (Tie for Winner!)';
                    }
                    finalLeaderboardList.appendChild(li);
                });
            } else {
                finalLeaderboardList.innerHTML = '<li>No leaderboard data available.</li>';
            }
        } else {
            console.warn("'final-leaderboard-list' element not found in HTML for displaying final results.");
        }
        console.log('Final leaderboard displayed:', data.leaderboard, 'Reason:', data.reason);
        // Add a button to go back to the main menu/mode selection
        const restartBtn = document.getElementById('restart-quiz');
        restartBtn.innerText = 'Play Again / Main Menu';
        // Clone and replace to ensure old listeners are removed and new one is for reload
        const newRestartBtn = restartBtn.cloneNode(true);
        restartBtn.parentNode.replaceChild(newRestartBtn, restartBtn);
        newRestartBtn.addEventListener('click', () => window.location.reload());
    }

    // Display countdown before quiz start
    handleCountdown(data) {
        const cd = document.getElementById('countdown-display');
        let sec = data.seconds;
        cd.innerText = `Starting in ${sec}...`;
        cd.style.display = 'block';
        const interval = setInterval(() => {
            sec--;
            if (sec <= 0) {
                clearInterval(interval);
                cd.style.display = 'none';
            } else {
                cd.innerText = `Starting in ${sec}...`;
            }
        }, 1000);
    }

    // Initialize global quiz timer when quiz starts
    handleQuizStart(data) { // data: { duration }
        const timerDisplay = document.getElementById('timer-display');
        let remainingSeconds = data.duration * 60;
        
        const updateTimerDisplay = () => {
            timerDisplay.innerText = this.formatTime(remainingSeconds);
        };

        updateTimerDisplay(); // Initial display
        timerDisplay.style.display = 'block'; // Make timer visible
        
        if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);

        this.quizTimerInterval = setInterval(() => {
            remainingSeconds--;
            if (remainingSeconds < 0) {
                clearInterval(this.quizTimerInterval);
                timerDisplay.innerText = "Time's up!";
                return;
            }
            updateTimerDisplay();
        }, 1000);

        const finishQuizBtn = document.getElementById('host-finish-quiz-btn');

        if (this.isHost) {
            document.getElementById('lobby-section').style.display = 'none';
            document.getElementById('quiz-section').style.display = 'none'; // Ensure host does not see questions
            document.getElementById('multiplayer-leaderboard').style.display = 'block'; // Host sees leaderboard
            
            // The server will emit 'leaderboard' updates. Host will see these.
            // No need to call startMultiplayerQuiz() for the host.

            if (finishQuizBtn) {
                finishQuizBtn.style.display = 'block'; 
                const newFinishQuizBtn = finishQuizBtn.cloneNode(true); // Clone to avoid multiple listeners
                finishQuizBtn.parentNode.replaceChild(newFinishQuizBtn, finishQuizBtn);
                newFinishQuizBtn.addEventListener('click', () => {
                    if (confirm('Are you sure you want to end the quiz for everyone?')) {
                        this.socket.emit('force-end-quiz', { roomId: this.roomId });
                    }
                });
            }
            console.log("Host: Quiz started. Displaying leaderboard and finish button. Host will not answer questions.");
        } else {
            // Participant: Transition to the quiz playing UI
            if (finishQuizBtn) finishQuizBtn.style.display = 'none'; 
            this.startMultiplayerQuiz(); // Participants start the quiz interface
        }
    }

    // Utility to format seconds as MM:SS
    formatTime(seconds) {
        const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        return `${mins}:${secs}`;
    }
}

// Initialize
const quizApp = new QuizApp();
quizApp.init();

// Socket.IO client initialization
// const socket = io(); // This is already initialized within QuizApp if multiplayer
// The global socket listeners below might conflict or be redundant if QuizApp manages its own socket instance.
// It's better to have socket listeners within the QuizApp class context where `this` refers to the app instance.
// For now, I will comment out the global ones if they are covered by QuizApp instance listeners.

// quizApp.socket.on('user-joined', ({ nickname, count }) => { // This should be handled by QuizApp instance
//     console.log(`${nickname} joined. Total: ${count}`);
// });