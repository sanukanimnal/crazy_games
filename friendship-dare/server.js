const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware to parse JSON bodies from incoming requests
app.use(express.json());
// Serve static files (HTML, CSS, JS) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Define paths for the JSON data files
const QUIZZES_FILE = path.join(__dirname, 'quizzes.json');
const ANSWERS_FILE = path.join(__dirname, 'answers.json');

/**
 * Helper function to read a JSON file.
 * If the file doesn't exist, it creates it with default content.
 * @param {string} filePath - The path to the JSON file.
 * @param {object} defaultContent - The default content to write if the file doesn't exist.
 * @returns {object} The parsed JSON content.
 */
const readJsonFile = (filePath, defaultContent = {}) => {
    try {
        // Read the file synchronously and parse its content as JSON
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file not found (ENOENT error code), create it with default content
        if (error.code === 'ENOENT') {
            console.log(`File not found: ${filePath}. Creating with default content.`);
            fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
            return defaultContent;
        }
        // Log other errors during file reading
        console.error(`Error reading ${filePath}:`, error);
        return defaultContent; // Return default on other errors to prevent app crash
    }
};

/**
 * Helper function to write data to a JSON file.
 * @param {string} filePath - The path to the JSON file.
 * @param {object} data - The data object to write to the file.
 */
const writeJsonFile = (filePath, data) => {
    try {
        // Write the data object to the file as a pretty-printed JSON string
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        // Log any errors during file writing
        console.error(`Error writing ${filePath}:`, error);
    }
};

// Route to serve the quiz creation page (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to serve the quiz taking page (quiz.html)
app.get('/quiz.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'quiz.html'));
});

// Route to serve the quiz results page (result.html)
app.get('/result.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'result.html'));
});

// POST /create-quiz: Endpoint to receive and save new quiz data
app.post('/create-quiz', (req, res) => {
    const newQuiz = req.body; // Get the quiz data from the request body
    const quizzes = readJsonFile(QUIZZES_FILE, {}); // Read existing quizzes

    // Simple slug generator to create a URL-friendly unique ID for the quiz
    const slugify = (text) => {
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')           // Replace spaces with -
            .replace(/[^\w-]+/g, '')       // Remove all non-word characters
            .replace(/--+/g, '-')          // Replace multiple dashes with a single dash
            .replace(/^-+/, '')            // Trim dashes from the start
            .replace(/-+$/, '');           // Trim dashes from the end
    };

    // Generate a quiz ID based on the quiz title, with a fallback
    let quizId = slugify(newQuiz.quizTitle || 'untitled-quiz');
    let counter = 1;
    let originalQuizId = quizId;
    // Ensure the generated quiz ID is unique
    while (quizzes[quizId]) {
        quizId = `${originalQuizId}-${counter}`;
        counter++;
    }

    // Add the new quiz to the collection
    quizzes[quizId] = newQuiz;
    // Save the updated quizzes data back to the file
    writeJsonFile(QUIZZES_FILE, quizzes);

    // Send back a success response with the generated quiz ID
    res.json({ success: true, quizId: quizId });
});

// GET /quiz/:id: Endpoint to retrieve quiz data by its ID
app.get('/quiz/:id', (req, res) => {
    const quizId = req.params.id; // Get the quiz ID from the URL parameters
    const quizzes = readJsonFile(QUIZZES_FILE, {}); // Read all quizzes

    const quiz = quizzes[quizId]; // Find the specific quiz
    if (quiz) {
        res.json(quiz); // If found, send the quiz data
    } else {
        // If not found, send a 404 Not Found status with an error message
        res.status(404).json({ error: 'Quiz not found' });
    }
});

// POST /submit-answers: Endpoint to receive and save submitted quiz answers
app.post('/submit-answers', (req, res) => {
    const { quizId, friendName, answers } = req.body; // Destructure data from request body
    const allAnswers = readJsonFile(ANSWERS_FILE, {}); // Read existing answers
    const quizzes = readJsonFile(QUIZZES_FILE, {}); // Read quizzes to get correct answers

    // Initialize an empty array for this quiz's answers if it doesn't exist
    if (!allAnswers[quizId]) {
        allAnswers[quizId] = [];
    }

    // Calculate the score for the submitted answers
    let score = 0;
    const quizQuestions = quizzes[quizId] ? quizzes[quizId].questions : []; // Get questions for scoring
    answers.forEach((answer, index) => {
        // Check if a correct answer exists for this question
        if (quizQuestions[index] && quizQuestions[index].correct) {
            // Compare the friend's answer (case-insensitively) with the correct answer
            if (answer.toLowerCase() === quizQuestions[index].correct.toLowerCase()) {
                score++; // Increment score if correct
            }
        }
    });

    // Add the new answer entry (friend's name, answers, and calculated score)
    allAnswers[quizId].push({
        friend: friendName,
        answers: answers,
        score: score
    });

    // Save the updated answers data back to the file
    writeJsonFile(ANSWERS_FILE, allAnswers);
    // Send back a success response with the calculated score
    res.json({ success: true, score: score });
});

// GET /answers/:id: Endpoint to retrieve all answers for a specific quiz ID
app.get('/answers/:id', (req, res) => {
    const quizId = req.params.id; // Get the quiz ID from URL parameters
    const allAnswers = readJsonFile(ANSWERS_FILE, {}); // Read all answers
    const quizzes = readJsonFile(QUIZZES_FILE, {}); // Read quizzes to get question details

    const quizAnswers = allAnswers[quizId] || []; // Get answers for the specific quiz
    const quizData = quizzes[quizId]; // Get the original quiz data

    // If the quiz data itself is not found, return an error
    if (!quizData) {
        return res.status(404).json({ error: 'Quiz not found for these answers.' });
    }

    // Map through the submitted answers to include original questions and correct answers for context
    const answersWithQuestions = quizAnswers.map(answerEntry => {
        const detailedAnswers = answerEntry.answers.map((ans, idx) => {
            const question = quizData.questions[idx]; // Get the corresponding question
            return {
                question: question ? question.q : 'N/A', // Original question text
                friendAnswer: ans, // Friend's submitted answer
                correctAnswer: question ? question.correct : 'N/A' // Correct answer (if defined)
            };
        });
        return {
            friend: answerEntry.friend, // Friend's name
            score: answerEntry.score, // Calculated score
            detailedAnswers: detailedAnswers // Array of answers with question context
        };
    });

    // Send back the quiz title, creator, and the detailed answers
    res.json({
        quizTitle: quizData.quizTitle || 'Untitled Quiz',
        creator: quizData.creator || 'Unknown Creator',
        answers: answersWithQuestions
    });
});

// Start the server and listen for incoming requests on the specified PORT
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
