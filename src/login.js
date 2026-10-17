"use strict";
document.querySelector("form").addEventListener("submit", async e => {
  e.preventDefault();
  const button = e.target.querySelector("button"); button.disabled = true;
  try {
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: e.target.elements.code.value.trim() }) });
    const data = await r.json();
    if (!data.ok) throw Error(data.error);
    location.replace("/");
  } catch (err) { document.querySelector("#error").textContent = err.message; }
  finally { button.disabled = false; }
});
