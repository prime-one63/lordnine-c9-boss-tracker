import { db } from "./firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const navDashboard = document.getElementById("navDashboard");
const navBossList = document.getElementById("navBossList");
const dashboardSection = document.getElementById("dashboardSection");
const bossListContainer = document.getElementById("bossListContainer");
const dashboardCards = document.getElementById("dashboardCards");

const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

navToggle.addEventListener("click", () => {
  navLinks.classList.toggle("show");
});

let isAuthorized = false;

/* ======================
   🔹 NAVIGATION
====================== */
navDashboard.addEventListener("click", () => {
  navDashboard.classList.add("active");
  navBossList.classList.remove("active");
  dashboardSection.style.display = "block";
  bossListContainer.style.display = "none";
  fetchAndRenderBosses();
});

navBossList.addEventListener("click", async () => {
  if (!isAuthorized) {
    const entered = prompt("Enter admin access token:");
    if (!entered) return alert("❌ Invalid token");
    try {
      const snap = await get(ref(db, "tokens/" + entered.trim()));
      if (!snap.exists() || snap.val() !== true) return alert("❌ Invalid token");
      isAuthorized = true;
      alert("✅ Access granted!");
    } catch (err) {
      console.error(err);
      return alert("❌ Token check failed");
    }
  }

  navBossList.classList.add("active");
  navDashboard.classList.remove("active");
  dashboardSection.style.display = "none";
  bossListContainer.style.display = "block";

  if (!document.getElementById("bossListSection")) {
    const html = await (await fetch("bosslist.html")).text();
    bossListContainer.innerHTML = html;
    const { initBossList } = await import("./bosslist.js");
    initBossList();
  }
});

/* ======================
   🔹 HELPER FUNCTIONS
====================== */
function getNextScheduledSpawn(scheduleStr) {
  if (!scheduleStr) return null;
  const now = new Date();
  const daysOfWeek = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const schedules = scheduleStr.split(",").map(s => s.trim());
  let soonest = null;

  for (const entry of schedules) {
    const [dayStr, timeStr] = entry.split(" ");
    const dayIndex = daysOfWeek.findIndex(d => d.toLowerCase() === dayStr.toLowerCase());
    if (dayIndex === -1 || !timeStr) continue;
    const [hour, minute] = timeStr.split(":").map(Number);
    let candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);
    const diffDays = (dayIndex - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diffDays);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 7);
    if (!soonest || candidate < soonest) soonest = candidate;
  }
  return soonest;
}

function formatCountdown(targetDate) {
  const now = new Date();
  const diff = targetDate - now;
  if (diff <= 0) return "00 hrs : 00 mns : 00 secs";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return `${hours.toString().padStart(2, "0")} hrs : ${minutes.toString().padStart(2, "0")} mns : ${seconds.toString().padStart(2, "0")} secs`;
}

/* ======================
   🔹 DASHBOARD RENDER
====================== */
async function fetchAndRenderBosses() {
  try {
    const snapshot = await get(ref(db, "bosses"));
    if (!snapshot.exists()) {
      dashboardCards.innerHTML = "<p>No bosses found</p>";
      return;
    }

    const bosses = [];
    snapshot.forEach(childSnap => {
      const b = childSnap.val();
      b._key = childSnap.key;
      let ts = Date.parse(b.nextSpawn);
      if (isNaN(ts) && typeof b.nextSpawn === "string") ts = Date.parse(b.nextSpawn.replace(" ", "T"));
      if (b.bossSchedule && !b.bossHour) {
        const nextDate = getNextScheduledSpawn(b.bossSchedule);
        ts = nextDate ? nextDate.getTime() : Infinity;
        b.nextSpawn = nextDate ? nextDate.toISOString() : b.nextSpawn;
      }
      b._ts = isNaN(ts) ? Infinity : ts;
      bosses.push(b);
    });

    bosses.sort((a, b) => a._ts - b._ts);

    const now = new Date();
    const today = now.getDate();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const groups = { soon: [], today: [], tomorrow: [], later: [] };

    bosses.forEach(b => {
      const nextDate = new Date(b._ts);
      const diff = nextDate - now;

      // ✅ Stay in "Spawning Soon" if within 10 min before OR 5 min after spawn
      if (diff <= 10 * 60000 && diff > -5 * 60000) {
        groups.soon.push(b);
      } else if (nextDate.getDate() === today) {
        groups.today.push(b);
      } else if (nextDate.getDate() === tomorrow.getDate()) {
        groups.tomorrow.push(b);
      } else {
        groups.later.push(b);
      }
    });

    dashboardCards.innerHTML = "";

    const sections = [
      { label: "🕑 Spawning", color: "#66ff00ff", data: groups.soon },
      { label: "🌞 Today", color: "#007bff", data: groups.today },
      { label: "🌙 Tomorrow", color: "#6f42c1", data: groups.tomorrow },
      { label: "🌅 Coming Soon", color: "#e98e07ff", data: groups.later },
    ];

    sections.forEach(section => {
      if (section.data.length === 0) return;

      const sectionContainer = document.createElement("div");
      sectionContainer.style.marginBottom = "2rem";

      const header = document.createElement("h2");
      header.textContent = section.label;
      header.style.color = section.color;
      header.style.fontWeight = "800";
      header.style.fontSize = "1.3rem";
      header.style.margin = "10px 0";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.cursor = "pointer";
      header.style.padding = "8px 12px";
      header.style.borderBottom = `2px solid ${section.color}`;
      header.style.background = "rgba(0,0,0,0.05)";
      header.style.borderRadius = "6px";

      const toggle = document.createElement("span");
      toggle.textContent = "▼";
      toggle.style.transition = "transform 0.2s ease";
      header.appendChild(toggle);

      const grid = document.createElement("div");
      grid.className = "boss-grid";
      grid.style.margin = "10px auto";
      grid.style.padding = "0 10px";
      grid.style.overflow = "hidden";
      grid.style.transition = "max-height 0.4s ease, opacity 0.4s ease";
      grid.dataset.sectionColor = section.color; // 🔹 store the section color for later use

      section.data.forEach(b => grid.appendChild(createBossCard(b, section.color)));

      header.addEventListener("click", () => {
        if (grid.classList.contains("animating")) return; // prevent spam clicks
        grid.classList.add("animating");

        const isCollapsed = grid.classList.contains("collapsed");

        if (isCollapsed) {
          // --- EXPAND ---
          grid.classList.remove("collapsed");
          grid.style.display = "grid";
          const fullHeight = grid.scrollHeight + "px";
          grid.style.maxHeight = "0px";
          grid.offsetHeight; // force reflow
          grid.style.maxHeight = fullHeight;
          grid.style.opacity = "1";
          toggle.style.transform = "rotate(0deg)";

          setTimeout(() => {
            grid.style.maxHeight = "none";
            grid.classList.remove("animating");
          }, 400);
        } else {
          // --- COLLAPSE ---
          const fullHeight = grid.scrollHeight + "px";
          grid.style.maxHeight = fullHeight; // start from current height
          grid.offsetHeight; // force reflow
          grid.style.maxHeight = "0px";
          grid.style.opacity = "0";
          toggle.style.transform = "rotate(-90deg)";

          setTimeout(() => {
            grid.classList.add("collapsed");
            grid.classList.remove("animating");
            grid.style.display = "none";
          }, 400);
        }
      });


      sectionContainer.appendChild(header);
      sectionContainer.appendChild(grid);
      dashboardCards.appendChild(sectionContainer);
    });

  } catch (err) {
    console.error("Error loading bosses:", err);
    dashboardCards.innerHTML = "<p>Error loading bosses</p>";
  }

  function createBossCard(b, sectionColor = "#007bff") {
    const card = document.createElement("div");
    card.className = "boss-tile"; // CSS handles layout and responsiveness
    card.style.borderLeft = `6px solid ${sectionColor}`; // dynamic color only

    card.addEventListener("mouseenter", () => card.style.transform = "scale(1.03)");
    card.addEventListener("mouseleave", () => card.style.transform = "scale(1)");

    const bossImageMap = {
      VENATUS: "img/venatus.png", VIORENT: "img/viorent.png", EGO: "img/ego.png",
      LIVERA: "img/livera.png", ARANEO: "img/araneo.png", NEUTRO: "img/neutro.png",
      SAPHIRUS: "img/saphirus.png", THYMELE: "img/thymele.png", UNDOMIEL: "img/undomiel.png",
      WANNITAS: "img/wannitas.png", DUPLICAN: "img/duplican.png", METUS: "img/metus.png",
      AMENTIS: "img/amentis.png", CLEMANTIS: "img/clemantis.png", TITORE: "img/titore.png",
      GARETH: "img/gareth.png", LADYDALIA: "img/lady_dalia.png", GENAQULUES: "img/gen_aquleus.png",
      GENERALAQULES: "img/gen_aquleus.png", AURAQ: "img/auraq.png", MILAVY: "img/milavy.png",
      CHAIFLOCK: "img/chaiflock.png", RODERICK: "img/roderick.png", RINGOR: "img/ringor.png",
      BENJI: "img/benji.png",
    };

    const normalizedName = b.bossName?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
    const imgSrc = bossImageMap[normalizedName] || "img/default.png";

    const img = document.createElement("img");
    img.src = imgSrc;
    img.alt = b.bossName;
    img.className = "boss-tile-img"; // CSS handles width, height, object-fit
    card.appendChild(img);

    const info = document.createElement("div");
    info.className = "boss-tile-info"; // CSS handles padding and flex layout
    card.appendChild(info);

    // Guild badge
    const guild = b.guild || "FFA";
    const guildTag = document.createElement("span");
    guildTag.textContent = guild;
    guildTag.className = `guild-badge ${guild}`;
    info.appendChild(guildTag);

    // Boss title
    const title = document.createElement("h3");
    title.textContent = b.bossName || "Unknown";
    info.appendChild(title);

    // Countdown
    const nextDate = b._ts !== Infinity ? new Date(b._ts) : null;
    const countdown = document.createElement("span");
    countdown.className = "countdown";
    info.appendChild(countdown);

    // Spawn info
    const spawnDisplay = nextDate
      ? nextDate.toLocaleString([], { dateStyle: "short", timeStyle: "short" })
      : "--";

    const spawnInfo = document.createElement("p");
    spawnInfo.innerHTML = `<span style="color:#666; font-weight:bold">Spawn:</span> <strong>${spawnDisplay}</strong>`;
    info.appendChild(spawnInfo);

    // Countdown update interval
    if (nextDate) {
      const originalColor = sectionColor;
      setInterval(() => {
        const diff = nextDate - new Date();
        if (diff <= 0 && diff > -5 * 60000) {
          countdown.textContent = "SPAWNING NOW!";
          countdown.style.color = "red";
          card.style.borderLeftColor = "red";
        } else if (diff > 0 && diff <= 10 * 60000) {
          countdown.textContent = formatCountdown(nextDate);
          countdown.style.color = "#ff9900";
          card.style.borderLeftColor = "#ff9900";
        } else if (diff > 0) {
          countdown.textContent = formatCountdown(nextDate);
          countdown.style.color = originalColor;
          card.style.borderLeftColor = originalColor;
        } else {
          countdown.textContent = "Spawn Passed";
          countdown.style.color = "#777";
          card.style.borderLeftColor = "#777";
        }
      }, 1000);
    }

    return card;
  }

}

window.addEventListener("load", fetchAndRenderBosses);
document.addEventListener("visibilitychange", () => { if (!document.hidden) fetchAndRenderBosses(); });
