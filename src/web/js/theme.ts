// The theme button's response swaps in a new #theme carrying the chosen
// theme; mirror it onto <html data-theme>, which nimble maps to
// color-scheme. The server renders <html data-theme> on page loads.
document.addEventListener("hz:completed", () => {
  let theme = document.getElementById("theme")?.dataset.theme;
  if (theme && document.documentElement.dataset.theme !== theme) {
    document.documentElement.dataset.theme = theme;
  }
});
