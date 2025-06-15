// Test file to check if all question variables are loaded properly
console.log('Testing question variable loading...');

// Check all question variables
const expectedVars = [
    'sportsQuestionsEasy',
    'sportsQuestionsHard',
    'historyQuestionsEasy', 
    'historyQuestionsHard',
    'scienceQuestionsEasy',
    'scienceQuestionsHard',
    'programmingQuestionsEasy',
    'programmingQuestionsHard'
];

expectedVars.forEach(varName => {
    if (window[varName]) {
        console.log(`✅ ${varName}: ${window[varName].length} questions loaded`);
        console.log(`   First question: "${window[varName][0]?.question?.substring(0, 50)}..."`);
    } else {
        console.log(`❌ ${varName}: NOT LOADED`);
    }
});

// Test the mapping logic
function testMapping(category, difficulty) {
    const questionKey = `${category}Questions${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;
    const questions = window[questionKey];
    console.log(`\nTesting ${category} ${difficulty}:`);
    console.log(`  Key: ${questionKey}`);
    console.log(`  Found: ${questions ? questions.length + ' questions' : 'NOT FOUND'}`);
    if (questions && questions[0]) {
        console.log(`  Sample: "${questions[0].question.substring(0, 50)}..."`);
    }
}

// Test all combinations
['programming', 'history', 'science', 'sports'].forEach(category => {
    ['easy', 'hard'].forEach(difficulty => {
        testMapping(category, difficulty);
    });
});
