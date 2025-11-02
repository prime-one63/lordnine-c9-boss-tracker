import { db } from "./firebase.js";
import { ref, push, set, update, remove, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export function initBossList() {
  window.onerror = (msg, src, line, col, err) => {
    console.error("⚠️ JS Error:", msg, "at", line, ":", col, err);
  };

  const bossForm = document.getElementById("bossForm");
  const bossTable = document.querySelector("#bossTable tbody");
  const bossModal = new bootstrap.Modal(document.getElementById("bossModal"));

  const bossName = document.getElementById("bossName");
  const bossHour = document.getElementById("bossHour");
  const lastKilled = document.getElementById("lastKilled");
  const lastKilledField = document.getElementById("lastKilledField");
  const nextSpawn = document.getElementById("nextSpawn");
  const editKey = document.getElementById("editKey");
  const hourGroup = document.getElementById("hourGroup");
  const scheduleGroup = document.getElementById("scheduleGroup"); // ✅ Make sure your schedule div has this ID
  const bossSchedule = document.getElementById("bossSchedule"); // ✅ dropdown select
  const spawnHourType = document.getElementById("spawnHourType");
  const spawnScheduleType = document.getElementById("spawnScheduleType");

  // ✅ Utility: Convert stored timestamps into datetime-local inputs
  function toDatetimeLocalInput(stored) {
    if (!stored) return "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stored)) return stored;
    const d = new Date(stored);
    if (isNaN(d)) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ✅ Function: Compute next spawn (either by hour or by schedule)
  function calcNextSpawn() {
    const isHourBased = spawnHourType.checked;
    const isScheduleBased = spawnScheduleType.checked;
    const lastKilledVal = lastKilled.value;

    if (isHourBased) {
      const hours = parseFloat(bossHour.value);
      if (hours && lastKilledVal) {
        const d = new Date(lastKilledVal);
        d.setHours(d.getHours() + hours);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        nextSpawn.value = local;
      }
    } else if (isScheduleBased) {
      const schedule = bossSchedule.value;
      if (!schedule) return;
      const next = getNextScheduledSpawn(schedule);
      if (next) {
        const local = new Date(next.getTime() - next.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        nextSpawn.value = local;
      }
    }
  }

  // ✅ Event listeners for recalculation
  bossHour.addEventListener("input", calcNextSpawn);
  bossSchedule.addEventListener("change", calcNextSpawn);
  lastKilled.addEventListener("input", calcNextSpawn);
  spawnHourType.addEventListener("change", calcNextSpawn);
  spawnScheduleType.addEventListener("change", calcNextSpawn);

  // ✅ Function: Get next weekly occurrence from "Monday 11:30"
  function getNextScheduledSpawn(scheduleStr) {
    if (!scheduleStr) return null;
    const now = new Date();
    const [dayStr, timeStr] = scheduleStr.split(" ");
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayIndex = daysOfWeek.findIndex(d => d.toLowerCase() === dayStr.toLowerCase());
    if (dayIndex === -1 || !timeStr) return null;
    const [hour, minute] = timeStr.split(":").map(Number);

    let candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);
    let diff = dayIndex - candidate.getDay();
    if (diff < 0 || (diff === 0 && candidate <= now)) diff += 7;
    candidate.setDate(candidate.getDate() + diff);
    return candidate;
  }

  // ✅ Toggle Hour/Schedule UI
  function updateSpawnTypeUI() {
    if (spawnHourType.checked) {
      hourGroup.style.display = "block";
      lastKilledField.style.display = "block";
      scheduleGroup.style.display = "none";
      bossSchedule.value = "";
      // nextSpawn.value = "";
      // lastKilled.value = "";
    } else {
      lastKilledField.style.display = "none";
      hourGroup.style.display = "none";
      scheduleGroup.style.display = "block";
      bossHour.value = "";
      // nextSpawn.value = "";
      // lastKilled.value = "";
    }
    calcNextSpawn();
  }
  spawnHourType.addEventListener("change", updateSpawnTypeUI);
  spawnScheduleType.addEventListener("change", updateSpawnTypeUI);

  // ✅ Init display
  updateSpawnTypeUI();

  // ✅ Form submit handler
  bossForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const guildVal = document.getElementById("guild").value || "FACTION";
    const entry = {
      bossName: bossName.value.trim().toUpperCase(),
      bossHour: spawnHourType.checked ? bossHour.value : "",
      bossSchedule: spawnScheduleType.checked ? bossSchedule.value : "",
      lastKilled: lastKilled.value,
      nextSpawn: nextSpawn.value,
      guild: guildVal,
    };

    const key = editKey.value;
    if (key) await update(ref(db, "bosses/" + key), entry);
    else await set(push(ref(db, "bosses")), entry);

    bossForm.reset();
    nextSpawn.value = "";
    editKey.value = "";
    bossModal.hide();
  });

  // ✅ Table updates
  onValue(ref(db, "bosses"), (snapshot) => {
    bossTable.innerHTML = "";
    const bosses = [];

    snapshot.forEach((child) => {
      const key = child.key;
      const b = child.val();
      b._key = key;

      let ts = Date.parse(b.nextSpawn);
      if (b.bossSchedule && !b.bossHour) {
        const nextDate = getNextScheduledSpawn(b.bossSchedule);
        ts = nextDate ? nextDate.getTime() : Infinity;
        b.nextSpawn = nextDate ? nextDate.toLocaleString() : "--";
      }

      b._ts = isNaN(ts) ? Infinity : ts;
      bosses.push(b);
    });

    bosses.sort((a, b) => a._ts - b._ts);

    bosses.forEach((b) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${b.bossName || "Unknown"}</td>
        <td><span class="badge bg-secondary">${b.guild || "FFA"}</span></td>
        <td>${b.bossHour || b.bossSchedule || "--"}</td>
        <td>${b.lastKilled || "--"}</td>
        <td>${b.nextSpawn || "--"}</td>
        <td>
          <button class="btn btn-info btn-sm edit-btn" data-key="${b._key}">Edit</button>
          <button class="btn btn-warning btn-sm reset-btn" data-key="${b._key}">Reset</button>
          <button class="btn btn-danger btn-sm delete-btn" data-id="${b._key}">Delete</button>
        </td>`;
      bossTable.appendChild(tr);
    });

  document.getElementById("btnAdd").addEventListener("click", clearBossForm);

  function clearBossForm() {
    // Clear text inputs
    document.getElementById("bossName").value = "";
    document.getElementById("bossName").focus();

    // Clear select dropdowns
    const guildSelect = document.getElementById("guild");
    if (guildSelect) guildSelect.selectedIndex = 0;

    // Clear date/time picker
    const lastKilledInput = document.getElementById("lastKilled");
    if (lastKilledInput) lastKilledInput.value = "";

    // Clear next spawn display
    const nextSpawnInput = document.getElementById("nextSpawn");
    if (nextSpawnInput) nextSpawnInput.value = "";

    // Reset radio buttons (spawn type)
    const spawnTypeRadios = document.getElementsByName("spawnType");
    spawnTypeRadios.forEach(radio => (radio.checked = false));

    // Reset schedule dropdown
    const scheduleSelect = document.getElementById("schedule");
    if (scheduleSelect) scheduleSelect.selectedIndex = 0;

    console.log("Form cleared successfully!");
  }
    // --- EDIT BUTTON ---
    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const bossRef = ref(db, "bosses/" + key);
        const snap = await get(bossRef);
        if (!snap.exists()) return alert("⚠️ Boss not found!");
  
        const b = snap.val();
  
        // Fill modal form fields — convert stored strings to datetime-local format safely
        document.getElementById("bossName").value = b.bossName || "";
        document.getElementById("bossHour").value = b.bossHour || "";
  
        // Use helper to get correct datetime-local strings for the inputs
        document.getElementById("lastKilled").value = toDatetimeLocalInput(b.lastKilled);
        document.getElementById("nextSpawn").value = toDatetimeLocalInput(b.nextSpawn);
  
        document.getElementById("guild").value = b.guild || "FFA";
        document.getElementById("editKey").value = key;
  
        // IMPORTANT: DO NOT auto-recalculate nextSpawn here.
        // Let calcNextSpawn() only run when the user changes bossHour/lastKilled inputs.
        // This prevents overwriting a correct stored nextSpawn.
  
        const bossModal = new bootstrap.Modal(document.getElementById("bossModal"));
        bossModal.show();
      });
    });
  
    // Rebind Reset button events
    document.querySelectorAll(".reset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const bossRef = ref(db, "bosses/" + key);
        const snap = await get(bossRef);
        if (!snap.exists()) return alert("⚠️ Boss not found!");
  
        const entry = snap.val();
        if (!confirm(`Reset ${entry.bossName}?`)) return;
  
        const now = new Date();
        const nextSpawnTime = new Date(now.getTime() + entry.bossHour * 60 * 60 * 1000);
  
        await update(bossRef, {
          lastKilled: now.toISOString(),
          nextSpawn: nextSpawnTime.toISOString(),
        });
      });
    });
  
    // Rebind Delete button events
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (confirm("Delete this boss?")) {
          await remove(ref(db, "bosses/" + btn.dataset.id));
        }
      });
    });
  });
}
