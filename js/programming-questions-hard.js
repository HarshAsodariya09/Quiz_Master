const programmingQuestionsHard = [
    {
        question: "What is the time complexity of inserting an element in a binary heap (min-heap or max-heap)?",
        options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
        correctAnswer: 1
    },
    {
        question: "What is the output of the following C++ code?\nint a = 5;\ncout << a++ << \" \" << ++a;",
        options: ["5 7", "6 7", "6 6", "5 6"],
        correctAnswer: 0
    },
    {
        question: "Which of these sorting algorithms has the best average case time complexity?",
        options: ["Insertion Sort", "Quick Sort", "Merge Sort", "Bubble Sort"],
        correctAnswer: 2
    },
    {
        question: "In Java, which concept allows multiple methods to have the same name but different parameters?",
        options: ["Method Overriding", "Abstraction", "Method Overloading", "Inheritance"],
        correctAnswer: 2
    },
    {
        question: "What will be the value of x in this Python snippet?\nx = [1, 2, 3]\ny = x\ny.append(4)",
        options: ["[1, 2, 3]", "[1, 2, 3, 4]", "Error", "[4, 1, 2, 3]"],
        correctAnswer: 1
    },
    {
        question: "What does the following SQL query do?\nSELECT COUNT(DISTINCT column_name) FROM table_name;",
        options: ["Counts all rows in the table", "Counts unique rows", "Counts all values in a column", "Counts unique values in a column"],
        correctAnswer: 3
    },
    {
        question: "In Big-O notation, what is the time complexity of the best case for binary search?",
        options: ["O(n)", "O(log n)", "O(1)", "O(n log n)"],
        correctAnswer: 2
    },
    {
        question: "In C, which operator is used to get the memory address of a variable?",
        options: ["*", "#", "@", "&"],
        correctAnswer: 3
    },
    {
        question: "In Git, what does the command git reset --hard HEAD~1 do?",
        options: ["Resets the last commit but keeps changes staged", "Removes the last commit and all changes", "Commits all pending changes", "Creates a new branch"],
        correctAnswer: 1
    },
    {
        question: "What is a dangling pointer in C?",
        options: ["A pointer pointing to a valid memory", "A pointer that points to null", "A pointer that points to freed memory", "A pointer not initialized"],
        correctAnswer: 2
    }
];

window.programmingQuestionsHard = programmingQuestionsHard;