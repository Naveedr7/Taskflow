/**
 * TaskFlow — script.js
 * =====================
 * Handles all task logic:
 *   - Data layer (localStorage read/write)
 *   - Rendering task cards
 *   - Add / Edit / Delete tasks
 *   - Drag-and-drop between columns
 * =====================
 */

/* ----------------------------------------------------------
   CONSTANTS
   ---------------------------------------------------------- */

/** localStorage key where all tasks are stored */
const STORAGE_KEY = 'taskflow_tasks';

/** Status identifiers that map 1-to-1 with column IDs */
const STATUSES = ['todo', 'inprogress', 'done'];

/** Priority configuration (display label + CSS class) */
const PRIORITY_MAP = {
  high:   { label: 'High',   className: 'priority-high'   },
  medium: { label: 'Medium', className: 'priority-medium' },
  low:    { label: 'Low',    className: 'priority-low'    },
};

/** Empty-state messages per column */
const EMPTY_MESSAGES = {
  todo:       'No tasks yet. Hit "+ Add Task" to get started.',
  inprogress: 'Nothing in progress right now.',
  done:       'No completed tasks yet.',
};

/** Empty-state icons */
const EMPTY_ICONS = {
  todo: '📋', inprogress: '⏳', done: '✅',
};

/* ----------------------------------------------------------
   STATE
   ---------------------------------------------------------- */

/** In-memory array of all task objects */
let tasks = [];

/** ID of the task currently being dragged */
let draggedId = null;

/** ID of the task about to be deleted (used by the confirm dialog) */
let pendingDeleteId = null;

/* ----------------------------------------------------------
   DATA HELPERS
   ---------------------------------------------------------- */

/** Load tasks from localStorage into the `tasks` array */
function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    tasks = stored ? JSON.parse(stored) : [];
  } catch {
    // If JSON is corrupted, start fresh
    tasks = [];
  }
}

/** Persist the current `tasks` array to localStorage */
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/** Return a simple unique ID (timestamp + random suffix) */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ----------------------------------------------------------
   RENDERING
   ---------------------------------------------------------- */

/**
 * Render all columns from the in-memory `tasks` array.
 * Each column is cleared and repopulated from scratch.
 */
function renderBoard() {
  STATUSES.forEach(status => {
    const list    = document.getElementById(`list-${status}`);
    const counter = document.getElementById(`count-${status}`);

    // Filter tasks belonging to this column
    const columnTasks = tasks.filter(t => t.status === status);

    // Update the count badge
    counter.textContent = columnTasks.length;

    // Clear the column list
    list.innerHTML = '';

    if (columnTasks.length === 0) {
      // Show a friendly empty state
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">${EMPTY_ICONS[status]}</span>
          <p>${EMPTY_MESSAGES[status]}</p>
        </div>
      `;
      return;
    }

    // Build and append each task card
    columnTasks.forEach(task => {
      const card = createCardElement(task);
      list.appendChild(card);
    });
  });
}

/**
 * Build a single task card DOM element for the given task object.
 * @param {Object} task - A task object from the `tasks` array
 * @returns {HTMLElement}
 */
function createCardElement(task) {
  const priority = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;

  const card = document.createElement('article');
  card.className = 'task-card';
  card.setAttribute('draggable', 'true');
  card.dataset.id = task.id;
  card.setAttribute('aria-label', `Task: ${task.title}`);

  card.innerHTML = `
    <div class="card-top">
      <span class="priority-badge ${priority.className}">${priority.label}</span>
      <div class="card-actions">
        <button class="card-btn edit"  title="Edit task"   data-id="${task.id}">✎</button>
        <button class="card-btn delete" title="Delete task" data-id="${task.id}">✕</button>
      </div>
    </div>
    <h3 class="card-title">${escapeHtml(task.title)}</h3>
    ${task.description
      ? `<p class="card-desc">${escapeHtml(task.description)}</p>`
      : ''
    }
  `;

  // Attach drag events directly on the element
  card.addEventListener('dragstart', onDragStart);
  card.addEventListener('dragend',   onDragEnd);

  // Edit button
  card.querySelector('.card-btn.edit').addEventListener('click', () => openEditModal(task.id));

  // Delete button — opens confirmation dialog
  card.querySelector('.card-btn.delete').addEventListener('click', () => openDeleteDialog(task.id));

  return card;
}

/**
 * Escape special HTML characters so task content cannot inject markup.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ----------------------------------------------------------
   TASK MODAL — Add / Edit
   ---------------------------------------------------------- */

const modalOverlay = document.getElementById('modalOverlay');
const taskForm     = document.getElementById('taskForm');
const modalTitle   = document.getElementById('modalTitle');
const editTaskId   = document.getElementById('editTaskId');
const titleInput   = document.getElementById('taskTitle');
const descInput    = document.getElementById('taskDesc');
const priorityInput = document.getElementById('taskPriority');
const statusInput  = document.getElementById('taskStatus');
const titleError   = document.getElementById('titleError');

/** Open the modal in "add new task" mode */
function openAddModal() {
  modalTitle.textContent = 'New Task';
  taskForm.reset();
  editTaskId.value = '';
  titleError.textContent = '';
  openModal(modalOverlay);
  titleInput.focus();
}

/**
 * Open the modal pre-filled with an existing task's data for editing.
 * @param {string} id - Task ID
 */
function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  modalTitle.textContent = 'Edit Task';
  editTaskId.value      = task.id;
  titleInput.value      = task.title;
  descInput.value       = task.description || '';
  priorityInput.value   = task.priority;
  statusInput.value     = task.status;
  titleError.textContent = '';

  openModal(modalOverlay);
  titleInput.focus();
}

/** Handle form submission (both add and edit) */
function handleFormSubmit(event) {
  event.preventDefault();

  // Simple client-side validation
  const title = titleInput.value.trim();
  if (!title) {
    titleError.textContent = 'Please enter a title for the task.';
    titleInput.focus();
    return;
  }

  const isEditing = !!editTaskId.value;

  if (isEditing) {
    // Update existing task
    const task = tasks.find(t => t.id === editTaskId.value);
    if (task) {
      task.title       = title;
      task.description = descInput.value.trim();
      task.priority    = priorityInput.value;
      task.status      = statusInput.value;
    }
  } else {
    // Create a new task and append to the array
    tasks.push({
      id:          generateId(),
      title,
      description: descInput.value.trim(),
      priority:    priorityInput.value,
      status:      statusInput.value,
    });
  }

  saveTasks();
  renderBoard();
  closeModal(modalOverlay);
}

/* ----------------------------------------------------------
   DELETE TASK
   ---------------------------------------------------------- */

const deleteOverlay = document.getElementById('deleteOverlay');

/** Open the confirm-delete dialog for a specific task */
function openDeleteDialog(id) {
  pendingDeleteId = id;
  openModal(deleteOverlay);
}

/** Called when the user confirms deletion */
function confirmDelete() {
  if (!pendingDeleteId) return;
  tasks = tasks.filter(t => t.id !== pendingDeleteId);
  pendingDeleteId = null;
  saveTasks();
  renderBoard();
  closeModal(deleteOverlay);
}

/* ----------------------------------------------------------
   MODAL UTILITIES
   ---------------------------------------------------------- */

function openModal(overlay) {
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(overlay) {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

/** Close any modal when clicking the dark backdrop */
function handleOverlayClick(event, overlay) {
  if (event.target === overlay) closeModal(overlay);
}

/* ----------------------------------------------------------
   DRAG AND DROP
   ---------------------------------------------------------- */

/**
 * Called when the user starts dragging a task card.
 * Stores the task ID and adds a visual class.
 */
function onDragStart(event) {
  draggedId = this.dataset.id;
  this.classList.add('dragging');
  // Required for Firefox compatibility
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedId);
}

/** Called when dragging ends (whether dropped or cancelled) */
function onDragEnd() {
  this.classList.remove('dragging');
  draggedId = null;

  // Remove all visual highlights from columns
  document.querySelectorAll('.task-list').forEach(list => {
    list.classList.remove('drag-active');
  });
  document.querySelectorAll('.column').forEach(col => {
    col.classList.remove('drag-over');
  });
}

/**
 * Wire up a column's task-list as a drop target.
 * @param {HTMLElement} list - The .task-list element
 * @param {string} status   - The column's status string
 */
function initDropZone(list, status) {
  const column = list.closest('.column');

  list.addEventListener('dragover', event => {
    event.preventDefault(); // Allow drop
    event.dataTransfer.dropEffect = 'move';
    list.classList.add('drag-active');
    column.classList.add('drag-over');
  });

  list.addEventListener('dragleave', event => {
    // Only remove highlight if truly leaving the list (not a child element)
    if (!list.contains(event.relatedTarget)) {
      list.classList.remove('drag-active');
      column.classList.remove('drag-over');
    }
  });

  list.addEventListener('drop', event => {
    event.preventDefault();
    list.classList.remove('drag-active');
    column.classList.remove('drag-over');

    if (!draggedId) return;

    // Move the task to the new column
    const task = tasks.find(t => t.id === draggedId);
    if (task && task.status !== status) {
      task.status = status;
      saveTasks();
      renderBoard();
    }
  });
}

/* ----------------------------------------------------------
   SEED DATA (shown only when no tasks are stored yet)
   ---------------------------------------------------------- */

/**
 * Populate a few example tasks the very first time the app loads
 * so the board looks useful rather than completely empty.
 */
function seedDefaultTasks() {
  if (tasks.length > 0) return; // Already has data, do nothing

  tasks = [
    {
      id:          generateId(),
      title:       'Design the new landing page',
      description: 'Create wireframes and high-fidelity mockups for the marketing team to review.',
      priority:    'high',
      status:      'todo',
    },
    {
      id:          generateId(),
      title:       'Set up CI/CD pipeline',
      description: 'Configure GitHub Actions to run tests and deploy to staging automatically.',
      priority:    'medium',
      status:      'todo',
    },
    {
      id:          generateId(),
      title:       'Refactor authentication module',
      description: 'Replace legacy JWT handling with the new secure token library.',
      priority:    'high',
      status:      'inprogress',
    },
    {
      id:          generateId(),
      title:       'Write unit tests for the API',
      description: 'Cover all /users and /tasks endpoints with Mocha + Chai.',
      priority:    'medium',
      status:      'inprogress',
    },
    {
      id:          generateId(),
      title:       'Update project README',
      description: 'Add setup instructions, environment variables, and contribution guidelines.',
      priority:    'low',
      status:      'done',
    },
  ];

  saveTasks();
}

/* ----------------------------------------------------------
   INITIALISATION
   ---------------------------------------------------------- */

/**
 * Main init function — called once the DOM is ready.
 * Sets up event listeners and renders the initial board.
 */
function init() {
  // Load persisted tasks (or seed defaults on first visit)
  loadTasks();
  seedDefaultTasks();

  // Render the board for the first time
  renderBoard();

  // -- Drag-and-drop: wire up each column's drop zone --
  STATUSES.forEach(status => {
    const list = document.getElementById(`list-${status}`);
    initDropZone(list, status);
  });

  // -- Header "Add Task" button --
  document.getElementById('openAddTaskModal')
    .addEventListener('click', openAddModal);

  // -- Task form submission --
  taskForm.addEventListener('submit', handleFormSubmit);

  // -- Close add/edit modal --
  document.getElementById('closeModal')
    .addEventListener('click', () => closeModal(modalOverlay));
  document.getElementById('cancelModal')
    .addEventListener('click', () => closeModal(modalOverlay));
  modalOverlay.addEventListener('click', e => handleOverlayClick(e, modalOverlay));

  // -- Close delete confirmation --
  document.getElementById('closeDeleteModal')
    .addEventListener('click', () => closeModal(deleteOverlay));
  document.getElementById('cancelDelete')
    .addEventListener('click', () => closeModal(deleteOverlay));
  document.getElementById('confirmDelete')
    .addEventListener('click', confirmDelete);
  deleteOverlay.addEventListener('click', e => handleOverlayClick(e, deleteOverlay));

  // -- Keyboard: close modals with Escape --
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (modalOverlay.classList.contains('open'))  closeModal(modalOverlay);
    if (deleteOverlay.classList.contains('open')) closeModal(deleteOverlay);
  });
}

// Kick everything off once the DOM is fully parsed
document.addEventListener('DOMContentLoaded', init);
