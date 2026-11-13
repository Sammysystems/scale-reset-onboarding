(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const progress = document.querySelector(".scroll-progress");
  const masthead = document.querySelector(".masthead");
  const navLinks = Array.from(document.querySelectorAll('.masthead-sub nav a[href^="#"]'));

  const targets = navLinks
    .map((link) => ({ link, section: document.querySelector(link.hash) }))
    .filter((target) => target.section)
    .sort((a, b) => a.section.offsetTop - b.section.offsetTop);

  let frame = 0;

  function updateScroll() {
    frame = 0;
    const top = window.scrollY || document.documentElement.scrollTop;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, top / max)) : 0;

    if (progress) progress.style.setProperty("--scroll-progress", ratio.toFixed(4));
    if (masthead) masthead.classList.toggle("is-stuck", top > 24);

    let current = null;
    for (const target of targets) {
      if (target.section.getBoundingClientRect().top <= window.innerHeight * 0.38) {
        current = target;
      }
    }

    for (const link of navLinks) link.removeAttribute("aria-current");
    if (current && top > 240) current.link.setAttribute("aria-current", "true");
  }

  function onScroll() {
    if (frame) return;
    frame = window.requestAnimationFrame(updateScroll);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  updateScroll();

  const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));

  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );

    for (const item of revealItems) observer.observe(item);
  } else {
    for (const item of revealItems) item.classList.add("is-in");
  }

  const picker = document.querySelector(".picker");
  const cta = document.getElementById("hero-cta");
  const help = document.getElementById("picker-help");
  const status = document.getElementById("picker-status");
  if (!picker || !cta || !help || !status) return;

  const baseLabel = "Start the two-minute check";
  const baseHelp = "Pick one. You can change it in the check.";
  const labels = {
    "Replying to new enquiries": "Start with enquiries",
    "Booking appointments and reminders": "Start with bookings",
    "Invoices and payment chasing": "Start with invoices",
    "Onboarding new clients": "Start with onboarding"
  };

  function selected() {
    return picker.querySelector('input[name="focus"]:checked');
  }

  function sync() {
    const input = selected();
    if (!input) {
      cta.textContent = baseLabel;
      cta.href = "/start";
      help.textContent = baseHelp;
      status.textContent = "";
      return;
    }

    const value = input.value;
    cta.textContent = labels[value] || baseLabel;
    cta.href = "/start?focus=" + encodeURIComponent(value);
    help.textContent = "You picked this on the landing page. Change it in the check.";
    const chip = input.closest(".chip");
    status.textContent = (chip ? chip.textContent.trim() : "Option") + " selected. The check will start there.";
  }

  picker.addEventListener("change", sync);
  sync();
})();
