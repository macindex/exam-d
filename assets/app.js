// Activate tooltips when the plugin is available.
function activateTooltips() {
  if (window.jQuery && $.fn && typeof $.fn.tooltip === 'function') {
    $('[data-toggle="tooltip"]').tooltip();
  }
}

let appInitialized = false;
let countQuestions = 0;
let actualQuestion = { id: 0 };
let answers = [];
let questions = [];
const completionHistory = [];

const QUESTIONS_FILE = './quests.json';
const QUESTIONS_FALLBACK_PATHS = ['quests.json', '/quests.json'];

function byId(id) {
  return document.getElementById(id);
}

function getQuestionById(questionId) {
  return questions.find(question => question.id === questionId);
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function setHtml(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = value;
}

function updateSelectedAlternativeState(questionId) {
  const alternativesList = byId('alternativesList');
  if (!alternativesList) return;

  alternativesList
    .querySelectorAll('li.multi-choice-item')
    .forEach(item => item.classList.remove('selected-correct', 'selected-incorrect'));

  const question = getQuestionById(questionId);
  const selectedAnswer = answers.find(answer => answer.id === questionId);
  if (!question || !selectedAnswer) return;

  const selectedItem = byId(`q${selectedAnswer.selected}`)?.closest('li.multi-choice-item');
  if (!selectedItem) return;

  const isCorrect = question.alternatives[selectedAnswer.selected]?.correct === true;
  selectedItem.classList.add(isCorrect ? 'selected-correct' : 'selected-incorrect');
}

function updateAnswerFeedback(questionId) {
  const feedback = byId('answerFeedback');
  if (!feedback) return;

  const question = getQuestionById(questionId);
  const selectedAnswer = answers.find(answer => answer.id === questionId);

  if (!question || !selectedAnswer) {
    feedback.classList.add('d-none');
    feedback.classList.remove('text-success', 'text-danger', 'font-weight-bold');
    feedback.textContent = '';
    return;
  }

  const isCorrect = question.alternatives[selectedAnswer.selected]?.correct === true;
  feedback.classList.remove('d-none', 'text-success', 'text-danger');
  feedback.classList.add('font-weight-bold', isCorrect ? 'text-success' : 'text-danger');
  feedback.textContent = isCorrect ? 'Resposta correta.' : 'Resposta incorreta.';
}

function addQuestionsToAnswerArray(questionSelected) {
  const answerIndex = answers.findIndex(answer => answer.id === questionSelected.id);
  if (answerIndex === -1) {
    answers.push(questionSelected);
    return;
  }

  answers.splice(answerIndex, 1, questionSelected);
}

function getQuestionIndexById(questionId) {
  return questions.findIndex(question => question.id === questionId);
}

function restartQuiz() {
  shuffleQuestions();
  answers = [];
  countQuestions = getQuestionIndexById(1);
  if (countQuestions === -1) countQuestions = 0;
  getQuestion(countQuestions);
  updateNavigationButtons();
  actualQuestion.id = questions[countQuestions].id;
  updateProgressFeedback();
  closeResultModal();
}

function calculatePerformanceStats() {
  const totalQuestions = questions.length;
  const answeredQuestions = answers.length;
  let totalCorrectAnswers = 0;

  answers.forEach(answer => {
    const question = getQuestionById(answer.id);
    if (!question) return;

    if (question.alternatives[answer.selected]?.correct === true) {
      totalCorrectAnswers += 1;
    }
  });

  const totalIncorrectAnswers = answeredQuestions - totalCorrectAnswers;
  const unansweredQuestions = totalQuestions - answeredQuestions;
  const score = totalQuestions > 0 ? Math.floor((totalCorrectAnswers / totalQuestions) * 100) : 0;
  const correctPercentage = answeredQuestions > 0 ? Math.round((totalCorrectAnswers / answeredQuestions) * 100) : 0;
  const incorrectPercentage = answeredQuestions > 0 ? 100 - correctPercentage : 0;

  return {
    totalQuestions,
    answeredQuestions,
    totalCorrectAnswers,
    totalIncorrectAnswers,
    unansweredQuestions,
    score,
    correctPercentage,
    incorrectPercentage,
  };
}

function updateProgressFeedback() {
  const feedback = byId('progressFeedback');
  if (!feedback) return;

  const stats = calculatePerformanceStats();
  feedback.classList.remove('d-none');
  feedback.innerHTML =
    `Percentual de acertos: <strong>${stats.correctPercentage}%</strong> | ` +
    `Percentual de erros: <strong>${stats.incorrectPercentage}%</strong> ` +
    `(Respondidas: ${stats.answeredQuestions}/${stats.totalQuestions})`;
}

function loadCompletionHistory() {
  const stored = JSON.parse(localStorage.getItem('quizResults') || '[]');
  completionHistory.splice(0, completionHistory.length, ...stored);
}

function saveResult() {
  const stats = calculatePerformanceStats();
  const result = {
    timestamp: Date.now(),
    totalQuestions: stats.totalQuestions,
    answeredQuestions: stats.answeredQuestions,
    totalCorrectAnswers: stats.totalCorrectAnswers,
    totalIncorrectAnswers: stats.totalIncorrectAnswers,
    unansweredQuestions: stats.unansweredQuestions,
    score: stats.score,
    correctPercentage: stats.correctPercentage,
    incorrectPercentage: stats.incorrectPercentage,
  };

  completionHistory.push(result);
  localStorage.setItem('quizResults', JSON.stringify(completionHistory));
  console.log('Resultado salvo com sucesso!', result);
}

function renderAlternatives(question) {
  const alternativesList = byId('alternativesList');
  if (!alternativesList) return;

  alternativesList.innerHTML = '';

  question.alternatives.forEach((alternative, index) => {
    const letter = String.fromCharCode(65 + index);
    const item = document.createElement('li');
    item.className = 'multi-choice-item';
    item.innerHTML =
      `<span class="multi-choice-letter" data-choice-letter="${letter}">` +
      `<input type="radio" id="q${index}" name="selecao" aria-label="radio" />` +
      `<span id="alternative${index}">${alternative.description}</span>` +
      '</span>';
    alternativesList.appendChild(item);
  });

  const savedAnswer = answers.find(answer => answer.id === question.id);
  if (savedAnswer) {
    const selected = byId(`q${savedAnswer.selected}`);
    if (selected) selected.checked = true;
  }

  updateSelectedAlternativeState(question.id);
  updateAnswerFeedback(question.id);
  updateProgressFeedback();
}

function getQuestion(index) {
  const question = questions[index];
  if (!question) return;

  setText('#numQuestion', 'Questao #' + (index + 1));
  setHtml('#questao', question.text);
  renderAlternatives(question);
  actualQuestion.id = question.id;

  hideSolution();
  const correctIndex = question.alternatives.findIndex(alternative => alternative.correct === true);
  if (correctIndex >= 0) {
    const correctItem = document.querySelectorAll('#alternativesList li')[correctIndex];
    if (correctItem) correctItem.classList.add('correct-hidden');
  }
}

function updateNavigationButtons() {
  const prevBtn = byId('prevBtn');
  const nextBtn = byId('nextBtn');
  if (!prevBtn || !nextBtn) return;

  const isFirstQuestion = countQuestions === 0;
  const isLastQuestion = countQuestions === questions.length - 1;

  prevBtn.disabled = isFirstQuestion;
  prevBtn.classList.toggle('btn-secondary', isFirstQuestion);
  prevBtn.classList.toggle('btn-success', !isFirstQuestion);

  nextBtn.classList.remove('btn-danger', 'btn-success');
  nextBtn.classList.add(isLastQuestion ? 'btn-danger' : 'btn-success');
  nextBtn.textContent = isLastQuestion ? 'Concluir' : 'Next Question';
}

function openResultModal() {
  const modal = byId('exampleModal');
  if (!modal) return;

  modal.classList.add('show');
  modal.style.display = 'block';
  modal.removeAttribute('aria-hidden');
  document.body.classList.add('modal-open');

  let backdrop = byId('resultModalBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'resultModalBackdrop';
    backdrop.className = 'modal-backdrop fade show';
    document.body.appendChild(backdrop);
  }
}

function closeResultModal() {
  const modal = byId('exampleModal');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  document.body.classList.remove('modal-open');
  const backdrop = byId('resultModalBackdrop');
  if (backdrop) backdrop.remove();
}

function showScoreModal() {
  const stats = calculatePerformanceStats();
  
  // Salvar o resultado antes de exibir o modal
  saveResult();

  setHtml(
    '.modal-body',
    `Aproveitamento geral: <strong>${stats.score}%</strong><br>` +
    `Corretas: <strong>${stats.totalCorrectAnswers}</strong><br>` +
    `Incorretas: <strong>${stats.totalIncorrectAnswers}</strong><br>` +
    `Nao respondidas: <strong>${stats.unansweredQuestions}</strong>`
  );

  openResultModal();
}

async function loadQuestions() {
  const pathsToTry = [QUESTIONS_FILE, ...QUESTIONS_FALLBACK_PATHS];
  let lastError = null;

  for (const path of pathsToTry) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Falha ao carregar ${path}.`);
      }

      const payload = await response.json();
      const loadedQuestions = Array.isArray(payload) ? payload : payload.questions;

      if (!Array.isArray(loadedQuestions) || loadedQuestions.length === 0) {
        throw new Error(`Arquivo ${path} invalido ou vazio.`);
      }

      questions = loadedQuestions;
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Falha ao carregar as questoes.');
}

function shuffleQuestions() {
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
}

function startQuiz() {
  shuffleQuestions();
  countQuestions = 0;
  getQuestion(countQuestions);
  updateNavigationButtons();
  actualQuestion.id = questions[0].id;
  updateProgressFeedback();
  byId('startScreen')?.classList.add('d-none');
  byId('quizSection')?.classList.remove('d-none');
}

async function ensureQuestionsLoaded() {
  if (questions.length > 0) return true;

  try {
    await loadQuestions();
    setText('#startInfo', `Total de ${questions.length} questoes.`);
    return true;
  } catch (error) {
    console.error(error);
    const isFileProtocol = window.location.protocol === 'file:';
    setText(
      '#startInfo',
      isFileProtocol
        ? 'Nao foi possivel carregar quests.json no modo local. Abra com um servidor (ex.: Live Server).'
        : 'Nao foi possivel carregar as questoes agora. Clique em Iniciar novamente para tentar recarregar.'
    );
    return false;
  }
}

function bindEvents() {
  byId('startBtn')?.addEventListener('click', async () => {
    const loaded = await ensureQuestionsLoaded();
    if (!loaded) return;
    startQuiz();
  });

  byId('historyBtn')?.addEventListener('click', () => {
    window.location.href = 'results.html';
  });

  byId('prevBtn')?.addEventListener('click', () => {
    if (countQuestions <= 0) return;

    countQuestions -= 1;
    getQuestion(countQuestions);
    updateNavigationButtons();
  });

  byId('nextBtn')?.addEventListener('click', () => {
    if (questions.length === 0) return;

    if (countQuestions < questions.length - 1) {
      countQuestions += 1;
      getQuestion(countQuestions);
      updateNavigationButtons();
      return;
    }

    showScoreModal();
  });

  byId('alternativesList')?.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== 'selecao') return;

    const radioId = Number(target.id.replace('q', ''));
    addQuestionsToAnswerArray({ id: actualQuestion.id, selected: radioId });
    updateSelectedAlternativeState(actualQuestion.id);
    updateAnswerFeedback(actualQuestion.id);
    updateProgressFeedback();
  });

  byId('alternativesList')?.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const item = target.closest('li.multi-choice-item');
    if (!item) return;

    const radio = item.querySelector('input[type="radio"][name="selecao"]');
    if (!(radio instanceof HTMLInputElement)) return;

    if (!radio.checked) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  byId('resultCloseX')?.addEventListener('click', closeResultModal);
  byId('resultCloseBtn')?.addEventListener('click', closeResultModal);
  byId('restartBtn')?.addEventListener('click', restartQuiz);

  byId('exampleModal')?.addEventListener('click', event => {
    if (event.target === byId('exampleModal')) {
      closeResultModal();
    }
  });
}

async function initializeApp() {
  if (appInitialized) return;
  appInitialized = true;

  bindEvents();
  loadCompletionHistory();

  const startBtn = byId('startBtn');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.classList.remove('btn-secondary');
    startBtn.classList.add('btn-success');
  }

  try {
    await loadQuestions();
    setText('#startInfo', `Total de ${questions.length} questoes.`);
  } catch (error) {
    console.error(error);
    const isFileProtocol = window.location.protocol === 'file:';
    setText(
      '#startInfo',
      isFileProtocol
        ? 'Nao foi possivel carregar quests.json no modo local. Abra com um servidor (ex.: Live Server).'
        : 'Nao foi possivel carregar as questoes agora. Clique em Iniciar para tentar novamente.'
    );

    setHtml('#questao', 'Nao foi possivel carregar as questoes do arquivo quests.json.');
    setHtml('#alternativesList', '');

    byId('prevBtn')?.setAttribute('disabled', 'true');
    byId('nextBtn')?.setAttribute('disabled', 'true');
  }
}

function showSolution() {
  document.querySelector('.hide-solution')?.classList.remove('d-none');
  document.querySelectorAll('.correct-hidden').forEach(item => item.classList.add('correct-choice'));
  document.querySelector('.btn.reveal-solution')?.classList.add('d-none');
}

function hideSolution() {
  document.querySelector('.reveal-solution')?.classList.remove('d-none');
  document.querySelectorAll('.correct-hidden').forEach(item => item.classList.remove('correct-choice'));
  document.querySelector('.btn.hide-solution')?.classList.add('d-none');
}

window.showSolution = showSolution;
window.hideSolution = hideSolution;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
