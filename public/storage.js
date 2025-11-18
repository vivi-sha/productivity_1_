/*FIRST — What is this file?

This file contains frontend functions that:

Talk to your backend (/api/tasks/...)
Send data (POST/PUT)
Get data (GET)
Delete data (DELETE)
These functions are used by your React/JS UI.*/


const API_BASE = "";

export async function loadTasksFromBackend(weekKey) {
  const res = await fetch(`${API_BASE}/api/tasks/${weekKey}`);
  if (!res.ok) return {};
  return await res.json();
}

export async function saveTasksToBackend(weekKey) {
  const days = window.tasksByWeek[weekKey] || {};

  await fetch(`${API_BASE}/api/tasks/${weekKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days })
  });
}

export async function deleteTaskFromBackend(weekKey, dayIndex, taskId) {
  const res = await fetch(`${API_BASE}/api/tasks/${weekKey}/${dayIndex}/${taskId}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error("Failed to delete task");
  return await res.json();
}

export async function updateTaskOnBackend(weekKey, dayIndex, taskId, text, status) {
  const res = await fetch(`${API_BASE}/api/tasks/${weekKey}/${dayIndex}/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, status })
  });
  if (!res.ok) throw new Error("Failed to update task");
  return await res.json();
}

export async function clearWeekOnBackend(weekKey) {
  await fetch(`${API_BASE}/api/tasks/${weekKey}`, { method: "DELETE" });
}

/*"Content-Type": "application/json"
= Telling backend “This request body contains JSON”.

It triggers express.json() to parse JSON into a real JS object.

Without it, backend cannot read your data.*/