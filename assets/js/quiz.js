(function () {
  "use strict";

  var allQuestions = [];
  var quizQuestions = [];
  var currentNumber = 0;
  var score = 0;
  var answered = false;

  function loadJSON(path, success, failed) {
    var request = new XMLHttpRequest();
    request.open("GET", path + "?v=20260616-2", true);
    request.onreadystatechange = function () {
      if (request.readyState === 4) {
        if (request.status >= 200 && request.status < 300) {
          success(JSON.parse(request.responseText));
        } else {
          failed();
        }
      }
    };
    request.onerror = failed;
    request.send();
  }

  function shuffle(list) {
    var copy = list.slice();
    var i;
    var randomIndex;
    var temp;

    for (i = copy.length - 1; i > 0; i--) {
      randomIndex = Math.floor(Math.random() * (i + 1));
      temp = copy[i];
      copy[i] = copy[randomIndex];
      copy[randomIndex] = temp;
    }

    return copy;
  }

  function pickFiveQuestions() {
    var shuffled = shuffle(allQuestions);
    quizQuestions = shuffled.slice(0, 5);
    currentNumber = 0;
    score = 0;
    answered = false;
  }

  function getRoot() {
    return document.querySelector("[data-quiz-root]");
  }

  function setText(selector, text) {
    var node = document.querySelector(selector);
    if (node) {
      node.textContent = text;
    }
  }

  function updateScore() {
    setText("[data-quiz-score]", "Skor: " + score + "/" + quizQuestions.length);
  }

  function clearOptions() {
    var options = document.querySelector("[data-quiz-options]");
    while (options && options.firstChild) {
      options.removeChild(options.firstChild);
    }
  }

  function makeOption(text, value) {
    var label = document.createElement("label");
    var input = document.createElement("input");
    var span = document.createElement("span");

    label.className = "quiz-option";
    input.type = "radio";
    input.name = "quiz-answer";
    input.value = String(value);
    span.textContent = text;

    label.appendChild(input);
    label.appendChild(span);
    return label;
  }

  function showQuestion() {
    var question = quizQuestions[currentNumber];
    var options = document.querySelector("[data-quiz-options]");
    var form = document.querySelector("[data-quiz-form]");
    var i;

    if (!question || !options || !form) {
      return;
    }

    answered = false;
    form.reset();
    clearOptions();

    setText("[data-quiz-progress]", "Pertanyaan " + (currentNumber + 1) + " dari " + quizQuestions.length);
    setText("[data-quiz-question]", question.question);
    setText("[data-quiz-feedback]", "");

    for (i = 0; i < question.choices.length; i++) {
      options.appendChild(makeOption(question.choices[i], i));
    }

    updateScore();
  }

  function selectedAnswer() {
    var checked = document.querySelector("input[name='quiz-answer']:checked");
    if (checked) {
      return Number(checked.value);
    }
    return -1;
  }

  function checkAnswer(event) {
    var answer;
    var question;
    var feedback;

    event.preventDefault();

    if (answered) {
      return;
    }

    answer = selectedAnswer();
    feedback = document.querySelector("[data-quiz-feedback]");

    if (answer === -1) {
      feedback.textContent = "Pilih jawaban dulu.";
      feedback.setAttribute("data-status", "warning");
      return;
    }

    question = quizQuestions[currentNumber];
    answered = true;

    if (answer === question.answer) {
      score = score + 1;
      feedback.textContent = "Benar. " + question.note;
      feedback.setAttribute("data-status", "correct");
    } else {
      feedback.textContent = "Belum tepat. " + question.note;
      feedback.setAttribute("data-status", "wrong");
    }

    updateScore();
  }

  function nextQuestion() {
    if (quizQuestions.length === 0) {
      return;
    }

    currentNumber = currentNumber + 1;
    if (currentNumber >= quizQuestions.length) {
      currentNumber = 0;
    }

    showQuestion();
  }

  function restartQuiz() {
    pickFiveQuestions();
    showQuestion();
  }

  function initQuiz() {
    var root = getRoot();
    var form;
    var nextButton;
    var restartButton;

    if (!root) {
      return;
    }

    loadJSON("assets/data/quiz.json", function (data) {
      allQuestions = data.questions;
      restartQuiz();

      form = document.querySelector("[data-quiz-form]");
      nextButton = document.querySelector("[data-quiz-next]");
      restartButton = document.querySelector("[data-quiz-restart]");

      form.addEventListener("submit", checkAnswer);
      nextButton.addEventListener("click", nextQuestion);
      restartButton.addEventListener("click", restartQuiz);
    }, function () {
      root.innerHTML = "<div class=\"error-state\">Kuis belum dapat dimuat. Pastikan situs dijalankan lewat server lokal.</div>";
    });
  }

  document.addEventListener("DOMContentLoaded", initQuiz);
}());
