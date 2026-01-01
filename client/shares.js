const listEl = document.getElementById("share-list");
const countEl = document.getElementById("share-count");
const hintEl = document.getElementById("share-hint");

function render(shares) {
  listEl.innerHTML = "";
  if (!shares.length) {
    hintEl.textContent = "No shares yet.";
    countEl.textContent = "0";
    return;
  }
  countEl.textContent = `${shares.length} saved`;
  shares.forEach((s) => {
    const card = document.createElement("article");
    card.className = "card";
    const url = `${window.location.origin}/?share=${s.slug}`;
    card.innerHTML = `
      <h3>${s.question}</h3>
      <p class="status">${new Date(s.created_at).toLocaleString()}</p>
      <a href="${url}" target="_blank" rel="noreferrer">${url}</a>
    `;
    listEl.appendChild(card);
  });
}

async function loadShares() {
  try {
    const res = await fetch("/api/shares");
    if (!res.ok) throw new Error("Failed to load shares");
    const data = await res.json();
    render(data);
    hintEl.textContent = "";
  } catch (err) {
    console.error(err);
    hintEl.textContent = err.message || "Unable to load shares.";
  }
}

loadShares();
