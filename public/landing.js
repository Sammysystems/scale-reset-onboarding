(function () {
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
