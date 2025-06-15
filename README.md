# Quiz Master

Quiz Master is an interactive web application that allows users to test their knowledge through various quizzes. Users can participate in pre-built quizzes, create their own custom quizzes, or join quizzes hosted by others in real-time multiplayer rooms.

## Features

- **User Nicknames:** Users start by providing a nickname to identify themselves.
- **Multiple Game Modes:**
    - **Inbuilt Quiz:** Choose from predefined categories (Programming, Science, History, Sports) and difficulty levels (Easy, Hard).
    - **Create Quiz:** Hosts can create custom quizzes with their own questions, define quiz parameters like title, subject, difficulty, duration, number of questions, and whether late joins are allowed.
    - **Join Quiz:** Users can join existing quiz rooms using a unique room code.
- **Real-time Multiplayer Lobby:**
    - Displays a list of users in the room.
    - Shows who the host is.
    - Provides a shareable link/room code for others to join.
    - **Host Controls:**
        - Set a countdown timer before the quiz starts.
        - Define a global timer for the entire quiz duration.
        - Allow or disallow late participants once the quiz has begun.
        - Kick participants from the lobby/quiz.
        - Force end the quiz for all participants.
- **Interactive Quiz Interface:**
    - Displays current question number and total questions.
    - Progress bar to show quiz progression.
    - Options presented clearly for selection.
    - Navigation buttons (Previous, Confirm, Next - for single-player mode).
    - Real-time leaderboard updates during multiplayer quizzes.
- **Question Structure (for created quizzes):**
    - Question text.
    - Multiple choice options (typically 4).
    - Indication of the correct answer (for the system, not shown to players during the quiz).
- **Scoring and Results:**
    - Scores are calculated based on correct answers.
    - Final results and leaderboard are displayed at the end of the quiz.
- **Dynamic Theme:**
    - Toggle between light and dark mode for user preference.
- **Server-Side Logic (`server.js`):
    - Manages quiz creation, storage (in `quizzes.json`), and retrieval.
    - Handles real-time communication using Socket.IO for multiplayer features (joining rooms, lobby updates, quiz synchronization, answer submissions, leaderboard updates).
    - Manages room states, user connections, and disconnections.
    - **Graceful Shutdown & Data Cleanup:**
        - `quizzes.json` is cleared upon server shutdown (SIGINT/SIGTERM).
        - `package-lock.json` is deleted upon server shutdown.
        - Quiz data for a specific room is removed from `quizzes.json` when:
            - The host disconnects from the room.
            - All users disconnect from a room.
- **Styling and UI:**
    - Modern and responsive design.
    - Clear visual distinction for different sections and interactive elements.
    - Styled forms, buttons, and lobby components for a better user experience.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Real-time Communication:** Socket.IO
- **Data Storage:** File system (`quizzes.json`) for quiz data.
- **Utility:** `uuid` for generating unique room IDs.

## Project Structure

```
/
├── index.html               # Main HTML file for the application
├── package.json             # Project metadata and dependencies
├── Procfile                 # For Heroku deployment (if used)
├── quizzes.json             # Stores created quiz data (temporary, managed by server)
├── README.md                # This file
├── server.js                # Backend server logic
├── js/                      # Frontend JavaScript files
│   ├── history-questions-easy.js
│   ├── history-questions-hard.js
│   ├── programming-questions-easy.js
│   ├── programming-questions-hard.js
│   ├── quiz.js              # Core frontend quiz logic, Socket.IO interactions
│   ├── science-questions-easy.js
│   ├── science-questions-hard.js
│   ├── sports-questions-easy.js
│   ├── sports-questions-hard.js
│   ├── test-questions.js    # Example/template for question structure
│   └── theme.js             # Handles light/dark theme toggle
└── styles/                  # CSS files for styling
    ├── auth.css             # Styles for authentication/nickname section (if separated)
    ├── main.css             # General styles for layout, components, theme variables
    └── quiz.css             # Styles specific to the quiz interface
```

## Setup and Running

1.  **Prerequisites:**
    *   Node.js and npm installed.

2.  **Installation:**
    ```bash
    npm install
    ```

3.  **Running the Application:**
    ```bash
    npm start
    ```
    This will typically start the server on `http://localhost:3000` (or the port defined in `server.js`).

## How to Play

1.  Open the application in your web browser.
2.  Enter a nickname.
3.  **Choose a Mode:**
    *   **Inbuilt Quiz:** Select a category and difficulty, then start the quiz.
    *   **Create Quiz:** 
        *   Fill in the quiz metadata (title, subject, etc.).
        *   Add questions one by one, providing the question text, options, and marking the correct answer.
        *   Click "Generate & Share Quiz". You will receive a room code/link to share with others.
        *   You will be taken to the lobby as the host.
    *   **Join Quiz:** Enter the room code provided by a host and click "Join".
4.  **Lobby (for Create/Join modes):**
    *   Wait for other players if you are joining.
    *   If you are the host, configure settings (countdown, timer, late join) and click "Start Quiz" when ready.
5.  **During the Quiz:**
    *   Answer questions as they appear.
    *   In multiplayer, the leaderboard will update in real-time.
    *   The quiz ends when the timer runs out, all questions are answered, or the host ends it.
6.  **Results:** View your score and the final leaderboard.

## Key Functionalities Implemented

*   **Nickname Entry:** Users must provide a nickname before proceeding.
*   **Mode Selection:** Clear choices for inbuilt, create, or join quiz.
*   **Inbuilt Quiz Flow:** Category and difficulty selection, quiz execution, and results.
*   **Quiz Creation Flow:** Form for metadata, dynamic question adding, and room generation.
*   **Quiz Joining Flow:** Input for room code and joining the lobby.
*   **Lobby Management:** Display of users, host identification, shareable link.
*   **Host Controls:** Countdown, global timer, allow late join, start quiz, kick users, force end quiz.
*   **Real-time Quiz Sync:** Questions, answers, leaderboard updates are synced across clients.
*   **Individual Question Progression (Multiplayer):** Players answer questions at their own pace within the global timer.
*   **Score Calculation:** Points awarded for correct answers.
*   **Leaderboard:** Displayed during and after the quiz.
*   **Theme Toggle:** Light/dark mode.
*   **Data Persistence (Session-based for quizzes):** `quizzes.json` stores active quiz data, cleaned up on server/room events.
*   **Responsive Design:** UI adapts to different screen sizes.
*   **Error Handling:** Basic error messages for invalid actions (e.g., non-host trying to start quiz, room not found).

## Future Enhancements (Potential)

*   User accounts for saving scores and created quizzes.
*   More diverse question types (e.g., true/false, fill in the blanks).
*   Image/media support in questions.
*   More detailed analytics for quiz performance.
*   Public quiz library where users can share and play quizzes created by others.
