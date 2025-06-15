const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Simple file-based storage
const QUIZ_DATA_FILE = path.join(__dirname, 'quizzes.json');

// Initialize quiz storage file if it doesn't exist
if (!fs.existsSync(QUIZ_DATA_FILE)) {
  fs.writeFileSync(QUIZ_DATA_FILE, JSON.stringify({}));
}

// Helper functions for file-based storage
const readQuizzes = () => {
  try {
    const data = fs.readFileSync(QUIZ_DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading quizzes:', err);
    return {};
  }
};

const writeQuizzes = (quizzes) => {
  try {
    fs.writeFileSync(QUIZ_DATA_FILE, JSON.stringify(quizzes, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing quizzes:', err);
    return false;
  }
};

const createQuiz = (quizData) => {
  const quizzes = readQuizzes();
  quizzes[quizData.roomId] = {
    ...quizData,
    createdAt: new Date().toISOString()
  };
  return writeQuizzes(quizzes);
};

const findQuiz = (roomId) => {
  const quizzes = readQuizzes();
  return quizzes[roomId] || null;
};

// Parse JSON bodies
app.use(express.json());
// Serve static files
app.use(express.static(__dirname));

// Create a new quiz and return a room ID
app.post('/api/create-quiz', async (req, res) => {
  console.log('POST /api/create-quiz received, body:', req.body);
  const { title, subject, difficulty, duration, questionCount, allowLateJoin, quiz: quizData } = req.body; // Restored subject and difficulty
  // Validate required fields
  if (!title || !subject || !difficulty || !duration || !questionCount || !quizData) // Restored subject and difficulty in validation
    return res.status(400).json({ error: 'Missing required quiz metadata or data' });
  if (!quizData) return res.status(400).json({ error: 'Missing quiz data' });
  
  const roomId = uuidv4().slice(0, 8);
  const quizDoc = {
    roomId, 
    title, 
    subject, // Restored
    difficulty, // Restored
    duration, 
    questionCount, 
    allowLateJoin, 
    quiz: quizData
  };
  
  try {
    const success = createQuiz(quizDoc);
    if (success) {
      res.json({ roomId });
    } else {
      throw new Error('Failed to save quiz data');
    }
  } catch (err) {
    console.error('Database error on create-quiz:', err);
    // Send detailed error to client for debugging
    res.status(500).json({ error: err.message });
  }
});

// Fetch quiz metadata and questions by roomId
app.get('/api/quiz/:roomId', async (req, res) => {
  try {
    const quizDoc = findQuiz(req.params.roomId);
    if (!quizDoc) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quizDoc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve lobby and quiz pages for custom rooms
app.get('/quiz/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const roomUsers = {}; // roomId -> [{ id, nickname, score, currentQuestionIndex, answers: [], finishedQuiz: false }]
const roomStates = {}; // roomId -> { questions, duration, quizTimer, hostId } // Removed current, answers from here

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.on('join-room', async ({ roomId, nickname }) => {
    try {
      const doc = findQuiz(roomId);
      if (!doc) {
        socket.emit('error', 'Room not found');
        return;
      }
      
      const roomState = roomStates[roomId];
      if (roomState && doc.allowLateJoin === false && roomState.quizStarted) { // Check if quiz has started
        socket.emit('error', 'Late join not allowed as quiz has already started.');
        return;
      }

      socket.join(roomId);
      roomUsers[roomId] = roomUsers[roomId] || [];
      
      // Initialize player state for asynchronous progression
      const playerState = { 
        id: socket.id, 
        nickname, 
        score: 0, 
        currentQuestionIndex: 0, 
        answers: [], // Store individual answers { questionIndex, answer, correct }
        finishedQuiz: false 
      };
      roomUsers[roomId].push(playerState);
      
      const hostId = roomUsers[roomId][0].id;
      // Update hostId in roomStates if this is the first user (host)
      if (!roomStates[roomId]) {
          roomStates[roomId] = { hostId }; 
      } else {
          roomStates[roomId].hostId = hostId;
      }

      io.to(roomId).emit('lobby-update', { users: roomUsers[roomId].map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz})), hostId });
      socket.emit('quiz-data', doc.quiz);
      const count = io.sockets.adapter.rooms.get(roomId).size;
      io.to(roomId).emit('user-joined', { nickname, count });

      // If quiz already started and late join is allowed, send current question to new player
      if (roomState && roomState.quizStarted && doc.allowLateJoin) {
        const questions = roomState.questions;
        if (questions && questions.length > 0) {
            const firstQuestion = questions[0];
            socket.emit('new-question', { 
                question: firstQuestion.question, 
                options: firstQuestion.options, 
                index: 1, // Start from question 1
                total: questions.length,
                finishedAllQuestions: false
            });
        }
      }

    } catch (e) {
      console.error(e);
      socket.emit('error', 'Server error joining room');
    }
  });

  socket.on('start-quiz', async ({ roomId, countdown, duration, allowLateJoin }) => {
    const currentRoomUsers = roomUsers[roomId];
    // Ensure hostId is sourced from roomStates if available, otherwise from the first user.
    // This is important because roomUsers[0] might change if original host disconnects and rejoins.
    const hostId = (roomStates[roomId] && roomStates[roomId].hostId) ? roomStates[roomId].hostId : (currentRoomUsers && currentRoomUsers.length > 0 ? currentRoomUsers[0].id : null);

    if (!currentRoomUsers || !hostId || socket.id !== hostId) {
        console.log(`Attempt to start quiz in room ${roomId} by non-host ${socket.id}. Expected host: ${hostId}`);
        return socket.emit('error', 'Only the host can start the quiz.');
    }

    const doc = findQuiz(roomId);
    if (!doc) {
        socket.emit('error', 'Quiz data not found for room.');
        return;
    }
    doc.allowLateJoin = allowLateJoin;
    const quizzes = readQuizzes();
    quizzes[roomId] = doc;
    writeQuizzes(quizzes);

    io.to(roomId).emit('start-countdown', { seconds: countdown });

    setTimeout(() => {
      const questions = doc.quiz;
      if (!questions || questions.length === 0) {
        io.to(roomId).emit('error', 'No questions found for this quiz.');
        return;
      }

      roomStates[roomId] = {
        ...roomStates[roomId], // Preserve existing hostId
        questions,
        duration,
        quizStarted: true
      };
      
      currentRoomUsers.forEach(user => {
        user.score = 0;
        user.currentQuestionIndex = 0;
        user.answers = [];
        user.finishedQuiz = false;
      });

      io.to(roomId).emit('quiz-start', { duration });
      
      const quizTimer = setTimeout(() => {
        console.log(`Global timer expired for room ${roomId}. Ending quiz.`);
        // Score calculation for timed-out players: remaining questions are wrong
        currentRoomUsers.forEach(user => {
            if (!user.finishedQuiz) {
                const questionsAttempted = user.currentQuestionIndex;
                const totalQuestions = roomStates[roomId].questions.length;
                // No explicit score change here, as unanswered = 0 points.
                // Just mark as finished.
                console.log(`Player ${user.nickname} timed out. Attempted ${questionsAttempted}/${totalQuestions}. Score remains ${user.score}`);
                user.finishedQuiz = true;
                io.to(user.id).emit('quiz-timed-out'); 
            }
        });
        const finalLeaderboard = currentRoomUsers.map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz})).sort((a,b) => b.score - a.score);
        io.to(roomId).emit('quiz-end', { leaderboard: finalLeaderboard, reason: 'timer_expired' });
        
        delete roomStates[roomId];
        delete roomUsers[roomId];
      }, duration * 60 * 1000);
      
      if(roomStates[roomId]) roomStates[roomId].quizTimer = quizTimer;

      currentRoomUsers.forEach(user => {
        // Send questions only to non-host players
        if (user.id !== hostId) { 
            const firstQuestion = questions[0];
            io.to(user.id).emit('new-question', { 
                question: firstQuestion.question, 
                options: firstQuestion.options, 
                index: 1, 
                total: questions.length,
                finishedAllQuestions: false
            });
        } else {
            // For the host, ensure they get a lobby update that reflects quiz has started
            // (e.g. to show leaderboard view correctly)
            // This is implicitly handled by the lobby-update sent below already.
            console.log(`Host ${user.nickname} will not receive questions directly, will see leaderboard.`);
        }
      });
      console.log(`Quiz started in room ${roomId}. First question sent to non-host users. Host: ${hostId}`);
      io.to(roomId).emit('lobby-update', { users: currentRoomUsers.map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz})), hostId: roomStates[roomId].hostId });

    }, countdown * 1000);
  });

  socket.on('force-end-quiz', ({ roomId }) => {
    const currentRoomState = roomStates[roomId];
    const currentRoomUsers = roomUsers[roomId];
    const hostId = (currentRoomState && currentRoomState.hostId) ? currentRoomState.hostId : (currentRoomUsers && currentRoomUsers.length > 0 ? currentRoomUsers[0].id : null);

    if (!currentRoomState || !currentRoomUsers || !hostId || socket.id !== hostId) {
        return socket.emit('error', 'Failed to end quiz: Invalid request, not host, or quiz not active.');
    }

    console.log(`Host ${socket.id} is forcing quiz end for room ${roomId}`);
    
    // Score calculation: for players who haven't finished, remaining questions are marked as wrong (score doesn't change for unattempted)
    currentRoomUsers.forEach(user => {
        if (user.id !== hostId && !user.finishedQuiz) { // Process only for non-host players who haven't finished
            const questionsAttempted = user.currentQuestionIndex;
            const totalQuestions = currentRoomState.questions.length;
            // No explicit score change here, as unanswered = 0 points.
            // Just mark as finished.
            console.log(`Player ${user.nickname} was active when host forced end. Attempted ${questionsAttempted}/${totalQuestions}. Score: ${user.score}`);
            user.finishedQuiz = true; 
        }
    });

    const finalLeaderboard = currentRoomUsers
        .map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz}))
        .sort((a, b) => b.score - a.score);
        
io.to(roomId).emit('quiz-end', { leaderboard: finalLeaderboard, reason: 'host_ended' });

    if (currentRoomState.quizTimer) {
        clearTimeout(currentRoomState.quizTimer);
    }
    delete roomStates[roomId];
    delete roomUsers[roomId];
  });

  socket.on('submit-answer', ({ roomId, answer }) => {
    const rUsers = roomUsers[roomId];
    const rState = roomStates[roomId];
    const hostId = rState ? rState.hostId : null;

    if (!rUsers || !rState || !rState.questions) {
      console.log(`Submit answer for room ${roomId} by ${socket.id} ignored: no room users, state, or questions.`);
      return;
    }

    // Critical: Ensure host cannot submit answers
    if (socket.id === hostId) {
        console.log(`Host ${socket.id} in room ${roomId} attempted to submit an answer. Ignoring.`);
        // Optionally emit an error or info message to the host client if this happens
        // socket.emit('info', 'As host, you cannot submit answers.');
        return;
    }

    const player = rUsers.find(u => u.id === socket.id);
    if (!player) {
      console.log(`Submit answer for room ${roomId} by ${socket.id} ignored: player not found in room.`);
      return;
    }
    
    if (player.finishedQuiz) {
        console.log(`Player ${player.nickname} (${socket.id}) in room ${roomId} already finished. Ignoring answer.`);
        return;
    }

    const questionIndex = player.currentQuestionIndex;
    const currentQuestion = rState.questions[questionIndex];

    if (!currentQuestion) {
        console.log(`Player ${player.nickname} (${socket.id}) in room ${roomId} tried to answer non-existent question index ${questionIndex}.`);
        if (questionIndex >= rState.questions.length) {
            player.finishedQuiz = true;
            socket.emit('new-question', { finishedAllQuestions: true, finalScore: player.score, totalQuestions: rState.questions.length });
            io.to(roomId).emit('lobby-update', { users: rUsers.map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz})), hostId: rState.hostId });
            checkAllPlayersFinished(roomId);
        }
        return;
    }

    let correct = false;
    if (answer !== -1) { // -1 means skipped
      correct = (answer === currentQuestion.correctAnswer);
      if (correct) {
        player.score += 1;
      }
    }
    
    player.answers.push({ questionIndex, answer, correct });
    player.currentQuestionIndex += 1;
    
    console.log(`Player ${player.nickname} (${socket.id}) in room ${roomId} answered Q${questionIndex + 1}. Correct: ${correct}. New Score: ${player.score}. Next Q_idx: ${player.currentQuestionIndex}`);

    if (player.currentQuestionIndex < rState.questions.length) {
      const nextQuestion = rState.questions[player.currentQuestionIndex];
      socket.emit('new-question', {
        question: nextQuestion.question,
        options: nextQuestion.options,
        index: player.currentQuestionIndex + 1,
        total: rState.questions.length,
        finishedAllQuestions: false
      });
    } else {
      player.finishedQuiz = true;
      console.log(`Player ${player.nickname} (${socket.id}) finished all questions in room ${roomId}. Final score: ${player.score}`);
      socket.emit('new-question', { finishedAllQuestions: true, finalScore: player.score, totalQuestions: rState.questions.length });
      io.to(roomId).emit('lobby-update', { users: rUsers.map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz})), hostId: rState.hostId });
      checkAllPlayersFinished(roomId);
    }
    
    const leaderboardData = rUsers.map(u => ({ nickname: u.nickname, score: u.score, id: u.id, finishedQuiz: u.finishedQuiz })).sort((a, b) => b.score - a.score);
    io.to(roomId).emit('leaderboard', leaderboardData);
  });
  
  function checkAllPlayersFinished(roomId) {
    const currentRoomUsers = roomUsers[roomId];
    const currentRoomState = roomStates[roomId];

    if (!currentRoomUsers || !currentRoomState) return;

    // Check if all *participating* players have finished.
    // A player is participating if they are in roomUsers and not just a host observing (if that role is added).
    // For now, all users in roomUsers are considered participants.
    const allFinished = currentRoomUsers.every(user => user.finishedQuiz);

    if (allFinished) {
        console.log(`All players in room ${roomId} have finished the quiz.`);
        const finalLeaderboard = currentRoomUsers.map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz})).sort((a, b) => b.score - a.score);
        io.to(roomId).emit('quiz-end', { leaderboard: finalLeaderboard, reason: 'all_finished' });

        if (currentRoomState.quizTimer) {
            clearTimeout(currentRoomState.quizTimer);
        }
        // Clean up room
        delete roomStates[roomId];
        delete roomUsers[roomId];
    }
  }

  // Handle participant kick by host
  socket.on('kick', ({ roomId, userId }) => {
    const currentRoomUsers = roomUsers[roomId];
    const currentRoomState = roomStates[roomId]; // Get room state for hostId

    if (!currentRoomUsers || !currentRoomState || socket.id !== currentRoomState.hostId) { // Check against hostId from roomState
        console.log(`Kick attempt in room ${roomId} by ${socket.id} failed: not host or room not found.`);
        return;
    }
    
    const userToKick = currentRoomUsers.find(u => u.id === userId);
    if (!userToKick) {
        console.log(`Kick attempt in room ${roomId}: user ${userId} not found.`);
        return;
    }

    // If the user being kicked is the host themselves (should not happen via UI, but good to check)
    if (userId === currentRoomState.hostId && currentRoomUsers.length > 1) {
        // This logic might need to be more robust, e.g., assign new host
        console.log(`Host ${socket.id} attempted to kick themselves. This is not allowed if other players are present.`);
        // For now, just prevent self-kick if others are in room.
        // If host is the only one, kicking self effectively means leaving, which is handled by disconnect.
        return socket.emit('error', 'Host cannot kick themselves if other players are present.');
    }
    
    io.to(userId).emit('kicked');
    
    const userIndex = currentRoomUsers.findIndex(u => u.id === userId);
    if (userIndex > -1) {
        currentRoomUsers.splice(userIndex, 1);
    }

    const targetSocket = io.sockets.sockets.get(userId);
    if (targetSocket) targetSocket.leave(roomId);

    // If the kicked user was the host and they were the only one, or if new host logic is needed:
    if (userId === currentRoomState.hostId && currentRoomUsers.length > 0) {
        // Re-assign host to the next person in list
        currentRoomState.hostId = currentRoomUsers[0].id;
        console.log(`Host ${userId} was kicked (or left), new host is ${currentRoomState.hostId} in room ${roomId}`);
    } else if (currentRoomUsers.length === 0) {
        console.log(`Last user ${userId} (host) kicked/left room ${roomId}. Cleaning up room.`);
        if (currentRoomState.quizTimer) clearTimeout(currentRoomState.quizTimer);
        delete roomStates[roomId];
        delete roomUsers[roomId];
    }
    
    // Broadcast updated lobby
    io.to(roomId).emit('lobby-update', { users: currentRoomUsers.map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz})), hostId: currentRoomState.hostId });

    // If quiz was in progress and the kicked user hadn't finished, check if all remaining players have finished
    if (currentRoomState.quizStarted && !userToKick.finishedQuiz) {
        checkAllPlayersFinished(roomId); // This will also handle room cleanup if everyone else is done.
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (const roomId in roomUsers) {
      const usersInRoom = roomUsers[roomId];
      const userIndex = usersInRoom.findIndex(u => u.id === socket.id);

      if (userIndex !== -1) {
        const disconnectedUser = usersInRoom.splice(userIndex, 1)[0];
        console.log(`User ${disconnectedUser.nickname} (${socket.id}) disconnected from room ${roomId}`);

        const currentRoomState = roomStates[roomId];

        if (usersInRoom.length === 0 || socket.id === (currentRoomState ? currentRoomState.hostId : null)) {
          if (socket.id === (currentRoomState ? currentRoomState.hostId : null) && usersInRoom.length > 0) {
            console.log(`Host ${disconnectedUser.nickname} (${socket.id}) disconnected from room ${roomId}. Room still has other users but quiz data will be removed.`);
            // Optionally, you might want to notify other users that the host left and the quiz is ending.
            // io.to(roomId).emit('host-left-quiz-ending'); // Example notification
          } else if (usersInRoom.length === 0) {
            console.log(`Room ${roomId} is now empty. Cleaning up room state and quiz data.`);
          }

          if (currentRoomState && currentRoomState.quizTimer) {
            clearTimeout(currentRoomState.quizTimer);
          }
          delete roomUsers[roomId];
          delete roomStates[roomId];

          // Delete the specific quiz data from quizzes.json
          const quizzes = readQuizzes();
          if (quizzes[roomId]) {
            delete quizzes[roomId];
            const success = writeQuizzes(quizzes);
            if (success) {
              console.log(`Quiz data for room ${roomId} has been deleted from quizzes.json.`);
            } else {
              console.error(`Failed to delete quiz data for room ${roomId} from quizzes.json.`);
            }
          } else {
            console.log(`Quiz data for room ${roomId} not found in quizzes.json, no need to delete.`);
          }
          
          // If the host disconnected and there were other users, we might want to kick them or end the quiz for them.
          // For now, the room data is deleted, so new joins won't find it, and existing users might be left in a defunct room.
          // Consider adding logic here to gracefully handle remaining users if the host leaves.
          // For example, by emitting an event to clients to return to the main menu or show a message.
          if (socket.id === (currentRoomState ? currentRoomState.hostId : null) && usersInRoom.length > 0) {
            usersInRoom.forEach(user => {
              const targetSocket = io.sockets.sockets.get(user.id);
              if (targetSocket) {
                targetSocket.emit('error', 'The host has left the quiz. The quiz has ended.');
                targetSocket.leave(roomId); // Optionally force them to leave the socket.io room
              }
            });
            // Clear the usersInRoom array as we've processed them
            roomUsers[roomId] = []; 
          }


        } else {
          // If the disconnected user was the host, assign a new host (this part is now conditional)
          // This 'else' block now only runs if the disconnected user was NOT the host AND the room is NOT empty.
          let newHostId = currentRoomState ? currentRoomState.hostId : null; // Should still be the original host
          // No need to re-assign host if a non-host player leaves. Host remains the same.
          // if (socket.id === newHostId) { // This condition is problematic if hostId was already reassigned or if logic changes
          //   newHostId = usersInRoom[0].id; // New host is the next person in list
          //   if(currentRoomState) currentRoomState.hostId = newHostId; // Update roomState
          //   console.log(`Host ${socket.id} disconnected from room ${roomId}. New host is ${newHostId}.`);
          // }
          io.to(roomId).emit('lobby-update', { users: usersInRoom.map(u => ({id: u.id, nickname: u.nickname, score: u.score, finishedQuiz: u.finishedQuiz})), hostId: newHostId });
          
          // If quiz was in progress and disconnected user hadn't finished, check if this triggers quiz end
          if (currentRoomState && currentRoomState.quizStarted && !disconnectedUser.finishedQuiz) {
            checkAllPlayersFinished(roomId);
          }
        }
        break; 
      }
    }
  });
});

// Graceful shutdown logic
function gracefulShutdown() {
  console.log('\\\\nShutting down gracefully...');

  // 1. Delete quizzes.json
  const quizzesPath = QUIZ_DATA_FILE; // QUIZ_DATA_FILE is defined at the top of the file
  try {
    if (fs.existsSync(quizzesPath)) {
      console.log('Attempting to delete quizzes.json...');
      fs.unlinkSync(quizzesPath);
      console.log('quizzes.json has been deleted.');
    } else {
      console.log('quizzes.json not found, no need to delete.');
    }
  } catch (err) {
    console.error('Error deleting quizzes.json during shutdown:', err);
  }

  // 2. Delete package-lock.json
  // WARNING: Automatically deleting package-lock.json is generally not recommended.
  const packageLockPath = path.join(__dirname, 'package-lock.json');
  try {
    if (fs.existsSync(packageLockPath)) {
      console.log('Attempting to delete package-lock.json...');
      fs.unlinkSync(packageLockPath);
      console.log('package-lock.json has been deleted.');
    } else {
      console.log('package-lock.json not found, no need to delete.');
    }
  } catch (err) {
    console.error('Error deleting package-lock.json during shutdown:', err);
  }

  // Close the server and exit
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // Force exit after a timeout if server.close() hangs
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 3000); // 3-second timeout
}

// Listen for termination signals
process.on('SIGINT', gracefulShutdown); // Ctrl+C
process.on('SIGTERM', gracefulShutdown); // kill command

const PORT = process.env.PORT || 3000;
const HOST = '192.168.242.162'; // Added HOST constant

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
