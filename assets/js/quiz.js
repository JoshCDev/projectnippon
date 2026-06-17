(function () {
  "use strict";

  var questions, current = 0, score = 0, answered = false, finished = false;

  function loadJSON(path, success, failed) {
    var r = new XMLHttpRequest();
    r.open("GET", path, true);
    r.onreadystatechange = function () {
      if (r.readyState === 4) {
        if (r.status >= 200 && r.status < 300) {
          try { success(JSON.parse(r.responseText)); }
          catch (e) { failed(); }
        } else { failed(); }
      }
    };
    r.onerror = failed;
    r.send();
  }

  function pickRandom(arr, n) {
    var copy = arr.slice(), result = [], i, idx;
    for (i = 0; i < n && copy.length; i++) {
      idx = Math.floor(Math.random() * copy.length);
      result.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return result;
  }

  function $(sel) { return document.querySelector(sel); }

  function showQuestion() {
    var q = questions[current], i;
    answered = false;
    $("[data-quiz-form]").reset();
    $("[data-quiz-progress]").textContent = "Pertanyaan " + (current + 1) + " dari " + questions.length;
    $("[data-quiz-question]").textContent = q.question;
    $("[data-quiz-feedback]").textContent = "";
    $("[data-quiz-feedback]").removeAttribute("data-status");
    $("[data-quiz-next]").style.display = "none";

    var options = q.choices.map(function (choice, index) {
      return { text: choice, value: index };
    });
    for (i = options.length - 1; i > 0; i--) {
      var swap = Math.floor(Math.random() * (i + 1));
      var tmp = options[i];
      options[i] = options[swap];
      options[swap] = tmp;
    }
    var html = "";
    for (i = 0; i < options.length; i++) {
      html += "<label class=\"quiz-option\"><input type=\"radio\" name=\"answer\" value=\"" + options[i].value + "\"><span>" + options[i].text + "</span></label>";
    }
    $("[data-quiz-options]").innerHTML = html;
  }

  function checkAnswer(e) {
    e.preventDefault();
    if (answered) return;
    var selected = $("input[name='answer']:checked");
    if (!selected) {
      $("[data-quiz-feedback]").textContent = "Yuk, pilih jawaban dulu!";
      $("[data-quiz-feedback]").setAttribute("data-status", "warning");
      return;
    }
    answered = true;
    var val = Number(selected.value);
    var q = questions[current];

    var inputs = document.querySelectorAll("[data-quiz-options] input");
    for (var i = 0; i < inputs.length; i++) inputs[i].disabled = true;

    if (val === q.answer) {
      score++;
      $("[data-quiz-feedback]").textContent = "Benar! " + q.note;
      $("[data-quiz-feedback]").setAttribute("data-status", "correct");
    } else {
      $("[data-quiz-feedback]").textContent = "Yah, belum tepat. " + q.note;
      $("[data-quiz-feedback]").setAttribute("data-status", "wrong");
    }
    $("[data-quiz-next]").style.display = "";
  }

  function nextQuestion() {
    if (finished) return;
    current++;
    if (current >= questions.length) {
      showResults();
      return;
    }
    showQuestion();
  }

  function showResults() {
    finished = true;
    var cls = "", btnText = "";
    if (score === questions.length) { cls = "result-perfect"; btnText = "Main Lagi"; }
    else if (score >= 3) { cls = "result-good"; btnText = "Main Lagi"; }
    else { cls = "result-low"; btnText = "Coba Lagi"; }

    var msg = "";
    if (score === questions.length) msg = "Sempurna! Kamu benar-benar paham budaya Jepang.";
    else if (score >= 3) msg = "Bagus! Pengetahuanmu sudah cukup luas.";
    else msg = "Yuk belajar lagi, masih banyak yang bisa dieksplorasi!";

    $("[data-quiz-form]").classList.add(cls);
    $("[data-quiz-question]").innerHTML = "<span class=\"quiz-result-score\">" + score + "/" + questions.length + "</span>";
    $("[data-quiz-options]").innerHTML = "<p class=\"quiz-result-msg\">" + msg + "</p>";
    $("[data-quiz-feedback]").textContent = "";
    $("[data-quiz-feedback]").removeAttribute("data-status");
    $("[data-quiz-progress]").textContent = "";
    $("[data-quiz-form] button[type='submit']").style.display = "none";
    $("[data-quiz-next]").textContent = btnText;
    $("[data-quiz-next]").style.display = "";
    $("[data-quiz-next]").onclick = function () { location.reload(); };
  }

  function init() {
    var root = $("[data-quiz-root]");
    if (!root) return;
    loadJSON("assets/data/quiz.json", function (data) {
      questions = pickRandom(data.questions, 5);
      showQuestion();
      $("[data-quiz-form]").addEventListener("submit", checkAnswer);
      $("[data-quiz-next]").addEventListener("click", nextQuestion);
    }, function () {
      root.innerHTML = "<div class=\"error-state\">Kuis belum dapat dimuat. Pastikan situs dijalankan lewat server lokal.</div>";
    });
  }

  document.addEventListener("DOMContentLoaded", init);
}());
