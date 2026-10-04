// Connect the exported design's prototype controls to the real application.
(() => {
  const heroInput = () => document.querySelector('#top input[aria-label="Your website"]');
  const coverageInput = () => document.querySelector('#cta input[aria-label="Your website"]');

  function websiteFrom(input) {
    const value = input?.value.trim() ?? "";
    if (!value) return "";

    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
        throw new Error("Invalid website");
      }
      input.setCustomValidity("");
      return url.toString();
    } catch {
      input.setCustomValidity("Enter a valid website, such as yourcompany.com.");
      input.reportValidity();
      return null;
    }
  }

  function freeBriefUrl() {
    const website = websiteFrom(heroInput());
    if (website === null) return null;
    if (!website) return "/register?tier=free";
    const next = `/onboarding/workspace?website=${encodeURIComponent(website)}`;
    return `/register?tier=free&next=${encodeURIComponent(next)}`;
  }

  function coverageUrl() {
    const website = websiteFrom(coverageInput());
    if (website === null) return null;
    return website ? `/pilot?website=${encodeURIComponent(website)}` : "/pilot";
  }

  function go(url) {
    if (url) window.location.assign(url);
  }

  document.addEventListener("input", (event) => {
    if (event.target === heroInput() || event.target === coverageInput()) {
      event.target.setCustomValidity("");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (event.target === heroInput()) {
      event.preventDefault();
      event.stopPropagation();
      go(freeBriefUrl());
    } else if (event.target === coverageInput()) {
      event.preventDefault();
      event.stopPropagation();
      go(coverageUrl());
    }
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest("button, a");
    if (!control) return;

    const label = control.textContent?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
    const href = control.getAttribute("href");
    const action = control.closest("[data-landing-action]")?.getAttribute("data-landing-action");
    let destination = null;

    if (action === "free-brief" || (!href && label === "build free brief")) destination = freeBriefUrl();
    else if (action === "coverage-review") destination = coverageUrl();
    else if (!href && label === "explore pro") destination = "/register?next=%2Fsettings%3Fupgrade%3Dpro";

    if (!destination) return;
    event.preventDefault();
    event.stopPropagation();
    go(destination);
  }, true);
})();
