(function () {
  function renderQuoteRequestResult() {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("quoteRequest");
    const message = url.searchParams.get("message");
    const caseId = url.searchParams.get("caseId");

    if (!status) return;

    const blocks = document.querySelectorAll(".quote-request-block");

    blocks.forEach((block) => {
      const result = block.querySelector(".quote-request-result");
      if (!result) return;

      if (status === "success") {
        result.innerHTML =
          '<div style="margin-top:12px;padding:12px;border:1px solid #bbf7d0;border-radius:8px;background:#f0fdf4;color:#166534;">' +
          (message || "Ihre Anfrage wurde erfolgreich gesendet.") +
          (caseId ? " Vorgangs-ID: " + caseId : "") +
          "</div>";
      } else {
        result.innerHTML =
          '<div style="margin-top:12px;padding:12px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;color:#b91c1c;">' +
          (message || "Die Anfrage konnte nicht gesendet werden.") +
          "</div>";
      }
    });

    const anchor = document.getElementById("quote-request");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    url.searchParams.delete("quoteRequest");
    url.searchParams.delete("message");
    url.searchParams.delete("caseId");

    const query = url.searchParams.toString();
    const cleanUrl = url.pathname + (query ? "?" + query : "") + (url.hash || "");

    window.history.replaceState({}, "", cleanUrl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderQuoteRequestResult);
  } else {
    renderQuoteRequestResult();
  }
})();