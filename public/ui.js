// public/ui.js
import { 
  saveTasksToBackend, 
  deleteTaskFromBackend, 
  updateTaskOnBackend 
} from "./storage.js";

// Helper: get Monday for the week
export function getPresentWeek(date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday;
}

// Format YYYY-MM-DD
export function formatWeekKey(date) {
  const monday = getPresentWeek(date);
  return monday.toISOString().split("T")[0];
}

// Helper: show loading/error messages
function showMessage(message, type = "info") {
  const msg = document.createElement("div");
  msg.textContent = message;
  msg.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 15px;
    border-radius: 5px;
    background-color: ${type === "error" ? "#ff6b6b" : "#4caf50"};
    color: white;
    font-weight: bold;
    z-index: 1000;
  `;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 3000);
}

// Main UI render function
export function updateWeekUI(tasksForWeek, weekKey) {
  // ensure globals
  window.currentWeekKey = weekKey;
  window.tasksByWeek[weekKey] = tasksForWeek || {};

  const monday = new Date(weekKey);

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);

    const dayDiv = document.getElementById("d" + (i + 1));
    if (!dayDiv) continue; // safe guard

    // Set date number (make sure .date exists)
    const dateEl = dayDiv.querySelector(".date");
    if (dateEl) dateEl.textContent = dayDate.getDate();

    // Remove old tasks (safe)
    const existingTasks = dayDiv.querySelectorAll(".task-card");
    existingTasks.forEach((t) => t.remove());

    // Render saved tasks
    if (window.tasksByWeek[weekKey] && window.tasksByWeek[weekKey][i]) {
      window.tasksByWeek[weekKey][i].forEach((taskData) => {
        const card = createTaskCard(
          taskData.text,
          taskData.status,
          taskData.id,
          i
        );
        dayDiv.appendChild(card);
      });
    }
  }

  // After rendering UI, ensure add-task buttons have listeners
  attachAddTaskListeners();
}

// Create task card element with delete and edit buttons. This function creates ONE task box/card in the UI.
export function createTaskCard(
  text = "",
  status = "default",
  id = null,
  dayIndex
) {
  const taskCard = document.createElement("div");
  taskCard.classList.add("task-card");

  const taskId = id || "task_" + Date.now() + Math.random().toString().slice(2);

  const st = (status || "default").toLowerCase().replace(" ", "-");
  taskCard.classList.add(st);
  taskCard.dataset.taskId = taskId;
  taskCard.dataset.dayIndex = dayIndex;

  const input = document.createElement("input");
  input.type = "text";
  input.value = text || "";
  input.placeholder = "Enter task";
  input.maxLength = 100;

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = "display: flex; gap: 5px; margin-top: 4px;";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = text ? "Edit" : "Save";
  saveBtn.dataset.mode = text ? "edit" : "save";
  saveBtn.style.cssText = "flex: 1; background-color: #4caf50; color: white;";

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete";
  deleteBtn.style.cssText = "flex: 1; background-color: #f44; color: white;";

  buttonContainer.appendChild(saveBtn);
  buttonContainer.appendChild(deleteBtn);

  const statusDiv = document.createElement("div");
  statusDiv.classList.add("status");

  const options = ["Completed", "Abandoned", "In Process"];
  options.forEach((opt) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "status_" + taskId;
    radio.value = opt;
    if (opt === status) radio.checked = true;

    // 🔹 Change color instantly when status changes
    radio.addEventListener("change", () => {
      const newStatus = radio.value.toLowerCase().replace(" ", "-");
      taskCard.classList.remove(
        "completed",
        "abandoned",
        "in-process",
        "default"
      );
      taskCard.classList.add(newStatus);// remove color and then add new color
    });

    label.appendChild(radio);
    label.appendChild(document.createTextNode(opt));
    statusDiv.appendChild(label);
  });

  // Initial display
  if (text) {
    const savedText = document.createElement("p");
    savedText.textContent = `${text} - ${status}`;
    taskCard.appendChild(savedText);
    statusDiv.querySelectorAll("input").forEach((r) => (r.disabled = true));
  } else {
    taskCard.appendChild(input);
  }

  taskCard.appendChild(buttonContainer);
  taskCard.appendChild(statusDiv);

  // Delete button handler
  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    deleteBtn.disabled = true;
    saveBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";

    try {
      const weekKey = window.currentWeekKey;
      const dayIdx = parseInt(taskCard.dataset.dayIndex);

      await deleteTaskFromBackend(weekKey, dayIdx, taskId);

      // Remove from local state
      if (window.tasksByWeek[weekKey] && window.tasksByWeek[weekKey][dayIdx]) {
        window.tasksByWeek[weekKey][dayIdx] = window.tasksByWeek[weekKey][dayIdx].filter(
          (t) => t.id !== taskId
        );
      }

      // Remove from DOM
      taskCard.remove();
      showMessage("Task deleted successfully", "success");
    } catch (err) {
      console.error("Delete error (will remove locally):", err);
      // Best-effort: if backend delete fails (e.g. task not yet persisted), remove locally
      try {
        const weekKey = window.currentWeekKey;
        const dayIdx = parseInt(taskCard.dataset.dayIndex);
        if (window.tasksByWeek[weekKey] && window.tasksByWeek[weekKey][dayIdx]) {
          window.tasksByWeek[weekKey][dayIdx] = window.tasksByWeek[weekKey][dayIdx].filter(
            (t) => t.id !== taskId
          );
        }
      } catch (e) { /* ignore */ }

      // Remove from DOM and show success (it's gone from UI/state)
      taskCard.remove();
      showMessage("Task removed", "success");
    }
  });

  // Save/Edit click handler
  saveBtn.addEventListener("click", async () => {
    const weekKey = window.currentWeekKey;
    const dayIdx = parseInt(taskCard.dataset.dayIndex);

    if (!window.tasksByWeek[weekKey]) window.tasksByWeek[weekKey] = {};
    if (!window.tasksByWeek[weekKey][dayIdx])
      window.tasksByWeek[weekKey][dayIdx] = [];

    if (saveBtn.dataset.mode === "save") {
      // Validate input
      const taskText = (
        taskCard.querySelector("input") || { value: "" }
      ).value.trim();

      if (!taskText) {
        showMessage("Task cannot be empty", "error");
        return;
      }

      const selectedRadio = statusDiv.querySelector(
        "input[type='radio']:checked"
      );
      const taskStatus = selectedRadio ? selectedRadio.value : "No status";

      deleteBtn.disabled = true;
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";

      try {
        // Determine if task already exists locally (and therefore likely on backend)
        const existingIndex = window.tasksByWeek[weekKey][dayIdx].findIndex(
          (t) => t.id === taskId
        );

        // If task is new (not present locally), add it locally first and POST the full week
        if (existingIndex === -1) {
          window.tasksByWeek[weekKey][dayIdx].push({
            id: taskId,
            text: taskText,
            status: taskStatus,
          });

          // Persist full week to backend (upsert)
          await saveTasksToBackend(weekKey);
        } else {
          // Existing task: update only that task on the backend
          await updateTaskOnBackend(weekKey, dayIdx, taskId, taskText, taskStatus);

          // Update local storage
          window.tasksByWeek[weekKey][dayIdx][existingIndex] = {
            id: taskId,
            text: taskText,
            status: taskStatus,
          };
        }

        // Update text on UI
        const savedText = document.createElement("p");
        savedText.textContent = `${taskText} - ${taskStatus}`;
        const existingInput = taskCard.querySelector("input");
        if (existingInput) taskCard.replaceChild(savedText, existingInput);

        statusDiv.querySelectorAll("input").forEach((r) => (r.disabled = true));

        saveBtn.dataset.mode = "edit";
        saveBtn.textContent = "Edit";

        showMessage("Task saved successfully", "success");
        deleteBtn.disabled = false;
        saveBtn.disabled = false;
      } catch (err) {
        console.error("Save error:", err);
        // If POST failed for a newly pushed local task, attempt to roll it back locally
        try {
          const idx = window.tasksByWeek[weekKey][dayIdx].findIndex((t) => t.id === taskId);
          if (idx !== -1 && window.tasksByWeek[weekKey][dayIdx][idx].text === taskText) {
            // remove the pushed item if it wasn't previously present
            // (best-effort rollback)
            window.tasksByWeek[weekKey][dayIdx].splice(idx, 1);
          }
        } catch (e) { /* ignore rollback errors */ }

        deleteBtn.disabled = false;
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
        showMessage("Failed to save task", "error");
      }
    } else {
      // Edit mode
      const pEl = taskCard.querySelector("p");
      const existingText = pEl ? pEl.textContent.split(" - ")[0] : "";
      const newInput = document.createElement("input");
      newInput.type = "text";
      newInput.value = existingText;
      newInput.maxLength = 100;
      taskCard.replaceChild(newInput, pEl);

      statusDiv.querySelectorAll("input").forEach((r) => (r.disabled = false));

      saveBtn.dataset.mode = "save";
      saveBtn.textContent = "Save";
      newInput.focus();
    }
  });

  return taskCard;
}

/* Attach add-task listeners to all day columns.
   We call this after every render so dynamically created days/buttons pick up handlers.
*/
function attachAddTaskListeners() {
  const addBtns = document.querySelectorAll(".add-task");
  addBtns.forEach((btn, idx) => {
    // remove existing listener first (prevent duplicate handlers)
    btn.replaceWith(btn.cloneNode(true));
  });

  // re-select after clone
  const freshBtns = document.querySelectorAll(".add-task");
  freshBtns.forEach((btn, idx) => {
    const dayIndex = idx; // idx 0->d1, idx 1->d2 ...
    btn.addEventListener("click", () => {
      const dayDiv = document.getElementById("d" + (dayIndex + 1));
      if (!dayDiv) return;
      const card = createTaskCard("", "default", null, dayIndex);
      dayDiv.appendChild(card);

      // Focus on input for better UX
      const input = card.querySelector("input");
      if (input) input.focus();

      // Initialize in memory
      if (!window.tasksByWeek[window.currentWeekKey])
        window.tasksByWeek[window.currentWeekKey] = {};
      if (!window.tasksByWeek[window.currentWeekKey][dayIndex])
        window.tasksByWeek[window.currentWeekKey][dayIndex] = [];
    });
  });
}
